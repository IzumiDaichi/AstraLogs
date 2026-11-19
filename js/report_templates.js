var REPORT_TEMPLATE_BUCKET = "report-templates";
var REPORT_TEMPLATE_MAX_SIZE = 2 * 1024 * 1024;
var DEFAULT_REPORT_PROMPT = `Program: {program}
Period: {date_from} to {date_to}
Entries (date | department | task | notes):
{entries}

Instructions:
1. period_covered: format the date range like "November 3–13, 2026".
2. specific_tasks: group the entries by type of work and write one imperative sentence per group (e.g. "Install, configure, and troubleshoot printers..."). Merge duplicates and use the notes to decide wording.
3. output: one past-tense sentence per group mirroring specific_tasks. End each with "Total: N <items>." Count from the entries and use notes for quantities. Never invent tasks or numbers not in the entries.`;
var reportTemplateLibraryPromises = {};

function setReportTemplateStatus(text, kind) {
  $("reportTemplateStatus").textContent = text;
  $("reportTemplateStatus").className = "message " + (kind || "");
}

function renderReportTemplateSettings(settings) {
  var template = settings && settings.template_path ? settings : null;
  $("myReportTemplateOption").disabled = !template;
  $("reportTemplateCurrent").textContent = template
    ? "Uploaded: " + template.template_name
    : "No custom template uploaded.";
  $("testReportTemplate").disabled = !template;
  $("removeReportTemplate").hidden = !template;
  $("reportTemplateMode").value = template && settings.use_custom_template ? "custom" : "default";
  $("printReportButton").textContent = settings.use_custom_template ? "Download to print" : "Print";
}

function loadReportTemplateLibrary(url, globalName) {
  if (window[globalName]) return Promise.resolve();
  if (reportTemplateLibraryPromises[url]) return reportTemplateLibraryPromises[url];
  reportTemplateLibraryPromises[url] = new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = function () {
      if (window[globalName]) resolve();
      else reject(new Error("The document renderer did not initialize."));
    };
    script.onerror = function () {
      delete reportTemplateLibraryPromises[url];
      reject(new Error("Could not load the document renderer. Check your internet connection and try again."));
    };
    document.head.appendChild(script);
  });
  return reportTemplateLibraryPromises[url];
}

async function ensureReportTemplateLibrary(type) {
  if (type === "docx") {
    await loadReportTemplateLibrary(
      "https://unpkg.com/docxtemplater@3.71.0/build/docxtemplater.js",
      "docxtemplater"
    );
    await loadReportTemplateLibrary(
      "https://unpkg.com/pizzip@3.2.0/dist/pizzip.js",
      "PizZip"
    );
    return;
  }
  if (type === "xlsx") {
    await loadReportTemplateLibrary(
      "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
      "ExcelJS"
    );
    return;
  }
  throw new Error("Only DOCX and XLSX templates are supported.");
}

function currentReportTemplateData(report) {
  var tasks = report.specific_tasks.slice();
  var outputs = report.output.slice();
  return {
    name: profile ? profile.nickname : "",
    id_no: "",
    office: profile ? profile.myDept : "",
    program: window.aiIntegrationSettings && window.aiIntegrationSettings.program ||
      "Government Internship Program (GIP)",
    supervisor: "",
    period: report.period_covered,
    tasks_text: tasks.join("\n"),
    outputs_text: outputs.join("\n"),
    date_printed: new Date().toLocaleDateString(),
    tasks: tasks,
    outputs: outputs
  };
}

function findTemplateTags(text, supportedTags, supportedLoops) {
  var unknown = new Set();
  var expression = /\{([#/^]?)([^{}]+)\}/g;
  var match;
  while ((match = expression.exec(text)) !== null) {
    var name = match[2].trim();
    if (name === "." && supportedLoops) continue;
    if ((match[1] === "#" || match[1] === "/" || match[1] === "^") &&
        supportedLoops && (name === "tasks" || name === "outputs")) continue;
    if (!supportedTags.has(name)) unknown.add(name);
  }
  if (/[{}]/.test(text.replace(expression, ""))) unknown.add("unclosed brace");
  return Array.from(unknown);
}

function validateDocxTags(zip) {
  var supportedTags = new Set([
    "name", "id_no", "office", "program", "supervisor", "period",
    "tasks_text", "outputs_text", "date_printed", "tasks", "outputs", "."
  ]);
  var unknown = new Set();
  var foundPlaceholder = false;
  var xmlFiles = Object.keys(zip.files).filter(function (name) {
    return /^word\/[^/]+\.xml$/i.test(name);
  });
  xmlFiles.forEach(function (name) {
    var file = zip.file(name);
    if (!file) return;
    var xml = file.asText();
    if (/\{[^{}]+\}/.test(xml)) foundPlaceholder = true;
    findTemplateTags(xml, supportedTags, true).forEach(function (tag) {
      unknown.add(tag);
    });
  });
  if (!foundPlaceholder) {
    throw new Error("Template error. No placeholders were found in the Word document.");
  }
  if (unknown.size) {
    throw new Error("Unknown or misspelled placeholder(s): " +
      Array.from(unknown).map(function (tag) { return "{" + tag + "}"; }).join(", ") +
      ". Placeholders are case-sensitive.");
  }
}

async function renderDocxTemplate(arrayBuffer, data) {
  await ensureReportTemplateLibrary("docx");
  try {
    var zip = new window.PizZip(arrayBuffer);
    validateDocxTags(zip);
    var documentTemplate = new window.docxtemplater(zip, {
      delimiters: { start: "{", end: "}" },
      paragraphLoop: true,
      linebreaks: true
    });
    documentTemplate.render(data);
    return documentTemplate.toBlob();
  } catch (error) {
    if (error && error.message && /placeholder/i.test(error.message)) throw error;
    throw new Error("Template error. Check that placeholders are spelled correctly and are not split across Word formatting runs.");
  }
}

function replaceSheetPlaceholders(value, data) {
  var supportedTags = new Set([
    "name", "id_no", "office", "program", "supervisor", "period",
    "tasks_text", "outputs_text", "date_printed"
  ]);
  var unknown = new Set();
  var output = value.replace(/\{([^{}]+)\}/g, function (placeholder, rawName) {
    var name = rawName.trim();
    if (!supportedTags.has(name)) {
      unknown.add(name);
      return placeholder;
    }
    return data[name];
  });
  if (/[{}]/.test(output.replace(/\{[^{}]+\}/g, ""))) unknown.add("unclosed brace");
  if (unknown.size) {
    throw new Error("Unknown or misspelled placeholder(s): " +
      Array.from(unknown).map(function (tag) { return "{" + tag + "}"; }).join(", ") +
      ". Placeholders are case-sensitive.");
  }
  return output;
}

async function renderXlsxTemplate(arrayBuffer, data) {
  await ensureReportTemplateLibrary("xlsx");
  try {
    var workbook = new window.ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    var foundPlaceholder = false;
    workbook.worksheets.forEach(function (worksheet) {
      worksheet.eachRow(function (row) {
        row.eachCell(function (cell) {
          if (typeof cell.value === "string") {
            if (/\{[^{}]+\}/.test(cell.value)) foundPlaceholder = true;
            cell.value = replaceSheetPlaceholders(cell.value, data);
          } else if (cell.value && Array.isArray(cell.value.richText)) {
            cell.value.richText.forEach(function (run) {
              if (/\{[^{}]+\}/.test(run.text)) foundPlaceholder = true;
              run.text = replaceSheetPlaceholders(run.text, data);
            });
          }
        });
      });
    });
    if (!foundPlaceholder) {
      throw new Error("Template error. No placeholders were found in the workbook.");
    }
    var output = await workbook.xlsx.writeBuffer();
    return new Blob([output], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
  } catch (error) {
    if (error && error.message && /placeholder/i.test(error.message)) throw error;
    throw new Error("Template error. Check that the workbook is valid and placeholders are in regular cells.");
  }
}

async function renderReportTemplate(blob, type, report, dataOverride) {
  var data = dataOverride || currentReportTemplateData(report);
  var arrayBuffer = await blob.arrayBuffer();
  return type === "docx"
    ? renderDocxTemplate(arrayBuffer, data)
    : renderXlsxTemplate(arrayBuffer, data);
}

function downloadReportBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function safeFileBase(filename) {
  return String(filename || "report")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "report";
}

async function downloadFilledReport(report) {
  var settings = window.aiIntegrationSettings || {};
  if (settings.use_custom_template && settings.template_path) {
    setReportPreviewStatus("Filling your report template...");
    try {
      var result = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).download(settings.template_path);
      if (result.error) throw result.error;
      var blob = await renderReportTemplate(result.data, settings.template_type, report);
      var filename = safeFileBase(settings.template_name) + "-filled." + settings.template_type;
      downloadReportBlob(blob, filename);
      setReportPreviewStatus("Filled report downloaded.");
    } catch (error) {
      setReportPreviewStatus(error.message || "Could not fill the report template.", "err");
    }
    return;
  }

  var html = buildDefaultReportHtml(report);
  downloadReportBlob(new Blob([html], { type: "text/html;charset=utf-8" }), "astralogs-report.html");
  setReportPreviewStatus("Default report downloaded as HTML. Open it in a browser to print.");
}

function escapeReportHtml(value) {
  return String(value).replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function buildDefaultReportHtml(report) {
  var data = currentReportTemplateData(report);
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<title>AstraLogs accomplishment report</title><style>" +
    "body{font:16px/1.5 Arial,sans-serif;color:#111;max-width:850px;margin:40px auto;padding:0 24px}" +
    "h1{font-size:24px;text-align:center}h2{font-size:18px;margin-top:24px}" +
    "p,li{white-space:pre-wrap}.meta{margin:28px 0}.printed{text-align:right;margin-top:40px;color:#555}" +
    "@media print{body{margin:0 auto;padding:0 12mm}}</style></head><body>" +
    "<h1>Accomplishment Report</h1><div class=\"meta\">" +
    "<p><strong>Name:</strong> " + escapeReportHtml(data.name) + "</p>" +
    "<p><strong>Office:</strong> " + escapeReportHtml(data.office) + "</p>" +
    "<p><strong>Program:</strong> " + escapeReportHtml(data.program) + "</p>" +
    "<p><strong>Period Covered:</strong> " + escapeReportHtml(data.period) + "</p></div>" +
    "<h2>Specific Tasks</h2><ul>" + report.specific_tasks.map(function (line) {
      return "<li>" + escapeReportHtml(line) + "</li>";
    }).join("") + "</ul><h2>Outputs</h2><ul>" + report.output.map(function (line) {
      return "<li>" + escapeReportHtml(line) + "</li>";
    }).join("") + "</ul><p class=\"printed\">Date printed: " +
    escapeReportHtml(data.date_printed) + "</p></body></html>";
}

async function sampleReportTemplate() {
  var settings = window.aiIntegrationSettings || {};
  var report = {
    period_covered: "November 3–13, 2026",
    specific_tasks: ["Install and configure printers."],
    output: ["Installed and configured 2 printers. Total: 2 printers."]
  };
  var template = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).download(settings.template_path);
  if (template.error) throw template.error;
  var sampleData = {
    name: "Sample Intern",
    id_no: "",
    office: "Sample Office",
    program: "Government Internship Program (GIP)",
    supervisor: "",
    period: report.period_covered,
    tasks_text: report.specific_tasks.join("\n"),
    outputs_text: report.output.join("\n"),
    date_printed: new Date().toLocaleDateString(),
    tasks: report.specific_tasks,
    outputs: report.output
  };
  var filled = await renderReportTemplate(template.data, settings.template_type, report, sampleData);
  downloadReportBlob(
    filled,
    "test-" + safeFileBase(settings.template_name) + "." + settings.template_type
  );
}

$("uploadReportTemplate").addEventListener("click", async function () {
  var file = $("reportTemplateFile").files[0];
  if (!file) {
    setReportTemplateStatus("Choose a .docx or .xlsx file first.", "err");
    return;
  }
  var extension = file.name.split(".").pop().toLowerCase();
  if (extension !== "docx" && extension !== "xlsx") {
    setReportTemplateStatus("Only Word .docx and Excel .xlsx files are supported.", "err");
    return;
  }
  if (file.size > REPORT_TEMPLATE_MAX_SIZE) {
    setReportTemplateStatus("The template must be 2 MB or smaller.", "err");
    return;
  }
  var uploadButton = $("uploadReportTemplate");
  uploadButton.disabled = true;
  setReportTemplateStatus("Checking and uploading template...");
  var uploadedPath = null;
  try {
    var bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error("This file is not a valid .docx or .xlsx archive.");
    }
    if (!currentUser) throw new Error("Sign in again before uploading a template.");
    var path = currentUser.id + "/report-template-" + createOfflineId() + "." + extension;
    var previous = window.aiIntegrationSettings || {};
    var storageResult = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).upload(path, file, {
      upsert: true,
      contentType: extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    if (storageResult.error) throw storageResult.error;
    uploadedPath = path;
    var settings = await requestIntegrationApi("/api/integrations", "PUT", {
      template_path: path,
      template_name: file.name,
      template_type: extension,
      use_custom_template: true
    });
    uploadedPath = null;
    renderIntegrationSettings(settings);
    $("reportTemplateFile").value = "";
    if (previous.template_path && previous.template_path !== path) {
      var removed = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).remove([previous.template_path]);
      if (removed.error) {
        setReportTemplateStatus("Template uploaded, but the previous file could not be removed: " + removed.error.message, "err");
        return;
      }
    }
    setReportTemplateStatus("Template uploaded. Test it to check the placeholders and layout.");
  } catch (error) {
    var message = error.message || "Could not upload the template.";
    if (uploadedPath) {
      try {
        var cleanup = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).remove([uploadedPath]);
        if (cleanup.error) message += " The incomplete upload could not be removed: " + cleanup.error.message;
      } catch (cleanupError) {
        message += " The incomplete upload could not be removed: " + cleanupError.message;
      }
    }
    setReportTemplateStatus(message, "err");
  } finally {
    uploadButton.disabled = false;
  }
});

$("testReportTemplate").addEventListener("click", async function () {
  var button = $("testReportTemplate");
  button.disabled = true;
  setReportTemplateStatus("Testing template and preparing a sample download...");
  try {
    await sampleReportTemplate();
    setReportTemplateStatus("Template test passed. Review the downloaded sample.");
  } catch (error) {
    setReportTemplateStatus(error.message || "Template test failed.", "err");
  } finally {
    button.disabled = false;
  }
});

$("removeReportTemplate").addEventListener("click", async function () {
  var settings = window.aiIntegrationSettings || {};
  if (!settings.template_path || !window.confirm("Remove your uploaded report template?")) return;
  var button = $("removeReportTemplate");
  button.disabled = true;
  setReportTemplateStatus("Removing template...");
  try {
    var updated = await requestIntegrationApi("/api/integrations", "PUT", {
      template_path: null,
      template_name: null,
      template_type: null,
      use_custom_template: false
    });
    renderIntegrationSettings(updated);
    var result = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).remove([settings.template_path]);
    if (result.error) {
      setReportTemplateStatus("Template settings were cleared, but the stored file could not be removed: " + result.error.message, "err");
      return;
    }
    setReportTemplateStatus("Custom template removed. The default report will be used.");
  } catch (error) {
    setReportTemplateStatus(error.message || "Could not remove the template.", "err");
  } finally {
    button.disabled = false;
  }
});

$("reportTemplateMode").addEventListener("change", async function () {
  var settings = window.aiIntegrationSettings || {};
  var useCustom = $("reportTemplateMode").value === "custom";
  if (useCustom && !settings.template_path) {
    $("reportTemplateMode").value = "default";
    setReportTemplateStatus("Upload a template before choosing it.", "err");
    return;
  }
  try {
    var updated = await requestIntegrationApi("/api/integrations", "PUT", {
      use_custom_template: useCustom
    });
    renderIntegrationSettings(updated);
    setReportTemplateStatus(useCustom ? "Your template will be used for downloaded reports." : "The default report will be used.");
  } catch (error) {
    $("reportTemplateMode").value = settings.use_custom_template ? "custom" : "default";
    setReportTemplateStatus(error.message || "Could not change the report template.", "err");
  }
});

function printDefaultReport(report) {
  var printWindow = window.open("", "_blank");
  if (!printWindow) throw new Error("Allow pop-ups to print the report.");
  printWindow.document.open();
  printWindow.document.write(buildDefaultReportHtml(report));
  printWindow.document.close();
  printWindow.addEventListener("load", function () {
    printWindow.focus();
    printWindow.print();
  });
}

async function printReportWithTemplate(report) {
  var settings = window.aiIntegrationSettings || {};
  if (settings.use_custom_template && settings.template_path) {
    var result = await supabaseClient.storage.from(REPORT_TEMPLATE_BUCKET).download(settings.template_path);
    if (result.error) throw result.error;
    var blob = await renderReportTemplate(result.data, settings.template_type, report);
    downloadReportBlob(blob, safeFileBase(settings.template_name) + "-filled." + settings.template_type);
    setReportPreviewStatus("Filled template downloaded. Open it in Word or Excel to print.");
    return;
  }
  printDefaultReport(report);
}

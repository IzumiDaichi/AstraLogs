function setGenerateReportStatus(text, kind) {
  $("generateReportStatus").textContent = text;
  $("generateReportStatus").className = "message " + (kind || "");
}

function setReportPreviewStatus(text, kind) {
  $("reportPreviewStatus").textContent = text;
  $("reportPreviewStatus").className = "message " + (kind || "");
}

function updateReportSelectionUI() {
  var count = selectedReportEntryIds.size;
  $("generateReportButton").disabled = count === 0;
  $("reportSelectionStatus").textContent = count
    ? count + (count === 1 ? " accomplishment selected." : " accomplishments selected.")
    : "Select accomplishments to generate a report.";

  if ($("selectVisibleEntriesButton")) {
    var visibleEntries = typeof getVisibleAccomplishments === "function"
      ? getVisibleAccomplishments()
      : [];
    var allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every(function (entry) {
      return selectedReportEntryIds.has(entry.id);
    });
    $("selectVisibleEntriesButton").disabled = visibleEntries.length === 0;
    $("selectVisibleEntriesButton").textContent = allVisibleSelected
      ? "Deselect this page"
      : "Select all on this page";
  }
}

function clearReportPreview() {
  $("reportView").hidden = true;
  $("reportLoading").hidden = true;
  $("reportLoading").setAttribute("aria-busy", "false");
  $("reportResult").hidden = true;
  $("reportBackButton").hidden = true;
  $("reportIntegrationsLink").hidden = true;
  $("reportPeriodCovered").value = "";
  $("reportSpecificTasks").value = "";
  $("reportOutput").value = "";
  setReportPreviewStatus("");
}

async function requestReportApi(path, body) {
  var sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  var session = sessionResult.data.session;
  if (!session) throw new Error("Your session has expired. Sign in again.");
  var response = await fetch(path, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  var result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The report service returned an unreadable response.");
  }
  if (!response.ok) {
    var apiError = new Error(result.message || "The report service could not complete the request.");
    apiError.code = result.code || "request_failed";
    throw apiError;
  }
  return result;
}

function showIntegrationsForReportError() {
  $("reportIntegrationsLink").hidden = false;
}

function reportPreviewData() {
  var period = $("reportPeriodCovered").value.trim();
  var specificTasks = $("reportSpecificTasks").value.split(/\r?\n/).map(function (line) {
    return line.trim();
  }).filter(Boolean);
  var output = $("reportOutput").value.split(/\r?\n/).map(function (line) {
    return line.trim();
  }).filter(Boolean);
  if (!period) throw new Error("Enter the period covered.");
  if (!specificTasks.length || !output.length) throw new Error("Add at least one task and one completed-work sentence.");
  if (specificTasks.length !== output.length) {
    throw new Error("Keep the number of specific tasks and completed-work sentences the same.");
  }
  return {
    period_covered: period,
    specific_tasks: specificTasks,
    output: output
  };
}

function formatReportForCopy(report) {
  return [
    "Period covered: " + report.period_covered,
    "",
    "Specific tasks:",
    report.specific_tasks.join("\n"),
    "",
    "Completed work:",
    report.output.join("\n")
  ].join("\n");
}

async function generateSelectedReport() {
  if (!selectedReportEntryIds.size) return;
  var button = $("generateReportButton");
  button.disabled = true;
  $("reportIntegrationsLink").hidden = true;
  $("reportView").hidden = false;
  $("reportLoading").hidden = false;
  $("reportResult").hidden = true;
  $("reportBackButton").hidden = true;
  setActiveView("report");
  setGenerateReportStatus("Generating report...");
  if (!window.aiIntegrationSettings) {
    try {
      await loadIntegrationsSettings();
    } catch (error) {
      $("reportLoading").hidden = true;
      $("reportLoading").setAttribute("aria-busy", "false");
      $("reportBackButton").hidden = false;
      setGenerateReportStatus("Could not load report settings. " + error.message, "err");
      showIntegrationsForReportError();
      updateReportSelectionUI();
      return;
    }
  }
  var entries = accomplishments.filter(function (entry) {
    return selectedReportEntryIds.has(entry.id);
  }).map(function (entry) {
    return {
      date: entry.log_date,
      department: entry.department,
      task: entry.task,
      notes: entry.notes || ""
    };
  });
  if (!entries.length) {
    $("reportLoading").hidden = true;
    $("reportLoading").setAttribute("aria-busy", "false");
    $("reportBackButton").hidden = false;
    setGenerateReportStatus("Select at least one accomplishment from this collection.", "err");
    updateReportSelectionUI();
    return;
  }
  var dates = entries.map(function (entry) { return entry.date; }).sort();
  var settings = window.aiIntegrationSettings || {};
  try {
    var result = await requestReportApi("/api/generate-report", {
      program: settings.program || undefined,
      date_from: dates[0],
      date_to: dates[dates.length - 1],
      entries: entries
    });
    $("reportPeriodCovered").value = result.period_covered;
    $("reportSpecificTasks").value = result.specific_tasks.join("\n");
    $("reportOutput").value = result.output.join("\n");
    $("reportLoading").hidden = true;
    $("reportLoading").setAttribute("aria-busy", "false");
    $("reportResult").hidden = false;
    $("reportBackButton").hidden = false;
    setGenerateReportStatus("Report generated.");
    setReportPreviewStatus("");
  } catch (error) {
    $("reportLoading").hidden = true;
    $("reportLoading").setAttribute("aria-busy", "false");
    $("reportBackButton").hidden = false;
    setGenerateReportStatus(error.message, "err");
    if (error.code === "no_key_configured" || error.code === "invalid_key" || error.code === "wrong_model") {
      showIntegrationsForReportError();
    }
  } finally {
    updateReportSelectionUI();
  }
}

async function copyReportPreview() {
  try {
    var report = reportPreviewData();
    await navigator.clipboard.writeText(formatReportForCopy(report));
    setReportPreviewStatus("Report copied.");
  } catch (error) {
    setReportPreviewStatus(error.message || "Could not copy the report.", "err");
  }
}

async function downloadReportFromPreview() {
  try {
    await downloadFilledReport(reportPreviewData());
  } catch (error) {
    setReportPreviewStatus(error.message || "Could not download the report.", "err");
  }
}

async function printReportFromPreview() {
  try {
    await printReportWithTemplate(reportPreviewData());
  } catch (error) {
    setReportPreviewStatus(error.message || "Could not print the report.", "err");
  }
}

$("generateReportButton").addEventListener("click", generateSelectedReport);
$("copyReportButton").addEventListener("click", copyReportPreview);
$("downloadReportButton").addEventListener("click", downloadReportFromPreview);
$("printReportButton").addEventListener("click", printReportFromPreview);
$("reportBackButton").addEventListener("click", function () {
  setActiveView("logs");
});
$("reportIntegrationsLink").addEventListener("click", function () {
  setActiveView("integrations");
  loadIntegrationsSettings().catch(function (error) {
    setIntegrationStatus("Could not load integration settings. " + error.message, "err");
  });
});

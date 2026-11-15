function setStatus(text, kind) {
  $("status").textContent = text;
  $("status").className = "message " + (kind || "");
}

function setWorkspaceStatus(text, kind) {
  $("workspaceStatus").textContent = text;
  $("workspaceStatus").className = "message " + (kind || "");
}

function setDateToToday() {
  $("log_date").value = todayString();
}

function buildPayload() {
  return {
    form_title: profile.formTitle,
    logbook_id: activeLogbook.id,
    submitted_by: currentUser.id,
    log_date: $("log_date").value,
    time_request: $("time_request").value || null,
    time_completion: $("time_completion").value || null,
    interns: selected.slice(),
    department: $("department").value.trim(),
    task: $("task").value.trim(),
    notes: $("notes").value.trim()
  };
}

function resetReportForm() {
  setDateToToday();
  selected = [profile.myName];
  if (activeLogbook) $("entryLogbook").value = activeLogbook.id;
  renderPeople();
}

function renderLogbookSelectors() {
  ["logsLogbook", "entryLogbook"].forEach(function (id) {
    var select = $(id);
    select.textContent = "";
    logbooks.forEach(function (logbook) {
      var group = groups.find(function (item) { return item.id === logbook.workspace_id; });
      var option = document.createElement("option");
      option.value = logbook.id;
      option.textContent = logbook.name + (group ? " · Shared with " + group.name : " · Private");
      select.appendChild(option);
    });
    select.disabled = !logbooks.length;
    if (activeLogbook) select.value = activeLogbook.id;
  });
  $("logbookCount").textContent = String(logbooks.length);
  $("entryFormPanel").hidden = !logbooks.length;
  $("entryNoLogbooks").hidden = !!logbooks.length;
  renderLogbooks();
}

function renderLogbooks() {
  var list = $("logbookList");
  list.textContent = "";
  $("logbooksTotal").textContent = logbooks.length + (logbooks.length === 1 ? " collection" : " collections");
  renderCollectionNavigation();
  if (!logbooks.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    var description = document.createElement("span");
    description.textContent = "Create your first collection to give related accomplishments a home.";
    empty.appendChild(description);
    list.appendChild(empty);
    return;
  }

  logbooks.forEach(function (logbook) {
    var group = groups.find(function (item) { return item.id === logbook.workspace_id; });
    var card = document.createElement("article");
    card.className = "logbook-card" + (activeLogbook && activeLogbook.id === logbook.id ? " selected" : "");
    var copy = document.createElement("div");
    copy.className = "logbook-card-copy";
    var title = document.createElement("h3");
    title.textContent = logbook.name;
    var access = document.createElement("p");
    access.className = "entry-meta";
    access.textContent = group ? "Shared collection · " + group.name : "Private collection · Only you";
    copy.appendChild(title);
    copy.appendChild(access);
    card.appendChild(copy);

    var openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "secondary";
    openButton.textContent = "Open";
    openButton.setAttribute("aria-label", "Open " + logbook.name + " accomplishments");
    openButton.addEventListener("click", function () {
      openLogbook(logbook.id, "logs");
    });
    card.appendChild(openButton);
    list.appendChild(card);
  });
}

function renderCollectionNavigation() {
  var list = $("collectionNavList");
  list.textContent = "";
  if (!logbooks.length) {
    var empty = document.createElement("span");
    empty.className = "collection-nav-empty";
    empty.textContent = "No collections yet";
    list.appendChild(empty);
    return;
  }
  logbooks.forEach(function (logbook) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "collection-nav-item";
    button.textContent = logbook.name;
    button.setAttribute("data-logbook-id", logbook.id);
    button.setAttribute("aria-label", "Open " + logbook.name + " logs");
    button.addEventListener("click", function () {
      openLogbook(logbook.id, "logs");
    });
    list.appendChild(button);
  });
  document.querySelectorAll(".collection-nav-item").forEach(function (item) {
    var active = !$("logsView").hidden && activeLogbook &&
      item.getAttribute("data-logbook-id") === activeLogbook.id;
    item.classList.toggle("active", !!active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

async function openLogbook(logbookId, view) {
  try {
    await selectLogbook(logbookId);
    setActiveView(view);
    if (view === "entry") $("department").focus();
  } catch (error) {
    setWorkspaceStatus("Could not open logbook. " + error.message, "err");
  }
}

function dateLabel(dateString) {
  var parts = dateString.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return dateString;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric"
  });
}

function renderHistory() {
  var period = $("period").value;
  var day = $("filterDay").value;
  var week = $("filterWeek").value;
  var from = $("filterFrom").value;
  var to = $("filterTo").value;
  var filtered = accomplishments.filter(function (entry) {
    if (period === "day") return entry.log_date === day;
    if (period === "week" && week) {
      var selectedDate = new Date(week + "T00:00:00");
      var dayOfWeek = (selectedDate.getDay() + 6) % 7;
      selectedDate.setDate(selectedDate.getDate() - dayOfWeek);
      var weekStart = todayStringForDate(selectedDate);
      selectedDate.setDate(selectedDate.getDate() + 6);
      var weekEnd = todayStringForDate(selectedDate);
      return entry.log_date >= weekStart && entry.log_date <= weekEnd;
    }
    if (period === "custom") {
      return (!from || entry.log_date >= from) && (!to || entry.log_date <= to);
    }
    return true;
  });
  filtered.sort(function (a, b) {
    var aOrder = a.log_date + " " + (a.time_request || "");
    var bOrder = b.log_date + " " + (b.time_request || "");
    return bOrder.localeCompare(aOrder);
  });

  $("entryCount").textContent = filtered.length + (filtered.length === 1 ? " accomplishment" : " accomplishments");
  var list = $("historyList");
  list.textContent = "";
  if (!filtered.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    var message = document.createElement("span");
    message.textContent = !activeLogbook ? "Create a collection to organize your accomplishments." :
      accomplishments.length
      ? "Try another date range or choose All accomplishments."
      : "Add the first accomplishment to the " + activeLogbook.name + " collection.";
    empty.appendChild(message);
    if (!activeLogbook || !accomplishments.length) {
      var createButton = document.createElement("button");
      createButton.type = "button";
      createButton.className = "primary empty-create-button";
      createButton.textContent = !activeLogbook ? "Create your first collection" : "Add an accomplishment";
      createButton.addEventListener("click", function () {
        if (!activeLogbook) {
          setActiveView("logbooks");
          $("newLogbookName").focus();
          return;
        }
        setActiveView("entry");
        $("department").focus();
      });
      empty.appendChild(createButton);
    }
    list.appendChild(empty);
    return;
  }

  filtered.forEach(function (entry) {
    var card = document.createElement("article");
    card.className = "entry";
    var top = document.createElement("div");
    top.className = "entry-top";
    var task = document.createElement("p");
    task.className = "entry-task";
    task.textContent = entry.task;
    var copy = document.createElement("div");
    copy.className = "entry-copy";
    copy.appendChild(task);
    if (entry.notes) {
      var notes = document.createElement("p");
      notes.className = "entry-notes";
      notes.textContent = entry.notes;
      copy.appendChild(notes);
    }
    var date = document.createElement("span");
    date.className = "entry-date";
    date.textContent = dateLabel(entry.log_date);
    var side = document.createElement("div");
    side.className = "entry-side";
    top.appendChild(copy);

    var submitter = entryMembers.find(function (member) { return member.id === entry.submitted_by; });
    var interns = Array.isArray(entry.interns) ? entry.interns.join(", ") : entry.interns;
    var details = [entry.department, interns && "Interns: " + interns,
      entry.time_request && "Requested " + entry.time_request,
      entry.time_completion && "Completed " + entry.time_completion,
      submitter && "Submitted by " + submitter.full_name]
      .filter(Boolean).join(" · ");
    var meta = document.createElement("p");
    meta.className = "entry-meta";
    meta.textContent = details || "Submitted by " + (entry.submitted_by === currentUser.id ? profile.myName : "a group member");

    var actions = document.createElement("div");
    actions.className = "entry-actions";
    var editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary icon-action edit-entry";
    editButton.setAttribute("aria-label", "Edit accomplishment: " + entry.task);
    editButton.title = "Edit";
    appendEntryActionIcon(editButton, "edit");
    editButton.addEventListener("click", function () {
      renderEntryEditor(card, entry);
    });
    var deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "secondary icon-action delete-entry";
    deleteButton.setAttribute("aria-label", "Delete accomplishment: " + entry.task);
    deleteButton.title = "Delete";
    appendEntryActionIcon(deleteButton, "delete");
    deleteButton.addEventListener("click", function () {
      deleteEntry(entry.id, deleteButton);
    });
    side.appendChild(date);
    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    side.appendChild(actions);
    top.appendChild(side);
    card.appendChild(top);
    card.appendChild(meta);

    list.appendChild(card);
  });
}

function appendEntryActionIcon(button, action) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");

  var paths = action === "edit"
    ? ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"]
    : ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v5", "M14 11v5"];
  paths.forEach(function (pathData) {
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
  });
  button.appendChild(svg);
}

function addEditorField(form, labelText, name, value, type, multiline) {
  var label = document.createElement("label");
  label.textContent = labelText;
  var field = multiline ? document.createElement("textarea") : document.createElement("input");
  field.name = name;
  if (!multiline) field.type = type || "text";
  if (multiline) field.rows = 3;
  field.value = value || "";
  if (["log_date", "department", "task"].indexOf(name) !== -1) field.required = true;
  label.appendChild(field);
  form.appendChild(label);
}

function renderEntryEditor(card, entry) {
  var oldEditor = card.querySelector(".entry-editor");
  if (oldEditor) {
    oldEditor.remove();
    return;
  }
  var form = document.createElement("form");
  form.className = "entry-editor";
  addEditorField(form, "Date of log", "log_date", entry.log_date, "date");
  addEditorField(form, "Department", "department", entry.department);
  addEditorField(form, "Time of request", "time_request", entry.time_request, "time");
  addEditorField(form, "Time of completion", "time_completion", entry.time_completion, "time");
  addEditorField(form, "Interns (comma-separated)", "interns", (entry.interns || []).join(", "));
  addEditorField(form, "Task performed", "task", entry.task);
  addEditorField(form, "Notes / resolution", "notes", entry.notes, null, true);
  var buttons = document.createElement("div");
  buttons.className = "actions";
  var saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary";
  saveButton.textContent = "Save changes";
  var cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", function () { form.remove(); });
  buttons.appendChild(saveButton);
  buttons.appendChild(cancelButton);
  form.appendChild(buttons);
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    saveButton.disabled = true;
    var data = new FormData(form);
    var changes = {
      log_date: data.get("log_date"),
      department: String(data.get("department")).trim(),
      time_request: data.get("time_request") || null,
      time_completion: data.get("time_completion") || null,
      interns: String(data.get("interns")).split(",").map(function (name) { return name.trim(); }).filter(Boolean),
      task: String(data.get("task")).trim(),
      notes: String(data.get("notes")).trim()
    };
    try {
      await updateAccomplishment(entry.id, changes);
      await loadAccomplishments();
      setWorkspaceStatus("Accomplishment updated.", "ok");
    } catch (error) {
      saveButton.disabled = false;
      setWorkspaceStatus("Could not update accomplishment. " + error.message, "err");
    }
  });
  card.appendChild(form);
}

async function deleteEntry(id, button) {
  if (!window.confirm("Delete this accomplishment? This cannot be undone.")) return;
  button.disabled = true;
  try {
    await deleteAccomplishment(id);
    await loadAccomplishments();
    setWorkspaceStatus("Accomplishment deleted.", "ok");
  } catch (error) {
    button.disabled = false;
    setWorkspaceStatus("Could not delete accomplishment. " + error.message, "err");
  }
}

function todayStringForDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function updateFilterControls() {
  var period = $("period").value;
  $("dayFilter").hidden = period !== "day";
  $("weekFilter").hidden = period !== "week";
  $("customFilter").hidden = period !== "custom";
  renderHistory();
}

$("logsLogbook").addEventListener("change", function () {
  selectLogbook($("logsLogbook").value).catch(function (error) {
    setWorkspaceStatus("Could not load logbook. " + error.message, "err");
  });
});

$("entryLogbook").addEventListener("change", function () {
  selectLogbook($("entryLogbook").value).catch(function (error) {
    setWorkspaceStatus("Could not load logbook. " + error.message, "err");
  });
});

$("createLogbookForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  var name = $("newLogbookName").value.trim();
  if (!name) {
    $("logbookStatus").textContent = "Enter a name for this logbook.";
    $("logbookStatus").className = "message err";
    $("newLogbookName").focus();
    return;
  }
  var button = $("createLogbookButton");
  button.disabled = true;
  $("logbookStatus").textContent = "Creating collection...";
  $("logbookStatus").className = "message";
  try {
    await createLogbook(name, $("newLogbookGroup").value);
    $("newLogbookName").value = "";
    $("logbookStatus").textContent = "Collection created.";
    $("logbookStatus").className = "message ok";
    setActiveView("logbooks");
    $("newLogbookName").focus();
  } catch (error) {
    $("logbookStatus").textContent = "Could not create collection. " + error.message;
    $("logbookStatus").className = "message err";
  } finally {
    button.disabled = false;
  }
});

$("period").addEventListener("change", updateFilterControls);
["filterDay", "filterWeek", "filterFrom", "filterTo"].forEach(function (id) {
  $(id).addEventListener("change", renderHistory);
});

$("report").addEventListener("submit", function (event) {
  event.preventDefault();
  if (!profile || !currentUser) { showLogin(); return; }
  if (!activeLogbook) {
    setStatus("Create a collection before submitting an accomplishment.", "err");
    setActiveView("logbooks");
    return;
  }
  if (selected.length === 0) {
    setStatus("Pick at least one intern who did the task.", "err");
    return;
  }
  var payload = buildPayload();
  setStatus("Saving accomplishment...");
  saveAccomplishment(payload).then(function () {
    if ($("period").value === "day") $("filterDay").value = payload.log_date;
    return loadAccomplishments();
  }).then(function () {
    setStatus("Accomplishment saved.", "ok");
    $("report").reset();
    resetReportForm();
  }).catch(function (error) {
    setStatus("Could not save this accomplishment. " + error.message, "err");
  });
});

$("clearBtn").addEventListener("click", function () {
  setTimeout(function () {
    resetReportForm();
    setStatus("");
  }, 0);
});

$("goToLogbooks").addEventListener("click", function () {
  setActiveView("logbooks");
  $("newLogbookName").focus();
});

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
  var selectedMembers = selected.map(function (userId) {
    return entryMembers.find(function (member) { return member.id === userId; }) ||
      (userId === currentUser.id ? { id: currentUser.id, nickname: profile.nickname } : null);
  }).filter(Boolean);
  return {
    id: createOfflineId(),
    form_title: profile.formTitle,
    logbook_id: activeLogbook.id,
    submitted_by: currentUser.id,
    log_date: $("log_date").value,
    time_request: $("time_request").value || null,
    time_completion: $("time_completion").value || null,
    interns: selectedMembers.map(function (member) { return member.nickname; }),
    shared_with: selected.filter(function (userId) { return userId !== currentUser.id; }),
    department: $("department").value.trim(),
    task: $("task").value.trim(),
    notes: $("notes").value.trim()
  };
}

function resetReportForm() {
  setDateToToday();
  selected = [currentUser.id];
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
      var accessLabel = group ? "Shared with " + group.name :
        logbook.workspace_id ? "Shared collection" :
          logbook.owner_id === currentUser.id ? "Private" : "Entry shared with you";
      option.textContent = logbook.name + " · " + accessLabel;
      select.appendChild(option);
    });
    select.disabled = !logbooks.length;
    if (activeLogbook) select.value = activeLogbook.id;
  });
  $("logbookCount").textContent = String(logbooks.length);
  $("entryFormPanel").hidden = !logbooks.length;
  $("entryNoLogbooks").hidden = !!logbooks.length;
  var canSubmit = activeLogbook && (
    activeLogbook.owner_id === currentUser.id ||
    groups.some(function (group) { return group.id === activeLogbook.workspace_id; })
  );
  $("entryFields").hidden = !canSubmit;
  $("entryReadOnly").hidden = !!canSubmit || !logbooks.length;
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
    access.textContent = group
      ? "Shared collection · " + group.name
      : logbook.workspace_id
        ? "Shared collection"
        : logbook.owner_id === currentUser.id
          ? "Private collection · Only you"
          : "Entry shared with you";
    copy.appendChild(title);
    copy.appendChild(access);
    card.appendChild(copy);

    var actions = document.createElement("div");
    actions.className = "logbook-card-actions";
    var openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "secondary";
    openButton.textContent = "Open";
    openButton.setAttribute("aria-label", "Open " + logbook.name + " accomplishments");
    openButton.addEventListener("click", function () {
      openLogbook(logbook.id, "logs");
    });
    actions.appendChild(openButton);

    if (logbook.owner_id === currentUser.id) {
      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary icon-action";
      editButton.setAttribute("aria-label", "Edit collection: " + logbook.name);
      editButton.title = "Edit collection";
      appendEntryActionIcon(editButton, "edit");
      editButton.addEventListener("click", function () {
        renderLogbookEditor(card, logbook);
      });

      var deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "secondary icon-action delete-entry";
      deleteButton.setAttribute("aria-label", "Delete collection: " + logbook.name);
      deleteButton.title = "Delete collection";
      appendEntryActionIcon(deleteButton, "delete");
      deleteButton.addEventListener("click", function () {
        removeLogbook(logbook, deleteButton);
      });

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
    }

    card.appendChild(actions);
    list.appendChild(card);
  });
}

function renderLogbookEditor(card, logbook) {
  var oldEditor = card.querySelector(".collection-edit-form");
  if (oldEditor) {
    oldEditor.remove();
    return;
  }

  var form = document.createElement("form");
  form.className = "collection-edit-form";
  var label = document.createElement("label");
  label.textContent = "Collection name";
  var input = document.createElement("input");
  input.type = "text";
  input.name = "name";
  input.value = logbook.name;
  input.required = true;
  input.maxLength = 80;
  label.appendChild(input);
  form.appendChild(label);

  var actions = document.createElement("div");
  actions.className = "actions";
  var saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary";
  saveButton.textContent = "Save";
  var cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", function () {
    form.remove();
  });
  actions.appendChild(saveButton);
  actions.appendChild(cancelButton);
  form.appendChild(actions);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      await updateLogbook(logbook.id, name);
      await loadLogbooks(logbook.id);
      $("logbookStatus").textContent = "";
      $("logbookStatus").className = "message";
      showToast("Collection updated.");
    } catch (error) {
      saveButton.disabled = false;
      $("logbookStatus").textContent = "Could not update collection. " + error.message;
      $("logbookStatus").className = "message err";
    }
  });
  card.appendChild(form);
  input.focus();
  input.select();
}

async function removeLogbook(logbook, button) {
  if (!window.confirm('Delete "' + logbook.name + '" and all accomplishments in it? This cannot be undone.')) return;
  button.disabled = true;
  try {
    await deleteLogbook(logbook.id);
    await loadLogbooks();
    await loadDashboardData();
    $("logbookStatus").textContent = "";
    $("logbookStatus").className = "message";
    showToast("Collection deleted.");
  } catch (error) {
    button.disabled = false;
    $("logbookStatus").textContent = "Could not delete collection. " + error.message;
    $("logbookStatus").className = "message err";
  }
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

async function openLogbook(logbookId, view, targetEntryId, targetEntryDate) {
  try {
    await selectLogbook(logbookId);
    if (view === "logs" && targetEntryId) {
      $("period").value = "day";
      $("filterDay").value = targetEntryDate;
      updateFilterControls();
      var matchingEntries = getFilteredAccomplishments();
      matchingEntries.sort(function (a, b) {
        var aOrder = a.log_date + " " + (a.time_request || "");
        var bOrder = b.log_date + " " + (b.time_request || "");
        return bOrder.localeCompare(aOrder);
      });
      var targetIndex = matchingEntries.findIndex(function (entry) {
        return String(entry.id) === String(targetEntryId);
      });
      if (targetIndex !== -1) {
        historyPage = Math.floor(targetIndex / historyPageSize);
        renderHistory();
      }
    }
    setActiveView(view);
    if (view === "logs" && targetEntryId) {
      var targetCard = Array.prototype.find.call(
        $("historyList").querySelectorAll(".entry"),
        function (card) { return card.getAttribute("data-entry-id") === String(targetEntryId); }
      );
      if (targetCard) {
        targetCard.classList.add("dashboard-entry-target");
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
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

var historyPage = 0;
var historyPageSize = 25;

function getFilteredAccomplishments() {
  var period = $("period").value;
  var day = $("filterDay").value;
  var week = $("filterWeek").value;
  var from = $("filterFrom").value;
  var to = $("filterTo").value;
  var invalidRange = period === "custom" && from && to && from > to;
  $("filterRangeStatus").hidden = !invalidRange;
  $("filterRangeStatus").textContent = invalidRange ? "The start date must be on or before the end date." : "";

  return accomplishments.filter(function (entry) {
    if (invalidRange) return false;
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
}

function getVisibleAccomplishments() {
  var filtered = getFilteredAccomplishments();
  filtered.sort(function (a, b) {
    var aOrder = a.log_date + " " + (a.time_request || "");
    var bOrder = b.log_date + " " + (b.time_request || "");
    return bOrder.localeCompare(aOrder);
  });
  return filtered.slice(historyPage * historyPageSize, (historyPage + 1) * historyPageSize);
}

function renderHistory() {
  var currentEntryIds = new Set(accomplishments.map(function (entry) { return entry.id; }));
  selectedReportEntryIds.forEach(function (id) {
    if (!currentEntryIds.has(id)) selectedReportEntryIds.delete(id);
  });
  var filtered = getFilteredAccomplishments();
  filtered.sort(function (a, b) {
    var aOrder = a.log_date + " " + (a.time_request || "");
    var bOrder = b.log_date + " " + (b.time_request || "");
    return bOrder.localeCompare(aOrder);
  });

  var pageCount = Math.ceil(filtered.length / historyPageSize);
  historyPage = Math.max(0, Math.min(historyPage, pageCount - 1));
  var startIndex = historyPage * historyPageSize;
  var visibleEntries = filtered.slice(startIndex, startIndex + historyPageSize);
  var shownEnd = Math.min(startIndex + visibleEntries.length, filtered.length);
  $("entryCount").textContent = filtered.length
    ? "Showing " + (startIndex + 1) + "–" + shownEnd + " of " + filtered.length +
      " (" + accomplishments.length + " total)"
    : "0 of " + accomplishments.length + " accomplishments";
  var list = $("historyList");
  list.textContent = "";
  var pagination = $("historyPagination");
  pagination.hidden = pageCount <= 1;
  $("historyPreviousPage").disabled = historyPage === 0;
  $("historyNextPage").disabled = historyPage >= pageCount - 1;
  $("historyPageStatus").textContent = pageCount
    ? "Page " + (historyPage + 1) + " of " + pageCount
    : "No pages";
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
    updateReportSelectionUI();
    return;
  }

  visibleEntries.forEach(function (entry) {
    var card = document.createElement("article");
    var isSelected = selectedReportEntryIds.has(entry.id);
    card.className = "entry" + (isSelected ? " selected" : "");
    card.setAttribute("data-entry-id", entry.id);
    var selectButton = document.createElement("button");
    selectButton.type = "button";
    selectButton.className = "entry-select-indicator";
    selectButton.setAttribute("aria-label", (isSelected ? "Deselect" : "Select") + " accomplishment: " + entry.task);
    selectButton.setAttribute("aria-pressed", String(isSelected));
    selectButton.title = isSelected ? "Deselect accomplishment" : "Select accomplishment";
    selectButton.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleReportEntrySelection(entry.id, card, selectButton);
    });
    card.addEventListener("click", function (event) {
      if (event.target instanceof Element && event.target.closest("button, input, textarea, select, a, .entry-editor")) return;
      toggleReportEntrySelection(entry.id, card, selectButton);
    });
    card.appendChild(selectButton);
    var top = document.createElement("div");
    top.className = "entry-top";
    var task = document.createElement("p");
    task.className = "entry-task";
    task.textContent = entry.task;
    var copy = document.createElement("div");
    copy.className = "entry-copy";
    if (entry.department) {
      var department = document.createElement("p");
      department.className = "entry-department";
      department.textContent = entry.department;
      copy.appendChild(department);
    }
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
    var details = [interns && "Interns: " + interns,
      entry.time_request && "Requested " + entry.time_request,
      entry.time_completion && "Completed " + entry.time_completion,
      submitter && "Submitted by " + submitter.nickname]
      .filter(Boolean).join(" · ");
    var meta = document.createElement("p");
    meta.className = "entry-meta";
    meta.textContent = details || "Submitted by " + (entry.submitted_by === currentUser.id ? profile.nickname : "a group member");

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
  updateReportSelectionUI();
}

function toggleReportEntrySelection(entryId, card, selectButton) {
  var isSelected = selectedReportEntryIds.has(entryId);
  if (isSelected) selectedReportEntryIds.delete(entryId);
  else selectedReportEntryIds.add(entryId);
  card.classList.toggle("selected", !isSelected);
  selectButton.setAttribute("aria-pressed", String(!isSelected));
  selectButton.setAttribute("aria-label", (!isSelected ? "Deselect" : "Select") +
    " accomplishment: " + card.querySelector(".entry-task").textContent);
  selectButton.title = !isSelected ? "Deselect accomplishment" : "Select accomplishment";
  updateReportSelectionUI();
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
  addEditorField(form, "Department", "department", entry.department);
  addEditorField(form, "Date of log", "log_date", entry.log_date, "date");
  addEditorField(form, "Time of request", "time_request", entry.time_request, "time");
  addEditorField(form, "Time of completion", "time_completion", entry.time_completion, "time");
  var internsField = document.createElement("fieldset");
  internsField.className = "entry-interns";
  var internsLegend = document.createElement("legend");
  internsLegend.textContent = "Interns";
  internsField.appendChild(internsLegend);
  var internOptions = document.createElement("div");
  internOptions.className = "entry-intern-options";
  var existingInterns = Array.isArray(entry.interns) ? entry.interns :
    typeof entry.interns === "string" ? entry.interns.split(",").map(function (name) { return name.trim(); }).filter(Boolean) : [];
  var members = entryMembers.slice();
  if (currentUser && !members.some(function (member) { return member.id === currentUser.id; })) {
    members.unshift({ id: currentUser.id, nickname: profile.nickname });
  }
  existingInterns.forEach(function (name) {
    if (!members.some(function (member) { return member.nickname === name; })) {
      members.push({ nickname: name });
    }
  });
  members.forEach(function (member) {
    var chip = document.createElement("span");
    chip.className = "chip";
    var label = document.createElement("label");
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "interns";
    checkbox.value = member.nickname;
    checkbox.checked = existingInterns.indexOf(member.nickname) !== -1;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(member.nickname));
    chip.appendChild(label);
    internOptions.appendChild(chip);
  });
  internsField.appendChild(internOptions);
  form.appendChild(internsField);
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
      interns: data.getAll("interns"),
      task: String(data.get("task")).trim(),
      notes: String(data.get("notes")).trim()
    };
    try {
      await updateAccomplishment(entry.id, changes);
      await loadAccomplishments();
      showToast("Accomplishment updated.");
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
    showToast("Accomplishment deleted.");
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
  historyPage = 0;
  renderHistory();
}

$("clearFilters").addEventListener("click", function () {
  $("period").value = "all";
  $("filterDay").value = todayString();
  $("filterWeek").value = todayString();
  $("filterFrom").value = "";
  $("filterTo").value = "";
  updateFilterControls();
});

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
    $("logbookStatus").textContent = "";
    $("logbookStatus").className = "message";
    showToast("Collection created.");
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
  $(id).addEventListener("change", function () {
    historyPage = 0;
    renderHistory();
  });
});

$("selectVisibleEntriesButton").addEventListener("click", function () {
  var visibleEntries = getVisibleAccomplishments();
  var allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every(function (entry) {
    return selectedReportEntryIds.has(entry.id);
  });

  visibleEntries.forEach(function (entry) {
    if (allVisibleSelected) selectedReportEntryIds.delete(entry.id);
    else selectedReportEntryIds.add(entry.id);
  });

  renderHistory();
});

$("historyPreviousPage").addEventListener("click", function () {
  if (historyPage === 0) return;
  historyPage -= 1;
  renderHistory();
});

$("historyNextPage").addEventListener("click", function () {
  if ((historyPage + 1) * historyPageSize >= getFilteredAccomplishments().length) return;
  historyPage += 1;
  renderHistory();
});

$("report").addEventListener("submit", async function (event) {
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
  setStatus("Saving accomplishment...");
  try {
    var payload = buildPayload();
    var savedOffline = false;
    if (window.navigator.onLine === false) {
      await enqueueOfflineAction({
        type: "accomplishment",
        userId: currentUser.id,
        payload: payload
      });
      savedOffline = true;
    } else {
      try {
        await saveAccomplishment(payload);
      } catch (error) {
        if (!isNetworkUnavailable(error)) throw error;
        await enqueueOfflineAction({
          type: "accomplishment",
          userId: currentUser.id,
          payload: payload
        });
        savedOffline = true;
      }
    }

    if (savedOffline) {
      await updateOfflineStatus();
      showToast("Saved on this device. It will sync when you reconnect.");
    } else {
      if ($("period").value === "day") $("filterDay").value = payload.log_date;
      try {
        await loadAccomplishments();
        showToast("Accomplishment added.");
      } catch (error) {
        showToast("Accomplishment saved, but the list could not be refreshed. " + error.message, "err");
      }
    }
    setStatus("");
    $("report").reset();
    resetReportForm();
  } catch (error) {
    setStatus("Could not save this accomplishment. " + error.message, "err");
  }
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

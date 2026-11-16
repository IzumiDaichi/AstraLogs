var timeRecordFields = ["morning_in", "morning_out", "afternoon_in", "afternoon_out"];

function setTimeRecordStatus(text, kind) {
  $("timeRecordStatus").textContent = text;
  $("timeRecordStatus").className = "message " + (kind || "");
}

function formatPunchTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function timeRecordFieldLabel(field) {
  return field.replace("_", " ").replace(/\b\w/g, function (letter) {
    return letter.toUpperCase();
  });
}

function renderTimeRecordTable(container, records, emptyMessage, canManage) {
  container.textContent = "";
  if (!records.length) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  var table = document.createElement("table");
  table.className = "records-table";
  table.setAttribute("role", "table");
  table.setAttribute("aria-label", "Recent daily time records");
  var head = document.createElement("thead");
  head.setAttribute("role", "rowgroup");
  var headerRow = document.createElement("tr");
  headerRow.setAttribute("role", "row");
  var headers = [
    "Date", "Morning In", "Morning Out", "Afternoon In", "Afternoon Out"
  ];
  if (canManage) headers.push("Actions");
  headers.forEach(function (label) {
    var cell = document.createElement("th");
    cell.scope = "col";
    cell.setAttribute("role", "columnheader");
    cell.textContent = label;
    headerRow.appendChild(cell);
  });
  head.appendChild(headerRow);
  table.appendChild(head);

  var body = document.createElement("tbody");
  body.setAttribute("role", "rowgroup");
  records.forEach(function (record) {
    var row = document.createElement("tr");
    row.setAttribute("role", "row");
    var dateCell = document.createElement("td");
    dateCell.setAttribute("role", "cell");
    dateCell.setAttribute("data-label", "Date");
    dateCell.textContent = record.work_date;
    row.appendChild(dateCell);
    timeRecordFields.forEach(function (field) {
      var cell = document.createElement("td");
      cell.setAttribute("role", "cell");
      cell.setAttribute("data-label", timeRecordFieldLabel(field));
      cell.textContent = formatPunchTime(record[field]);
      row.appendChild(cell);
    });
    if (canManage) {
      var actionsCell = document.createElement("td");
      actionsCell.setAttribute("role", "cell");
      actionsCell.setAttribute("data-label", "Actions");
      var actions = document.createElement("div");
      actions.className = "entry-actions";
      var editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "secondary icon-action edit-entry";
      editButton.setAttribute("aria-label", "Edit time record for " + record.work_date);
      editButton.title = "Edit time record";
      appendEntryActionIcon(editButton, "edit");
      editButton.addEventListener("click", function () {
        renderTimeRecordEditor(table, row, record);
      });
      var deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "secondary icon-action delete-entry";
      deleteButton.setAttribute("aria-label", "Delete time record for " + record.work_date);
      deleteButton.title = "Delete time record";
      appendEntryActionIcon(deleteButton, "delete");
      deleteButton.addEventListener("click", function () {
        removeTimeRecord(record, deleteButton);
      });
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      actionsCell.appendChild(actions);
      row.appendChild(actionsCell);
    }
    body.appendChild(row);
  });
  table.appendChild(body);
  container.appendChild(table);
}

function formatPunchInputTime(value) {
  if (!value) return "";
  var date = new Date(value);
  return String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

function renderTimeRecordEditor(table, row, record) {
  var oldEditor = table.querySelector(".time-record-editor-row");
  if (oldEditor) oldEditor.remove();

  var editorRow = document.createElement("tr");
  editorRow.className = "time-record-editor-row";
  editorRow.setAttribute("role", "row");
  var cell = document.createElement("td");
  cell.setAttribute("role", "cell");
  cell.colSpan = 6;
  var form = document.createElement("form");
  form.className = "time-record-editor-form";

  var dateLabel = document.createElement("label");
  dateLabel.textContent = "Date";
  var dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.name = "work_date";
  dateInput.value = record.work_date;
  dateInput.max = todayString();
  dateInput.required = true;
  dateLabel.appendChild(dateInput);
  form.appendChild(dateLabel);

  timeRecordFields.forEach(function (field) {
    var label = document.createElement("label");
    label.textContent = timeRecordFieldLabel(field);
    var input = document.createElement("input");
    input.type = "time";
    input.name = field;
    input.value = formatPunchInputTime(record[field]);
    label.appendChild(input);
    form.appendChild(label);
  });

  var actions = document.createElement("div");
  actions.className = "time-record-editor-actions";
  var saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary";
  saveButton.textContent = "Save changes";
  var cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", function () {
    editorRow.remove();
  });
  actions.appendChild(saveButton);
  actions.appendChild(cancelButton);
  form.appendChild(actions);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var workDate = String(data.get("work_date"));
    if (workDate > todayString()) {
      setTimeRecordStatus("Time records must be dated today or earlier.", "err");
      return;
    }
    saveButton.disabled = true;
    setTimeRecordStatus("Saving time record...");
    try {
      var changes = { work_date: workDate };
      timeRecordFields.forEach(function (field) {
        var time = String(data.get(field) || "");
        changes[field] = time ? localDateTimeToIso(workDate, time) : null;
      });
      await updateTimeRecord(record.id, changes);
      await loadTimeRecords();
      await loadDashboardData();
      setTimeRecordStatus("");
      showToast("Time record updated.");
    } catch (error) {
      saveButton.disabled = false;
      setTimeRecordStatus("Could not update time record. " + error.message, "err");
    }
  });

  cell.appendChild(form);
  editorRow.appendChild(cell);
  row.parentNode.insertBefore(editorRow, row.nextSibling);
  dateInput.focus();
}

async function removeTimeRecord(record, button) {
  if (!window.confirm("Delete the time record for " + record.work_date + "? This cannot be undone.")) return;
  button.disabled = true;
  try {
    await deleteTimeRecord(record.id);
    await loadTimeRecords();
    await loadDashboardData();
    setTimeRecordStatus("");
    showToast("Time record deleted.");
  } catch (error) {
    button.disabled = false;
    var message = "Could not delete time record. " + error.message;
    setTimeRecordStatus("");
    showToast(message, "err");
  }
}

function renderTimeRecords() {
  renderTimeRecordTable($("timeRecordsTable"), timeRecords, "No time records yet.", true);
}

async function loadTimeRecords() {
  var result = await supabaseClient
    .from("time_records")
    .select("id, work_date, morning_in, morning_out, afternoon_in, afternoon_out")
    .eq("user_id", currentUser.id)
    .order("work_date", { ascending: false })
    .limit(30);
  if (result.error) throw result.error;
  timeRecords = result.data || [];
  renderTimeRecords();
}

async function saveTimePunch(workDate, field, timestamp, allowCorrection) {
  var pendingAction = {
    type: "time_punch",
    userId: currentUser.id,
    workDate: workDate,
    field: field,
    timestamp: timestamp,
    allowCorrection: allowCorrection,
    expectedValue: (timeRecords.find(function (record) {
      return record.work_date === workDate;
    }) || {})[field] || null
  };
  if (window.navigator.onLine === false) {
    if (!allowCorrection && pendingAction.expectedValue) {
      throw new Error("That time slot already has a punch. Use manual entry to correct it.");
    }
    await enqueueOfflineAction(pendingAction);
    await updateOfflineStatus();
    return true;
  }

  var result = await supabaseClient.rpc("record_time_punch", {
    target_date: workDate,
    punch_slot: field,
    punched_at: timestamp,
    allow_correction: allowCorrection
  });
  if (result.error) {
    if (!isNetworkUnavailable(result.error)) throw result.error;
    await enqueueOfflineAction(pendingAction);
    await updateOfflineStatus();
    return true;
  }
  try {
    await removePendingTimePunch(currentUser.id, workDate, field);
  } catch (error) {
    console.error("Could not clear the matching offline punch.", error);
  }
  await loadTimeRecords();
  await loadDashboardData();
  await updateOfflineStatus();
  return false;
}

async function syncQueuedTimePunch(action) {
  if (timeRecordFields.indexOf(action.field) === -1 ||
      !action.workDate || !action.timestamp || !action.userId) {
    throw new Error("The saved time record is incomplete.");
  }
  var existingResult = await supabaseClient
    .from("time_records")
    .select("id, " + action.field)
    .eq("user_id", action.userId)
    .eq("work_date", action.workDate)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  var existingValue = existingResult.data ? existingResult.data[action.field] : null;
  if (existingValue && new Date(existingValue).getTime() === new Date(action.timestamp).getTime()) return;
  if (existingValue && !action.allowCorrection) {
    throw new Error("That time slot already has a different punch. Review it in Time Records before retrying.");
  }
  if (action.allowCorrection && (existingValue || null) !== (action.expectedValue || null)) {
    throw new Error("This time slot changed while offline. Review it in Time Records before retrying.");
  }

  var result = await supabaseClient.rpc("record_time_punch", {
    target_date: action.workDate,
    punch_slot: action.field,
    punched_at: action.timestamp,
    allow_correction: action.allowCorrection
  });
  if (result.error) throw result.error;
}

async function handleQuickPunch(direction, button) {
  button.disabled = true;
  var now = new Date();
  var period = now.getHours() < 12 ? "morning" : "afternoon";
  var field = period + "_" + direction;
  var label = field.replace("_", " ");
  label = label.charAt(0).toUpperCase() + label.slice(1);
  setTimeRecordStatus("Recording " + label + "...");
  try {
    var savedOffline = await saveTimePunch(todayString(), field, now.toISOString(), false);
    setTimeRecordStatus("");
    showToast(savedOffline ? "Saved on this device. It will sync when you reconnect." : label + " recorded.");
  } catch (error) {
    setTimeRecordStatus("Could not record punch. " + error.message, "err");
  } finally {
    button.disabled = false;
  }
}

function localDateTimeToIso(date, time) {
  var value = new Date(date + "T" + time);
  if (Number.isNaN(value.getTime())) throw new Error("Enter a valid date and time.");
  return value.toISOString();
}

$("quickLogIn").addEventListener("click", function () {
  handleQuickPunch("in", $("quickLogIn"));
});

$("quickLogOut").addEventListener("click", function () {
  handleQuickPunch("out", $("quickLogOut"));
});

$("manualTimeForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  var button = $("manualTimeForm").querySelector("button[type=submit]");
  var workDate = $("manualPunchDate").value;
  var field = $("manualPunchType").value;
  if (workDate > todayString()) {
    setTimeRecordStatus("Manual punches must be for today or an earlier date.", "err");
    return;
  }
  button.disabled = true;
  setTimeRecordStatus("Saving manual punch...");
  try {
    var savedOffline = await saveTimePunch(
      workDate,
      field,
      localDateTimeToIso(workDate, $("manualPunchTime").value),
      true
    );
    var label = $("manualPunchType").selectedOptions[0].textContent;
    setTimeRecordStatus("");
    showToast(savedOffline ? "Saved on this device. It will sync when you reconnect." : "Manual " + label + " saved.");
  } catch (error) {
    setTimeRecordStatus("Could not save manual punch. " + error.message, "err");
  } finally {
    button.disabled = false;
  }
});

$("manualPunchDate").value = todayString();
$("manualPunchDate").max = todayString();
var manualTimeNow = new Date();
$("manualPunchTime").value = String(manualTimeNow.getHours()).padStart(2, "0") + ":" +
  String(manualTimeNow.getMinutes()).padStart(2, "0");

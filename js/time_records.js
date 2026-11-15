var timeRecordFields = ["morning_in", "morning_out", "afternoon_in", "afternoon_out"];

function setTimeRecordStatus(text, kind) {
  $("timeRecordStatus").textContent = text;
  $("timeRecordStatus").className = "message " + (kind || "");
}

function renderTimeShareGroups() {
  var select = $("timeShareGroup");
  var currentValue = timeShareWorkspaceId;
  select.textContent = "";
  var privateOption = document.createElement("option");
  privateOption.value = "";
  privateOption.textContent = "Private — only me";
  select.appendChild(privateOption);
  groups.forEach(function (group) {
    var option = document.createElement("option");
    option.value = group.id;
    option.textContent = "Share with " + group.name;
    select.appendChild(option);
  });
  if (!groups.some(function (group) { return group.id === currentValue; })) currentValue = "";
  select.value = currentValue;
  timeShareWorkspaceId = select.value;
}

function formatPunchTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function renderTimeRecordTable(container, records, emptyMessage) {
  container.textContent = "";
  if (!records.length) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  var showName = records.some(function (record) { return !!record.workspace_id; });
  var table = document.createElement("table");
  table.className = "records-table";
  var head = document.createElement("thead");
  var headerRow = document.createElement("tr");
  ["Date"].concat(showName ? ["Name"] : []).concat([
    "Morning In", "Morning Out", "Afternoon In", "Afternoon Out"
  ]).forEach(function (label) {
    var cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headerRow.appendChild(cell);
  });
  head.appendChild(headerRow);
  table.appendChild(head);

  var body = document.createElement("tbody");
  records.forEach(function (record) {
    var row = document.createElement("tr");
    var dateCell = document.createElement("td");
    dateCell.textContent = record.work_date;
    row.appendChild(dateCell);
    if (showName) {
      var nameCell = document.createElement("td");
      nameCell.textContent = record.workspace_id
        ? record.profiles && record.profiles.full_name || "Group member"
        : "";
      row.appendChild(nameCell);
    }
    timeRecordFields.forEach(function (field) {
      var cell = document.createElement("td");
      cell.textContent = formatPunchTime(record[field]);
      row.appendChild(cell);
    });
    body.appendChild(row);
  });
  table.appendChild(body);
  container.appendChild(table);
}

function renderTimeRecords() {
  renderTimeShareGroups();
  var todaysRecord = timeRecords.find(function (record) {
    return record.user_id === currentUser.id && record.work_date === todayString();
  });
  if (todaysRecord) {
    timeShareWorkspaceId = todaysRecord.workspace_id || "";
    if (timeShareWorkspaceId && !$("timeShareGroup").querySelector("option[value='" + timeShareWorkspaceId + "']")) {
      var sharedOption = document.createElement("option");
      sharedOption.value = timeShareWorkspaceId;
      sharedOption.textContent = "Shared group";
      $("timeShareGroup").appendChild(sharedOption);
    }
    $("timeShareGroup").value = timeShareWorkspaceId;
    timeShareWorkspaceId = $("timeShareGroup").value;
    $("timeShareGroup").disabled = true;
  } else {
    $("timeShareGroup").disabled = false;
  }
  renderTimeRecordTable($("timeRecordsTable"), timeRecords, "No time records yet.");
}

async function loadTimeRecords() {
  var result = await supabaseClient
    .from("time_records")
    .select("id, user_id, workspace_id, work_date, morning_in, morning_out, afternoon_in, afternoon_out, profiles(full_name)")
    .order("work_date", { ascending: false })
    .limit(30);
  if (result.error) throw result.error;
  timeRecords = result.data || [];
  renderTimeRecords();
}

async function saveTimePunch(workDate, field, timestamp, allowCorrection) {
  var result = await supabaseClient.rpc("record_time_punch", {
    target_date: workDate,
    punch_slot: field,
    punched_at: timestamp,
    target_workspace: timeShareWorkspaceId || null,
    allow_correction: allowCorrection
  });
  if (result.error) throw result.error;
  await loadTimeRecords();
  await loadDashboardData();
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
    await saveTimePunch(todayString(), field, now.toISOString(), false);
    setTimeRecordStatus(label + " recorded.", "ok");
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

$("timeShareGroup").addEventListener("change", function () {
  timeShareWorkspaceId = $("timeShareGroup").value;
});

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
    await saveTimePunch(
      workDate,
      field,
      localDateTimeToIso(workDate, $("manualPunchTime").value),
      true
    );
    var label = $("manualPunchType").selectedOptions[0].textContent;
    setTimeRecordStatus("Manual " + label + " saved.", "ok");
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

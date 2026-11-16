function renderDashboard() {
  var list = $("dashboardAccomplishments");
  list.textContent = "";
  if (!recentDashboardAccomplishments.length) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No accomplishments recorded yet.";
    list.appendChild(empty);
  } else {
    recentDashboardAccomplishments.forEach(function (entry) {
      var card = document.createElement("article");
      card.className = "dashboard-entry";
      var copy = document.createElement("div");
      var task = document.createElement("h3");
      task.textContent = entry.task;
      var meta = document.createElement("p");
      meta.className = "entry-meta";
      var collectionName = entry.logbooks && entry.logbooks.name || "Collection";
      meta.textContent = dateLabel(entry.log_date) + " · " + collectionName;
      copy.appendChild(task);
      copy.appendChild(meta);
      card.appendChild(copy);

      var button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "Open collection";
      button.addEventListener("click", function () {
        openLogbook(entry.logbook_id, "logs");
      });
      card.appendChild(button);
      list.appendChild(card);
    });
  }
  renderDashboardTimeRecords();
}

function renderDashboardTimeRecords() {
  var list = $("dashboardTimeRecords");
  list.textContent = "";
  var records = timeRecords.slice(0, 5);
  if (!records.length) {
    var empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No time records yet.";
    list.appendChild(empty);
    return;
  }

  records.forEach(function (record) {
    var card = document.createElement("article");
    card.className = "dashboard-time-card";
    var date = document.createElement("h3");
    date.textContent = dateLabel(record.work_date);
    card.appendChild(date);

    var periods = document.createElement("div");
    periods.className = "dashboard-time-periods";
    [
      { name: "Morning", fields: [["In", "morning_in"], ["Out", "morning_out"]] },
      { name: "Afternoon", fields: [["In", "afternoon_in"], ["Out", "afternoon_out"]] }
    ].forEach(function (period) {
      var section = document.createElement("section");
      section.className = "dashboard-time-period";
      var heading = document.createElement("h4");
      heading.textContent = period.name;
      section.appendChild(heading);
      var punches = document.createElement("div");
      punches.className = "dashboard-time-punches";
      period.fields.forEach(function (punch) {
        var item = document.createElement("div");
        item.className = "dashboard-time-punch";
        var label = document.createElement("span");
        label.textContent = punch[0];
        var time = document.createElement("strong");
        time.textContent = formatPunchTime(record[punch[1]]);
        item.appendChild(label);
        item.appendChild(time);
        punches.appendChild(item);
      });
      section.appendChild(punches);
      periods.appendChild(section);
    });
    card.appendChild(periods);
    list.appendChild(card);
  });
}

async function loadDashboardData() {
  var result = await supabaseClient
    .from("accomplishments")
    .select("id, log_date, task, logbook_id, logbooks(name)")
    .order("log_date", { ascending: false })
    .limit(5);
  if (result.error) throw result.error;
  recentDashboardAccomplishments = result.data || [];
  renderDashboard();
}

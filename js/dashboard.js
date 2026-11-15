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
  renderTimeRecordTable(
    $("dashboardTimeRecords"),
    timeRecords.slice(0, 5),
    "No time records yet."
  );
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

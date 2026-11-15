function setActiveView(view) {
  var views = {
    dashboard: $("dashboardView"),
    logs: $("logsView"),
    logbooks: $("logbooksView"),
    entry: $("entryView"),
    team: $("teamView"),
    timeRecords: $("timeRecordsView")
  };
  if (!views[view]) return;
  var titles = {
    dashboard: "Dashboard",
    logs: "Accomplishments",
    logbooks: "Collections",
    entry: "Enter New Entry",
    team: "Team",
    timeRecords: "Time Records"
  };

  Object.keys(views).forEach(function (name) {
    views[name].hidden = name !== view;
  });
  $("titleText").textContent = titles[view];
  $("collectionsNav").classList.toggle("active", view === "logs" || view === "logbooks");
  document.querySelectorAll(".nav-item").forEach(function (item) {
    var itemView = item.getAttribute("data-view");
    var current = itemView === view;
    var active = current || (view === "logs" && itemView === "logbooks");
    item.classList.toggle("active", active);
    if (current) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll(".collection-nav-item").forEach(function (item) {
    var active = view === "logs" && activeLogbook &&
      item.getAttribute("data-logbook-id") === activeLogbook.id;
    item.classList.toggle("active", !!active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  closeMenu();
}

function toggleCollectionNavigation() {
  var list = $("collectionNavList");
  var toggle = $("collectionDropdownToggle");
  list.hidden = !list.hidden;
  var expanded = !list.hidden;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", expanded ? "Hide collections" : "Show collections");
}

function openMenu() {
  $("sidebar").classList.add("open");
  $("menuBackdrop").hidden = false;
  $("menuToggle").setAttribute("aria-expanded", "true");
}

function closeMenu() {
  if (window.matchMedia("(max-width: 620px)").matches) {
    $("sidebar").classList.remove("open");
    $("menuToggle").setAttribute("aria-expanded", "false");
  }
  $("menuBackdrop").hidden = true;
}

function toggleMenu() {
  if (window.matchMedia("(max-width: 620px)").matches) {
    if ($("sidebar").classList.contains("open")) closeMenu();
    else openMenu();
    return;
  }
  var collapsed = $("app").classList.toggle("sidebar-collapsed");
  $("menuToggle").setAttribute("aria-expanded", String(!collapsed));
}

document.querySelectorAll(".nav-item").forEach(function (item) {
  item.addEventListener("click", function () {
    var view = item.getAttribute("data-view");
    if (item.id === "collectionsNavButton") toggleCollectionNavigation();
    setActiveView(view);
    if (view === "dashboard") {
      loadDashboardData().catch(function (error) {
        setWorkspaceStatus("Could not load dashboard. " + error.message, "err");
      });
    } else if (view === "timeRecords") {
      loadTimeRecords().catch(function (error) {
        setWorkspaceStatus("Could not load time records. " + error.message, "err");
      });
    }
  });
});

$("collectionDropdownToggle").addEventListener("click", toggleCollectionNavigation);
$("menuToggle").addEventListener("click", toggleMenu);
$("closeMenu").addEventListener("click", closeMenu);
$("menuBackdrop").addEventListener("click", closeMenu);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeMenu();
});

initializeAuth().catch(function (error) {
  showLogin();
  setAuthStatus("Could not initialize authentication. " + error.message, "err");
});

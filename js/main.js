function setActiveView(view) {
  var views = {
    dashboard: $("dashboardView"),
    logs: $("logsView"),
    report: $("reportView"),
    logbooks: $("logbooksView"),
    entry: $("entryView"),
    team: $("teamView"),
    timeRecords: $("timeRecordsView"),
    integrations: $("integrationsView")
  };
  if (!views[view]) return;
  var titles = {
    dashboard: "Dashboard",
    logs: "Accomplishments",
    report: "Generated Report",
    logbooks: "Collections",
    entry: "Enter New Entry",
    team: "Team",
    timeRecords: "Time Records",
    integrations: "Integrations"
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

var pullRefreshStartY = null;
var pullRefreshStartX = null;
var pullRefreshDistance = 0;
var pullRefreshThreshold = 88;
var pullRefreshInProgress = false;
var offlineSyncInProgress = false;

function getPageScrollTop() {
  var scrollingElement = document.scrollingElement || document.documentElement;
  return Math.max(window.scrollY || 0, scrollingElement.scrollTop || 0, document.body.scrollTop || 0);
}

function refreshWorkspaceData() {
  if (!currentUser || pullRefreshInProgress) return;
  if (window.navigator.onLine === false) {
    setWorkspaceStatus("You are offline. Saved records will sync when you reconnect.");
    return;
  }

  pullRefreshInProgress = true;
  setWorkspaceStatus("Refreshing...");
  syncOfflineActions(false).catch(function (error) {
    showToast("Saved offline records could not sync. " + error.message, "err");
  }).then(function () {
    return loadWorkspaceData();
  }).then(function () {
    setWorkspaceStatus("");
  }).catch(function (error) {
    setWorkspaceStatus("");
    showToast("Could not refresh data. " + (error && error.message ? error.message : String(error)), "err");
  }).then(function () {
    pullRefreshInProgress = false;
  });
}

function cancelPullRefresh() {
  pullRefreshStartY = null;
  pullRefreshStartX = null;
  pullRefreshDistance = 0;
}

function startPullRefresh(event) {
  if (!currentUser || $("app").hidden || pullRefreshInProgress || getPageScrollTop() > 0 || event.touches.length !== 1) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, button, a, [contenteditable=true], #sidebar")) return;
  pullRefreshStartY = event.touches[0].clientY;
  pullRefreshStartX = event.touches[0].clientX;
  pullRefreshDistance = 0;
}

function movePullRefresh(event) {
  if (pullRefreshStartY === null) return;
  if (event.touches.length !== 1) {
    cancelPullRefresh();
    return;
  }
  var touch = event.touches[0];
  var horizontalDistance = touch.clientX - pullRefreshStartX;
  var distance = touch.clientY - pullRefreshStartY;
  if (Math.abs(horizontalDistance) > 12 && Math.abs(horizontalDistance) > distance) {
    cancelPullRefresh();
    return;
  }

  if (distance <= 0) {
    cancelPullRefresh();
    return;
  }

  pullRefreshDistance = distance;
  if (event.cancelable) event.preventDefault();
}

function endPullRefresh() {
  if (pullRefreshStartY === null) return;
  var shouldRefresh = pullRefreshDistance >= pullRefreshThreshold;
  pullRefreshStartY = null;
  pullRefreshStartX = null;
  pullRefreshDistance = 0;
  if (shouldRefresh) refreshWorkspaceData();
}

async function updateOfflineStatus() {
  var status = $("offlineStatus");
  var button = $("offlineSyncButton");
  if (!currentUser) {
    status.hidden = true;
    return;
  }

  var pending;
  try {
    pending = await getPendingOfflineActions(currentUser.id);
  } catch (error) {
    console.error("Could not read saved offline records.", error);
    status.hidden = false;
    $("offlineStatusMessage").textContent = "Offline storage is unavailable. New records cannot be saved without a connection.";
    button.hidden = true;
    return;
  }

  var failed = pending.find(function (action) { return action.lastError; });
  if (window.navigator.onLine !== false && !pending.length) {
    status.hidden = true;
    return;
  }

  status.hidden = false;
  if (window.navigator.onLine === false) {
    $("offlineStatusMessage").textContent = "Offline. New entries and time records will be saved on this device." +
      (pending.length ? " " + pending.length + " waiting to sync." : "");
  } else if (offlineSyncInProgress) {
    $("offlineStatusMessage").textContent = "Syncing " + pending.length + " saved offline record" + (pending.length === 1 ? "" : "s") + "...";
  } else {
    $("offlineStatusMessage").textContent = pending.length + " saved offline record" +
      (pending.length === 1 ? " is" : "s are") + " waiting to sync." +
      (failed ? " " + failed.lastError : "");
  }
  button.hidden = window.navigator.onLine === false || !pending.length;
  button.disabled = offlineSyncInProgress;
}

async function syncOfflineActions(refreshAfterSync) {
  if (!currentUser || window.navigator.onLine === false || offlineSyncInProgress) return;
  offlineSyncInProgress = true;
  var syncedCount = 0;
  var attentionErrors = [];
  try {
    var pending = await getPendingOfflineActions(currentUser.id);
    for (var index = 0; index < pending.length; index += 1) {
      var action = pending[index];
      try {
        if (action.type === "accomplishment") {
          if (!action.payload || action.payload.submitted_by !== currentUser.id || !action.payload.id) {
            throw new Error("This saved accomplishment does not match your signed-in account.");
          }
          await syncOfflineAccomplishment(action.payload);
        } else if (action.type === "time_punch") {
          if (action.userId !== currentUser.id) {
            throw new Error("This saved time record does not match your signed-in account.");
          }
          await syncQueuedTimePunch(action);
        } else {
          throw new Error("This saved record type is not supported.");
        }
        await removePendingOfflineAction(action.id);
        syncedCount += 1;
      } catch (error) {
        if (isNetworkUnavailable(error)) break;
        action.lastError = error.message || String(error);
        await savePendingOfflineAction(action);
        attentionErrors.push(action.lastError);
      }
    }

    if (syncedCount && refreshAfterSync) await loadWorkspaceData();
    if (attentionErrors.length) {
      showToast("A saved offline record needs attention. " + attentionErrors[0], "err");
    } else if (syncedCount) {
      showToast("Synced " + syncedCount + " saved offline record" + (syncedCount === 1 ? "." : "s."));
    }
  } finally {
    offlineSyncInProgress = false;
    await updateOfflineStatus();
  }
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
    } else if (view === "integrations") {
      loadIntegrationsSettings().catch(function (error) {
        setIntegrationStatus("Could not load integration settings. " + error.message, "err");
      });
    }
  });
});

$("collectionDropdownToggle").addEventListener("click", toggleCollectionNavigation);
$("menuToggle").addEventListener("click", toggleMenu);
$("offlineSyncButton").addEventListener("click", function () {
  syncOfflineActions(true).catch(function (error) {
    showToast("Could not sync saved records. " + error.message, "err");
  });
});
document.addEventListener("touchstart", startPullRefresh, { passive: true, capture: true });
document.addEventListener("touchmove", movePullRefresh, { passive: false, capture: true });
document.addEventListener("touchend", endPullRefresh, { passive: true, capture: true });
document.addEventListener("touchcancel", cancelPullRefresh, { passive: true, capture: true });
$("closeMenu").addEventListener("click", closeMenu);
$("menuBackdrop").addEventListener("click", closeMenu);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") closeMenu();
});
window.addEventListener("offline", function () {
  updateOfflineStatus();
});
window.addEventListener("online", function () {
  syncOfflineActions(true).catch(function (error) {
    showToast("Could not sync saved records. " + error.message, "err");
  });
});

initializeAuth().catch(function (error) {
  showLogin();
  setAuthStatus("Could not initialize authentication. " + error.message, "err");
});

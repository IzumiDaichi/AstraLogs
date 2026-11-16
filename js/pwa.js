var installAppButton = document.getElementById("installAppButton");
var installPromptEvent = null;
var isInstalledApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

if (isInstalledApp) installAppButton.hidden = true;

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./service-worker.js").catch(function (error) {
      console.error("Could not register the AstraLogs service worker.", error);
    });
  });
}

window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  installPromptEvent = event;
});

window.addEventListener("appinstalled", function () {
  installPromptEvent = null;
  installAppButton.hidden = true;
  showToast("AstraLogs is installed.");
});

installAppButton.addEventListener("click", async function () {
  if (installPromptEvent) {
    var promptEvent = installPromptEvent;
    installPromptEvent = null;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (error) {
      console.error("Could not start the AstraLogs install prompt.", error);
      showToast("Could not start installation. Use your browser menu to install AstraLogs.", "err");
    }
    return;
  }

  var isAppleMobile = /iPhone|iPad|iPod/.test(window.navigator.userAgent)
    || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  showToast(isAppleMobile
    ? "In Safari, tap Share, then Add to Home Screen."
    : "Choose Install app or Add to Home Screen from your browser menu.");
});

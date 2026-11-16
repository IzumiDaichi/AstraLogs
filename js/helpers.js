// Small tools used by every other file.

// Shortcut: $("name") instead of document.getElementById("name")
function $(id) { return document.getElementById(id); }

var toastDismissTimeout = null;

function showToast(message, kind) {
  var toast = $("toastNotification");
  window.clearTimeout(toastDismissTimeout);
  toast.classList.remove("closing");
  $("toastMessage").textContent = message;
  toast.className = "toast-notification" + (kind === "err" ? " error" : "");
  toast.hidden = false;
}

function dismissToast() {
  var toast = $("toastNotification");
  if (toast.hidden || toast.classList.contains("closing")) return;
  toast.classList.add("closing");
  toastDismissTimeout = window.setTimeout(function () {
    toast.hidden = true;
    toast.classList.remove("closing");
  }, 220);
}

$("toastNotification").addEventListener("click", dismissToast);

// Today's date as YYYY-MM-DD, the format a date input understands.
function todayString() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

// Small tools used by every other file.

// Shortcut: $("name") instead of document.getElementById("name")
function $(id) { return document.getElementById(id); }

// Today's date as YYYY-MM-DD, the format a date input understands.
function todayString() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

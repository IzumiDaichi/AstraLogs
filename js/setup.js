function setAuthStatus(text, kind) {
  $("setupStatus").textContent = text;
  $("setupStatus").className = "message " + (kind || "");
}

function showLogin() {
  profile = null;
  currentUser = null;
  authMode = "login";
  $("app").hidden = true;
  $("setup").hidden = false;
  $("loginForm").hidden = false;
  $("profileForm").hidden = true;
  updateAuthMode();
  $("authDescription").hidden = false;
  $("loginForm").querySelector("button[type=submit]").disabled = !isSupabaseConfigured();
  $("loginPassword").value = "";
  setAuthStatus("");
}

function showProfileForm() {
  $("app").hidden = true;
  $("setup").hidden = false;
  $("loginForm").hidden = true;
  $("profileForm").hidden = false;
  $("authTitle").textContent = "Edit your profile";
  $("authDescription").hidden = true;
  $("myName").value = profile ? profile.myName : "";
  $("myDept").value = profile ? profile.myDept : "";
  $("registrationNotice").hidden = true;
  $("cancelProfile").hidden = false;
  $("setupStatus").textContent = "";
  $("myName").focus();
}

async function loadProfileForUser(user) {
  currentUser = user;
  var result = await supabaseClient
    .from("profiles")
    .select("id, email, username, full_name, department")
    .eq("id", user.id)
    .maybeSingle();
  if (result.error) {
    showLogin();
    setAuthStatus("Could not load your profile. Check the Supabase schema and access policies. " + result.error.message, "err");
    return;
  }
  var accountName = result.data && result.data.username;
  if (!accountName) {
    accountName = user.user_metadata.username || normalizeUsername(result.data && result.data.full_name || "") ||
      ("user" + user.id.replace(/-/g, "").slice(0, 12));
    var upgradedProfile = await supabaseClient.from("profiles").upsert({
      id: user.id,
      email: user.email,
      username: accountName,
      full_name: result.data ? result.data.full_name : accountName,
      department: result.data ? result.data.department : "Unspecified"
    }, { onConflict: "id" });
    if (upgradedProfile.error) throw upgradedProfile.error;
  }
  profile = {
    id: user.id,
    email: user.email,
    username: accountName,
    myName: result.data ? result.data.full_name : accountName,
    myDept: result.data ? result.data.department : "Unspecified",
    formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
  };
  await showApp();
}

async function showApp() {
  $("setup").hidden = true;
  $("app").hidden = false;
  $("titleText").textContent = "AstraLogs";
  $("submitterName").textContent = profile.myName;
  $("userAvatar").textContent = profile.myName.trim().charAt(0).toUpperCase();
  document.title = "AstraLogs";
  if (!$("filterDay").value) $("filterDay").value = todayString();
  if (!$("filterWeek").value) $("filterWeek").value = todayString();
  if (!$("filterFrom").value) $("filterFrom").value = todayString();
  if (!$("filterTo").value) $("filterTo").value = todayString();
  setDateToToday();
  selected = [profile.myName];
  renderPeople();
  renderHistory();
  setActiveView("dashboard");
  setWorkspaceStatus("");
  await loadWorkspaceData();
}

async function initializeAuth() {
  if (!isSupabaseConfigured()) {
    showLogin();
    setAuthStatus(getSupabaseSetupError(), "err");
    return;
  }
  var result = await supabaseClient.auth.getSession();
  if (result.error) {
    showLogin();
    setAuthStatus("Could not restore your sign-in session. " + result.error.message, "err");
    return;
  }
  if (result.data.session) await loadProfileForUser(result.data.session.user);
  else showLogin();

  supabaseClient.auth.onAuthStateChange(function (event) {
    if (event === "SIGNED_OUT" && !$("app").hidden) showLogin();
  });
}

function normalizeUsername(value) {
  return value.trim().toLowerCase();
}

function isValidUsername(value) {
  return /^[a-z0-9._-]{3,30}$/.test(value);
}

function usernameAuthEmail(username) {
  return username + "@users.astralogs.example.com";
}

function legacyUsernameAuthEmail(username) {
  return username + "@users.accomplishment.invalid";
}

function updateAuthMode() {
  var registering = authMode === "register";
  $("authTitle").textContent = registering ? "Create your account" : "Sign in to your log";
  $("authDescription").textContent = registering
    ? "Choose a username and password to join the shared accomplishment log."
    : "Sign in with your username and password.";
  $("loginUsername").autocomplete = registering ? "username" : "username";
  $("loginPassword").autocomplete = registering ? "new-password" : "current-password";
  $("loginPassword").minLength = registering ? 8 : 0;
  $("confirmPasswordField").hidden = !registering;
  $("confirmPassword").required = registering;
  $("confirmPassword").value = "";
  $("authSubmit").textContent = registering ? "Create account" : "Sign in";
  $("authModeToggle").textContent = registering ? "Back to sign in" : "Create account";
  $("registrationNotice").hidden = !registering;
}

$("loginForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!isSupabaseConfigured()) {
    setAuthStatus(getSupabaseSetupError(), "err");
    return;
  }
  var username = normalizeUsername($("loginUsername").value);
  if (!isValidUsername(username)) {
    setAuthStatus("Use 3–30 characters: letters, numbers, periods, underscores, or hyphens.", "err");
    return;
  }
  var password = $("loginPassword").value;
  if (authMode === "register") {
    if (password.length < 8) {
      setAuthStatus("Password must be at least 8 characters.", "err");
      return;
    }
    if (password !== $("confirmPassword").value) {
      setAuthStatus("The passwords do not match.", "err");
      return;
    }
    setAuthStatus("Creating account...");
    var signup = await supabaseClient.auth.signUp({
      email: usernameAuthEmail(username),
      password: password,
      options: { data: { username: username } }
    });
    if (signup.error) {
      var registrationError = signup.error.message || "Unknown authentication error.";
      if (/email.*invalid|invalid.*email/i.test(registrationError)) {
        setAuthStatus("Supabase rejected the app's internal sign-in address. The updated email format is enabled; reload the app and try again. " + registrationError, "err");
      } else {
        setAuthStatus("Could not create account. The username may already be taken. " + registrationError, "err");
      }
      return;
    }
    if (!signup.data.session) {
      setAuthStatus("Supabase still requires email confirmation. Turn off Confirm email in Supabase Authentication settings to enable username-only registration.", "err");
      return;
    }
    currentUser = signup.data.user;
    var newProfile = await supabaseClient.from("profiles").insert({
      id: currentUser.id,
      email: currentUser.email,
      username: username,
      full_name: username,
      department: "Unspecified"
    });
    if (newProfile.error) {
      await supabaseClient.auth.signOut();
      setAuthStatus("Account was created, but its profile could not be saved. " + newProfile.error.message, "err");
      return;
    }
    profile = {
      id: currentUser.id,
      email: currentUser.email,
      username: username,
      myName: username,
      myDept: "Unspecified",
      formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
    };
    $("loginPassword").value = "";
    $("confirmPassword").value = "";
    try {
      await showApp();
    } catch (error) {
      setWorkspaceStatus("Account created, but your logbooks and groups could not be loaded. " + error.message, "err");
    }
    return;
  }

  setAuthStatus("Signing in...");
  var result = await supabaseClient.auth.signInWithPassword({
    email: usernameAuthEmail(username),
    password: password
  });
  if (result.error && /invalid login credentials/i.test(result.error.message || "")) {
    result = await supabaseClient.auth.signInWithPassword({
      email: legacyUsernameAuthEmail(username),
      password: password
    });
  }
  if (result.error) {
    setAuthStatus("Sign-in failed. Check your username and password.", "err");
    return;
  }
  $("loginPassword").value = "";
  try {
    await loadProfileForUser(result.data.user);
  } catch (error) {
    await supabaseClient.auth.signOut();
    showLogin();
    setAuthStatus("Could not load your logbooks and groups. " + error.message, "err");
  }
});

$("profileForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  if (!currentUser || !isSupabaseConfigured()) {
    showLogin();
    return;
  }
  var name = $("myName").value.trim();
  var department = $("myDept").value.trim();
  var result = await supabaseClient.from("profiles").upsert({
    id: currentUser.id,
    email: currentUser.email,
    username: profile.username,
    full_name: name,
    department: department
  }, { onConflict: "id" });
  if (result.error) {
    setAuthStatus("Could not save your profile. " + result.error.message, "err");
    return;
  }
  profile = {
    id: currentUser.id,
    email: currentUser.email,
    username: profile.username,
    myName: name,
    myDept: department,
    formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
  };
  try {
    await showApp();
  } catch (error) {
    setWorkspaceStatus("Profile saved, but your logbooks and groups could not be loaded. " + error.message, "err");
  }
});

$("editSetup").addEventListener("click", function () { showProfileForm(false); });
$("cancelProfile").addEventListener("click", function () {
  if (profile) showApp();
});
$("signOut").addEventListener("click", async function () {
  var result = await supabaseClient.auth.signOut();
  if (result.error) setWorkspaceStatus("Could not sign out. " + result.error.message, "err");
});

$("authModeToggle").addEventListener("click", function () {
  authMode = authMode === "login" ? "register" : "login";
  updateAuthMode();
  $("loginForm").querySelector("button[type=submit]").disabled = !isSupabaseConfigured();
  setAuthStatus("");
});

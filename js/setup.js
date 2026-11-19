function setAuthStatus(text, kind) {
  $("setupStatus").textContent = text;
  $("setupStatus").className = "message " + (kind || "");
}

function showLogin() {
  profile = null;
  currentUser = null;
  selectedReportEntryIds.clear();
  clearReportPreview();
  updateReportSelectionUI();
  $("integrationApiKey").value = "";
  if (typeof window.aiIntegrationSettings !== "undefined") window.aiIntegrationSettings = null;
  authMode = "login";
  $("app").hidden = true;
  $("setup").hidden = false;
  $("loginForm").hidden = false;
  $("profileForm").hidden = true;
  updateAuthMode();
  $("authDescription").hidden = false;
  $("loginForm").querySelector("button[type=submit]").disabled = !isSupabaseConfigured();
  $("loginPassword").value = "";
  $("registerNickname").value = "";
  setAuthStatus("");
}

function showProfileForm() {
  $("app").hidden = true;
  $("setup").hidden = false;
  $("loginForm").hidden = true;
  $("profileForm").hidden = false;
  $("authTitle").textContent = "Edit your profile";
  $("authDescription").hidden = true;
  $("myNickname").value = profile ? profile.nickname : "";
  $("myDept").value = profile ? profile.myDept : "";
  $("registrationNotice").hidden = true;
  $("cancelProfile").hidden = false;
  $("setupStatus").textContent = "";
  $("myNickname").focus();
}

async function loadProfileForUser(user) {
  currentUser = user;
  var result;
  try {
    result = await supabaseClient
      .from("profiles")
      .select("id, username, nickname, full_name, department")
      .eq("id", user.id)
      .maybeSingle();
  } catch (error) {
    if (await restoreOfflineSession(user, error)) return;
    throw error;
  }
  if (result.error) {
    if (await restoreOfflineSession(user, result.error)) return;
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
      username: accountName,
      nickname: result.data ? result.data.nickname || result.data.full_name : accountName,
      full_name: result.data ? result.data.full_name : accountName,
      department: result.data ? result.data.department : "Unspecified"
    }, { onConflict: "id" });
    if (upgradedProfile.error) throw upgradedProfile.error;
  }
  profile = {
    id: user.id,
    username: accountName,
    nickname: result.data ? result.data.nickname || result.data.full_name : accountName,
    myDept: result.data ? result.data.department : "Unspecified",
    formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
  };
  await showApp();
}

async function restoreOfflineSession(user, error) {
  if (!isNetworkUnavailable(error)) return false;
  var snapshot = await getOfflineSnapshot(user.id);
  if (!snapshot || !snapshot.profile) return false;
  profile = snapshot.profile;
  await showApp(snapshot);
  setWorkspaceStatus("Offline mode. Showing your last saved workspace data.");
  return true;
}

function restoreOfflineWorkspace(snapshot) {
  profile = snapshot.profile || profile;
  groups = snapshot.groups || [];
  selectedWorkspaceId = snapshot.selectedWorkspaceId || null;
  teamMembers = snapshot.teamMembers || [];
  entryMembers = snapshot.entryMembers || [];
  receivedInvites = snapshot.receivedInvites || [];
  sentInvites = snapshot.sentInvites || [];
  workspaceJoinRequests = snapshot.workspaceJoinRequests || [];
  logbooks = snapshot.logbooks || [];
  activeLogbook = logbooks.find(function (logbook) {
    return logbook.id === snapshot.activeLogbookId;
  }) || (logbooks.length ? logbooks[0] : null);
  accomplishments = snapshot.accomplishments || [];
  timeRecords = snapshot.timeRecords || [];
  recentDashboardAccomplishments = snapshot.recentDashboardAccomplishments || [];
  selected = [currentUser.id];
  renderGroupSelectors();
  renderTeam();
  renderLogbookSelectors();
  renderPeople();
  renderHistory();
  renderTimeRecords();
  renderDashboard();
}

async function showApp(offlineSnapshot) {
  $("setup").hidden = true;
  $("app").hidden = false;
  $("titleText").textContent = "AstraLogs";
  $("submitterName").textContent = profile.nickname;
  $("sidebarUsername").textContent = "@" + profile.username;
  $("userAvatar").textContent = profile.nickname.trim().charAt(0).toUpperCase();
  document.title = "AstraLogs";
  $("period").value = "all";
  if (!$("filterDay").value) $("filterDay").value = todayString();
  if (!$("filterWeek").value) $("filterWeek").value = todayString();
  if (!$("filterFrom").value) $("filterFrom").value = todayString();
  if (!$("filterTo").value) $("filterTo").value = todayString();
  updateFilterControls();
  setDateToToday();
  selected = [currentUser.id];
  renderPeople();
  renderHistory();
  setActiveView("dashboard");
  setWorkspaceStatus("");
  try {
    await loadWorkspaceData();
  } catch (error) {
    if (!isNetworkUnavailable(error)) throw error;
    var snapshot = offlineSnapshot || await getOfflineSnapshot(currentUser.id);
    if (!snapshot || !snapshot.profile) {
      throw new Error("You need to open AstraLogs online once before it can save records offline.");
    }
    restoreOfflineWorkspace(snapshot);
    setWorkspaceStatus("Offline mode. Showing your last saved workspace data.");
  }
  await updateOfflineStatus();
  if (window.navigator.onLine !== false) {
    try {
      await syncOfflineActions(true);
    } catch (error) {
      console.error("Could not sync saved offline records.", error);
      showToast("Saved offline records could not sync. " + error.message, "err");
    }
  }
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
    ? "Choose a username for login, a nickname shown on entries, and a password."
    : "Sign in with your username and password.";
  $("loginUsername").autocomplete = registering ? "username" : "username";
  $("loginPassword").autocomplete = registering ? "new-password" : "current-password";
  $("loginPassword").minLength = registering ? 8 : 0;
  $("registerNicknameField").hidden = !registering;
  $("registerNickname").required = registering;
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
    var nickname = $("registerNickname").value.trim();
    if (!nickname) {
      setAuthStatus("Enter a nickname.", "err");
      $("registerNickname").focus();
      return;
    }
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
      username: username,
      nickname: nickname,
      full_name: nickname,
      department: "Unspecified"
    });
    if (newProfile.error) {
      await supabaseClient.auth.signOut();
      setAuthStatus("Account was created, but its profile could not be saved. " + newProfile.error.message, "err");
      return;
    }
    profile = {
      id: currentUser.id,
      username: username,
      nickname: nickname,
      myDept: "Unspecified",
      formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
    };
    $("loginPassword").value = "";
    $("confirmPassword").value = "";
    $("registerNickname").value = "";
    try {
      await showApp();
      showToast("Account created.");
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
  var nickname = $("myNickname").value.trim();
  var department = $("myDept").value.trim();
  if (!nickname) {
    setAuthStatus("Enter a nickname.", "err");
    $("myNickname").focus();
    return;
  }
  var result = await supabaseClient.from("profiles").upsert({
    id: currentUser.id,
    username: profile.username,
    nickname: nickname,
    full_name: nickname,
    department: department
  }, { onConflict: "id" });
  if (result.error) {
    setAuthStatus("Could not save your profile. " + result.error.message, "err");
    return;
  }
  profile = {
    id: currentUser.id,
    username: profile.username,
    nickname: nickname,
    myDept: department,
    formTitle: SUPABASE_CONFIG.formTitle || "AstraLogs"
  };
  try {
    await showApp();
    showToast("Profile updated.");
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

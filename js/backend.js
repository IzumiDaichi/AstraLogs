var supabaseClient = null;
var supabaseConfigured = false;

if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    supabaseConfigured = true;
  } catch (error) {
    console.error("Could not initialize Supabase.", error);
  }
}

function isSupabaseConfigured() {
  return supabaseConfigured;
}

function getSupabaseSetupError() {
  if (!window.supabase) return "Supabase's browser library did not load. Check your internet connection and reload.";
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
    return "Connect a Supabase project first: add the project URL and publishable/anon key in js/supabase-config.js, then apply supabase/schema.sql.";
  }
  return "Supabase could not be initialized. Check the project URL and publishable/anon key in js/supabase-config.js.";
}

function uniqueById(items) {
  var seen = new Set();
  return items.filter(function (item) {
    if (!item || item.id == null || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function loadTeamMembers(workspaceId) {
  teamMembers = [];
  if (!workspaceId) {
    renderTeam();
    return;
  }
  var result = await supabaseClient
    .from("workspace_memberships")
    .select("user_id, role, profiles(id, username, full_name, department)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  teamMembers = uniqueById((result.data || []).map(function (membership) {
    var member = membership.profiles;
    return {
      id: member.id,
      username: member.username,
      full_name: member.full_name,
      department: member.department,
      role: membership.role
    };
  }));
  renderTeam();
}

async function loadEntryMembers() {
  entryMembers = [];
  if (!activeLogbook || !activeLogbook.workspace_id) {
    renderPeople();
    return;
  }
  var result = await supabaseClient
    .from("workspace_memberships")
    .select("user_id, profiles(id, username, full_name, department)")
    .eq("workspace_id", activeLogbook.workspace_id)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  entryMembers = uniqueById((result.data || []).map(function (membership) {
    return membership.profiles;
  }));
  renderPeople();
}

async function loadAccomplishments() {
  if (!activeLogbook) {
    accomplishments = [];
    renderHistory();
    return;
  }
  var pageSize = 1000;
  var offset = 0;
  var entries = [];
  while (true) {
    var result = await supabaseClient
      .from("accomplishments")
      .select("*")
      .eq("logbook_id", activeLogbook.id)
      .order("log_date", { ascending: false })
      .order("time_request", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    entries = entries.concat(result.data || []);
    if (!result.data || result.data.length < pageSize) break;
    offset += pageSize;
  }
  accomplishments = uniqueById(entries);
  renderHistory();
}

async function loadWorkspaceData() {
  var membershipResult = await supabaseClient
    .from("workspace_memberships")
    .select("workspace_id, role, workspaces(id, name, owner_id)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });
  if (membershipResult.error) throw membershipResult.error;
  groups = uniqueById((membershipResult.data || []).map(function (membership) {
    return {
      id: membership.workspaces.id,
      name: membership.workspaces.name,
      owner_id: membership.workspaces.owner_id,
      role: membership.role
    };
  }));
  if (!groups.some(function (group) { return group.id === selectedWorkspaceId; })) {
    selectedWorkspaceId = groups.length ? groups[0].id : null;
  }

  var incoming = await supabaseClient
    .from("workspace_invites")
    .select("id, workspace_id, invitee_username, invited_by_username, created_at, workspaces(name)")
    .eq("invitee_id", currentUser.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (incoming.error) throw incoming.error;
  receivedInvites = uniqueById(incoming.data || []);

  await loadSentInvites();
  await loadTeamMembers(selectedWorkspaceId);
  renderGroupSelectors();
  renderTeam();
  await loadLogbooks();
  await loadTimeRecords();
  await loadDashboardData();
}

async function loadSentInvites() {
  sentInvites = [];
  if (!selectedWorkspaceId) return;
  var outgoing = await supabaseClient
    .from("workspace_invites")
    .select("id, invitee_username, status, created_at")
    .eq("workspace_id", selectedWorkspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (outgoing.error) throw outgoing.error;
  sentInvites = uniqueById(outgoing.data || []);
}

async function loadLogbooks(preferredLogbookId) {
  var result = await supabaseClient
    .from("logbooks")
    .select("id, name, owner_id, workspace_id, created_at")
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  logbooks = uniqueById(result.data || []);
  var preferredLogbook = logbooks.find(function (logbook) { return logbook.id === preferredLogbookId; });
  if (preferredLogbook) {
    activeLogbook = preferredLogbook;
  } else if (!logbooks.some(function (logbook) { return activeLogbook && logbook.id === activeLogbook.id; })) {
    activeLogbook = logbooks.length ? logbooks[0] : null;
  } else {
    activeLogbook = logbooks.find(function (logbook) { return logbook.id === activeLogbook.id; });
  }
  renderLogbookSelectors();
  await loadEntryMembers();
  await loadAccomplishments();
}

async function selectLogbook(logbookId) {
  activeLogbook = logbooks.find(function (logbook) { return logbook.id === logbookId; }) || null;
  selected = [profile.myName];
  renderLogbookSelectors();
  await loadEntryMembers();
  await loadAccomplishments();
}

async function selectTeamGroup(workspaceId) {
  selectedWorkspaceId = workspaceId || null;
  await loadSentInvites();
  await loadTeamMembers(selectedWorkspaceId);
  renderGroupSelectors();
  renderTeam();
}

async function createLogbook(name, workspaceId) {
  var result = await supabaseClient.rpc("create_logbook", {
    logbook_name: name,
    target_workspace: workspaceId || null
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("The database did not return the new collection ID.");
  selected = [profile.myName];
  await loadLogbooks(result.data);
  activeLogbook = logbooks.find(function (logbook) { return logbook.id === result.data; }) || null;
  if (!activeLogbook) {
    throw new Error("The collection was created, but is not visible to your account. Check the logbooks SELECT policy.");
  }
}

async function saveAccomplishment(payload) {
  var result = await supabaseClient.from("accomplishments").insert(payload);
  if (result.error) throw result.error;
}

async function updateAccomplishment(id, changes) {
  var result = await supabaseClient
    .from("accomplishments")
    .update(changes)
    .eq("id", id)
    .eq("logbook_id", activeLogbook.id);
  if (result.error) throw result.error;
}

async function sendWorkspaceInvite(username, workspaceId) {
  var result = await supabaseClient.rpc("invite_user_to_workspace", {
    target_username: username,
    target_workspace: workspaceId
  });
  if (result.error) throw result.error;
}

async function respondToWorkspaceInvite(inviteId, accept) {
  var result = await supabaseClient.rpc("respond_to_workspace_invite", {
    invite_id: inviteId,
    accept_invite: accept
  });
  if (result.error) throw result.error;
}

async function createWorkspace(name) {
  var result = await supabaseClient.rpc("create_workspace", {
    workspace_name: name
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Could not create the group.");
  selectedWorkspaceId = result.data;
}

async function deleteAccomplishment(id) {
  var result = await supabaseClient
    .from("accomplishments")
    .delete()
    .eq("id", id)
    .eq("logbook_id", activeLogbook.id);
  if (result.error) throw result.error;
}

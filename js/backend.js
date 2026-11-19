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
    .select("user_id, role, profiles(id, username, nickname, department)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  teamMembers = uniqueById((result.data || []).map(function (membership) {
    var member = membership.profiles;
    return {
      id: member.id,
      username: member.username,
      nickname: member.nickname,
      department: member.department,
      role: membership.role
    };
  }));
  renderTeam();
}

async function loadEntryMembers() {
  entryMembers = [];
  var workspaceIds = groups.map(function (group) { return group.id; });
  if (!workspaceIds.length) {
    renderPeople();
    return;
  }
  var result = await supabaseClient
    .from("workspace_memberships")
    .select("user_id, profiles(id, username, nickname, department)")
    .in("workspace_id", workspaceIds)
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  entryMembers = uniqueById((result.data || []).map(function (membership) {
    return membership.profiles;
  }));
  renderPeople();
}

async function loadAccomplishments() {
  historyPage = 0;
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
    .select("workspace_id, role, workspaces(id, name, owner_id, invite_code)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: true });
  if (membershipResult.error) throw membershipResult.error;
  groups = uniqueById((membershipResult.data || []).map(function (membership) {
    return {
      id: membership.workspaces.id,
      name: membership.workspaces.name,
      owner_id: membership.workspaces.owner_id,
      invite_code: membership.workspaces.invite_code,
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
  await loadJoinRequests(selectedWorkspaceId);
  await loadTeamMembers(selectedWorkspaceId);
  renderGroupSelectors();
  renderTeam();
  await loadLogbooks();
  await loadTimeRecords();
  await loadDashboardData();
  await cacheOfflineWorkspaceSnapshot();
}

async function cacheOfflineWorkspaceSnapshot() {
  if (!currentUser || !profile) return;
  var snapshot = {
    profile: {
      id: profile.id,
      username: profile.username,
      nickname: profile.nickname,
      myDept: profile.myDept,
      formTitle: profile.formTitle
    },
    groups: groups,
    selectedWorkspaceId: selectedWorkspaceId,
    teamMembers: teamMembers,
    entryMembers: entryMembers,
    receivedInvites: receivedInvites,
    sentInvites: sentInvites,
    workspaceJoinRequests: workspaceJoinRequests,
    logbooks: logbooks,
    activeLogbookId: activeLogbook ? activeLogbook.id : null,
    accomplishments: accomplishments,
    timeRecords: timeRecords,
    recentDashboardAccomplishments: recentDashboardAccomplishments
  };
  try {
    await saveOfflineSnapshot(currentUser.id, snapshot);
  } catch (error) {
    console.error("Could not cache AstraLogs data for offline use.", error);
    showToast("Your online data loaded, but it could not be cached for offline use. " + error.message, "err");
  }
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

async function loadJoinRequests(workspaceId) {
  workspaceJoinRequests = [];
  var group = groups.find(function (item) { return item.id === workspaceId; });
  if (!group || group.owner_id !== currentUser.id) return;

  var result = await supabaseClient
    .from("workspace_join_requests")
    .select("id, workspace_id, user_id, requester_username, requester_nickname, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (result.error) throw result.error;
  workspaceJoinRequests = uniqueById(result.data || []);
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
  selectedReportEntryIds.clear();
  clearReportPreview();
  selected = [currentUser.id];
  renderLogbookSelectors();
  await loadEntryMembers();
  await loadAccomplishments();
}

async function selectTeamGroup(workspaceId) {
  selectedWorkspaceId = workspaceId || null;
  await loadSentInvites();
  await loadJoinRequests(selectedWorkspaceId);
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
  selected = [currentUser.id];
  await loadLogbooks(result.data);
  activeLogbook = logbooks.find(function (logbook) { return logbook.id === result.data; }) || null;
  if (!activeLogbook) {
    throw new Error("The collection was created, but is not visible to your account. Check the logbooks SELECT policy.");
  }
}

async function updateLogbook(logbookId, name) {
  var result = await supabaseClient
    .from("logbooks")
    .update({ name: name })
    .eq("id", logbookId)
    .eq("owner_id", currentUser.id)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Collection not found or you do not own it.");
}

async function deleteLogbook(logbookId) {
  var result = await supabaseClient
    .from("logbooks")
    .delete()
    .eq("id", logbookId)
    .eq("owner_id", currentUser.id)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Collection not found or you do not own it.");
}

async function updateTimeRecord(recordId, changes) {
  var result = await supabaseClient
    .from("time_records")
    .update(changes)
    .eq("id", recordId)
    .eq("user_id", currentUser.id)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Time record not found.");
}

async function deleteTimeRecord(recordId) {
  var existing = await supabaseClient
    .from("time_records")
    .select("id")
    .eq("id", recordId)
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("Time record not found or you do not own it.");

  var result = await supabaseClient
    .from("time_records")
    .delete()
    .eq("id", recordId)
    .eq("user_id", currentUser.id)
    .select("id")
    .maybeSingle();
  if (result.error) {
    if (result.error.code === "42501") {
      throw new Error("Supabase is missing delete permission. Apply the latest supabase/schema.sql.");
    }
    throw result.error;
  }
  if (!result.data) {
    throw new Error("Supabase blocked the delete. Apply the latest supabase/schema.sql to enable owner-only deletion.");
  }
}

async function saveAccomplishment(payload) {
  var result = await supabaseClient.from("accomplishments").insert(payload);
  if (result.error) throw result.error;
}

async function syncOfflineAccomplishment(payload) {
  var result = await supabaseClient.from("accomplishments").insert(payload);
  if (!result.error) return;
  if (result.error.code !== "23505") throw result.error;

  var existing = await supabaseClient
    .from("accomplishments")
    .select("id")
    .eq("id", payload.id)
    .eq("submitted_by", currentUser.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw result.error;
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

async function requestToJoinWorkspace(inviteCode) {
  var result = await supabaseClient.rpc("request_to_join_workspace", {
    target_invite_code: inviteCode
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("The database did not create a join request.");
}

async function respondToWorkspaceJoinRequest(requestId, approve) {
  var result = await supabaseClient.rpc("respond_to_workspace_join_request", {
    target_request: requestId,
    approve_request: approve
  });
  if (result.error) throw result.error;
}

async function removeWorkspaceMember(workspaceId, userId) {
  var result = await supabaseClient.rpc("remove_workspace_member", {
    target_workspace: workspaceId,
    target_user: userId
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("The database did not remove the group member.");
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

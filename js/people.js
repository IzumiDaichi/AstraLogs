function renderPeople() {
  var box = $("people");
  box.textContent = "";
  var people = entryMembers.slice();
  if (!people.some(function (member) { return member.id === currentUser.id; })) {
    people.unshift({
      id: currentUser.id,
      nickname: profile.nickname,
      department: profile.myDept
    });
  }

  people.forEach(function (member) {
    var chip = document.createElement("span");
    chip.className = "chip";
    var label = document.createElement("label");
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.indexOf(member.id) !== -1;
    checkbox.addEventListener("change", function () {
      if (checkbox.checked && selected.indexOf(member.id) === -1) {
        selected.push(member.id);
      } else {
        selected = selected.filter(function (id) { return id !== member.id; });
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(member.nickname));
    chip.appendChild(label);
    box.appendChild(chip);
  });
}

function appendGroupOptions(select, includePrivate, selectedId) {
  select.textContent = "";
  if (includePrivate) {
    var privateOption = document.createElement("option");
    privateOption.value = "";
    privateOption.textContent = "Private — only me";
    select.appendChild(privateOption);
  }
  groups.forEach(function (group) {
    var option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name + " — group can edit";
    select.appendChild(option);
  });
  if (selectedId && groups.some(function (group) { return group.id === selectedId; })) {
    select.value = selectedId;
  }
}

function renderGroupSelectors() {
  appendGroupOptions($("newLogbookGroup"), true);
  $("newLogbookGroup").value = "";

  var teamSelect = $("teamGroupSelect");
  teamSelect.textContent = "";
  if (!groups.length) {
    var empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "No groups yet";
    teamSelect.appendChild(empty);
    teamSelect.disabled = true;
  } else {
    teamSelect.disabled = false;
    groups.forEach(function (group) {
      var option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.name;
      teamSelect.appendChild(option);
    });
    teamSelect.value = selectedWorkspaceId || groups[0].id;
  }

  $("inviteForm").querySelector("button[type=submit]").disabled = !groups.length;
  $("sentInvitesSection").hidden = !selectedWorkspaceId;
  var selectedGroup = groups.find(function (group) { return group.id === selectedWorkspaceId; });
  $("groupInviteCodePanel").hidden = !selectedGroup;
  var inviteCode = selectedGroup && selectedGroup.invite_code
    ? String(selectedGroup.invite_code).toUpperCase()
    : "";
  var validInviteCode = /^[A-Z0-9]{5}$/.test(inviteCode);
  $("groupInviteCode").textContent = validInviteCode ? inviteCode : "Unavailable";
  $("copyGroupInviteCode").disabled = !validInviteCode;
  $("groupInviteCodeHint").textContent = selectedGroup && !validInviteCode
    ? "This group has an outdated code. Ask the owner to apply the latest supabase/schema.sql before sharing a new code."
    : "Share this code. The group owner must approve join requests.";
}

function renderTeam() {
  var list = $("teamList");
  var selectedGroup = groups.find(function (group) { return group.id === selectedWorkspaceId; });
  list.textContent = "";
  $("teamCount").textContent = String(groups.length);
  $("teamMemberCount").textContent = teamMembers.length + (teamMembers.length === 1 ? " member" : " members");
  $("teamDescription").textContent = groups.length
    ? "Invite people by username or share a group code. Code requests need owner approval."
    : "Create a group to invite collaborators or enter a code to request access.";

  if (!selectedWorkspaceId) {
    var emptyGroups = document.createElement("div");
    emptyGroups.className = "empty-state";
    emptyGroups.textContent = "Create a group or accept an invitation to collaborate.";
    list.appendChild(emptyGroups);
  } else if (!teamMembers.length) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No group members found.";
    list.appendChild(empty);
  } else {
    teamMembers.forEach(function (member) {
      var row = document.createElement("article");
      row.className = "team-member";
      var avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = member.nickname.trim().charAt(0).toUpperCase();
      var copy = document.createElement("div");
      copy.className = "team-member-copy";
      var name = document.createElement("strong");
      name.textContent = member.nickname;
      var details = document.createElement("span");
      details.textContent = "Username: @" + member.username + (member.id === currentUser.id ? " · You" : "");
      copy.appendChild(name);
      copy.appendChild(details);
      row.appendChild(avatar);
      row.appendChild(copy);
      if (selectedGroup && selectedGroup.owner_id === currentUser.id &&
          member.id !== currentUser.id && member.role !== "owner") {
        var removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "icon-button remove-member";
        removeButton.textContent = "×";
        removeButton.title = "Remove from group";
        removeButton.setAttribute("aria-label", "Remove @" + member.username + " from group");
        removeButton.addEventListener("click", function () {
          removeTeamMember(selectedGroup.id, member, removeButton);
        });
        row.appendChild(removeButton);
      }
      list.appendChild(row);
    });
  }

  renderInvites("receivedInvites", receivedInvites, true);
  renderInvites("sentInvites", sentInvites, false);
  renderJoinRequests();
}

async function removeTeamMember(workspaceId, member, button) {
  if (!window.confirm("Remove @" + member.username + " from this group? They will lose access to group-shared collections.")) return;
  button.disabled = true;
  try {
    await removeWorkspaceMember(workspaceId, member.id);
    await loadWorkspaceData();
    showToast("@" + member.username + " was removed from the group.");
  } catch (error) {
    button.disabled = false;
    showToast("Could not remove @" + member.username + ". " + error.message, "err");
  }
}

function renderJoinRequests() {
  var section = $("joinRequestsSection");
  var container = $("joinRequests");
  container.textContent = "";
  var group = groups.find(function (item) { return item.id === selectedWorkspaceId; });
  section.hidden = !group || group.owner_id !== currentUser.id;
  if (section.hidden) return;

  if (!workspaceJoinRequests.length) {
    var empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No pending join requests.";
    container.appendChild(empty);
    return;
  }

  workspaceJoinRequests.forEach(function (request) {
    var row = document.createElement("article");
    row.className = "team-member";
    var copy = document.createElement("div");
    copy.className = "team-member-copy";
    var name = document.createElement("strong");
    name.textContent = request.requester_nickname;
    var username = document.createElement("span");
    username.textContent = "@" + request.requester_username;
    copy.appendChild(name);
    copy.appendChild(username);
    row.appendChild(copy);

    var actions = document.createElement("div");
    actions.className = "invite-actions";
    [["Approve", true, "primary"], ["Decline", false, "secondary"]].forEach(function (action) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = action[2];
      button.textContent = action[0];
      button.addEventListener("click", function () {
        handleJoinRequestResponse(request.id, action[1], button);
      });
      actions.appendChild(button);
    });
    row.appendChild(actions);
    container.appendChild(row);
  });
}

async function handleJoinRequestResponse(requestId, approve, button) {
  button.disabled = true;
  try {
    await respondToWorkspaceJoinRequest(requestId, approve);
    await loadWorkspaceData();
    showToast(approve ? "Join request approved." : "Join request declined.");
  } catch (error) {
    button.disabled = false;
    $("workspaceStatus").textContent = "Could not respond to join request. " + error.message;
    $("workspaceStatus").className = "message err";
  }
}

function renderInvites(containerId, invitations, canRespond) {
  var container = $(containerId);
  container.textContent = "";
  if (!invitations.length) {
    var empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = canRespond ? "No pending invitations." : "No pending invitations for this group.";
    container.appendChild(empty);
    return;
  }

  invitations.forEach(function (invite) {
    var row = document.createElement("article");
    row.className = "team-member";
    var copy = document.createElement("div");
    copy.className = "team-member-copy";
    var title = document.createElement("strong");
    title.textContent = canRespond
      ? (invite.workspaces && invite.workspaces.name || "Group invitation")
      : "Invitation to @" + invite.invitee_username;
    var details = document.createElement("span");
    details.textContent = canRespond
      ? "From @" + invite.invited_by_username
      : "Waiting for them to accept";
    copy.appendChild(title);
    copy.appendChild(details);
    row.appendChild(copy);

    if (canRespond) {
      var actions = document.createElement("div");
      actions.className = "invite-actions";
      [["Accept", true, "primary"], ["Decline", false, "secondary"]].forEach(function (action) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = action[2];
        button.textContent = action[0];
        button.addEventListener("click", function () {
          handleInviteResponse(invite.id, invite.workspace_id, action[1], button);
        });
        actions.appendChild(button);
      });
      row.appendChild(actions);
    }
    container.appendChild(row);
  });
}

async function handleInviteResponse(inviteId, workspaceId, accept, button) {
  button.disabled = true;
  try {
    await respondToWorkspaceInvite(inviteId, accept);
    if (accept) selectedWorkspaceId = workspaceId;
    await loadWorkspaceData();
    $("inviteStatus").textContent = "";
    $("inviteStatus").className = "message";
    showToast(accept ? "Invitation accepted." : "Invitation declined.");
  } catch (error) {
    button.disabled = false;
    $("inviteStatus").textContent = "Could not respond to invitation. " + error.message;
    $("inviteStatus").className = "message err";
  }
}

async function handleInviteSubmit(event) {
  event.preventDefault();
  var username = $("inviteUsername").value.trim().toLowerCase();
  var workspaceId = selectedWorkspaceId;
  if (!workspaceId) {
    $("inviteStatus").textContent = "Create or select a group above before sending an invitation.";
    $("inviteStatus").className = "message err";
    return;
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    $("inviteStatus").textContent = "Enter a valid username (3–30 letters, numbers, periods, underscores, or hyphens).";
    $("inviteStatus").className = "message err";
    return;
  }
  try {
    await sendWorkspaceInvite(username, workspaceId);
    $("inviteUsername").value = "";
    $("inviteStatus").textContent = "";
    $("inviteStatus").className = "message";
    await loadWorkspaceData();
    showToast("Invitation sent. They must accept it before joining the group.");
  } catch (error) {
    $("inviteStatus").textContent = "Could not send invitation. " + error.message;
    $("inviteStatus").className = "message err";
  }
}

$("teamGroupSelect").addEventListener("change", function () {
  selectTeamGroup($("teamGroupSelect").value).catch(function (error) {
    $("workspaceStatus").textContent = "Could not load group. " + error.message;
    $("workspaceStatus").className = "message err";
  });
});

$("inviteForm").addEventListener("submit", handleInviteSubmit);

$("joinGroupForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  var inviteCode = $("joinGroupCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(inviteCode)) {
    $("joinGroupStatus").textContent = "Enter a valid 5-character invite code.";
    $("joinGroupStatus").className = "message err";
    return;
  }
  var button = $("joinGroupForm").querySelector("button[type=submit]");
  button.disabled = true;
  $("joinGroupStatus").textContent = "";
  $("joinGroupStatus").className = "message";
  try {
    await requestToJoinWorkspace(inviteCode);
    $("joinGroupCode").value = "";
    showToast("Join request sent. The group owner must approve it.");
  } catch (error) {
    var errorMessage = error && error.message ? error.message : "Unknown error.";
    if (/That invite code is not valid/i.test(errorMessage)) {
      errorMessage = "That code was not found. Ask the group owner to apply the latest supabase/schema.sql and share the current 5-character code.";
    } else if (error && (error.code === "PGRST202" || error.code === "42883")) {
      errorMessage = "The group invite database function is missing. Apply the latest supabase/schema.sql. " + errorMessage;
    }
    $("joinGroupStatus").textContent = "Could not request to join group. " + errorMessage;
    $("joinGroupStatus").className = "message err";
  } finally {
    button.disabled = false;
  }
});

$("copyGroupInviteCode").addEventListener("click", function () {
  var group = groups.find(function (item) { return item.id === selectedWorkspaceId; });
  if (!group || !/^[A-Z0-9]{5}$/.test(String(group.invite_code || "").toUpperCase())) return;
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    showToast("Clipboard access is unavailable. Select and copy the invite code.", "err");
    return;
  }
  navigator.clipboard.writeText(String(group.invite_code).toUpperCase()).then(function () {
    showToast("Group invite code copied.");
  }).catch(function (error) {
    showToast("Could not copy invite code. " + error.message, "err");
  });
});

$("createGroupForm").addEventListener("submit", async function (event) {
  event.preventDefault();
  var name = $("groupName").value.trim();
  if (!name) return;
  var button = document.querySelector("#createGroupForm button[type=submit]");
  button.disabled = true;
  $("createGroupStatus").textContent = "Creating group...";
  $("createGroupStatus").className = "message";
  try {
    await createWorkspace(name);
    $("groupName").value = "";
    $("createGroupStatus").textContent = "";
    $("createGroupStatus").className = "message";
    await loadWorkspaceData();
    showToast("Group created. Share its invite code; requests require approval.");
  } catch (error) {
    $("createGroupStatus").textContent = "Could not create group. " + error.message;
    $("createGroupStatus").className = "message err";
  } finally {
    button.disabled = false;
  }
});

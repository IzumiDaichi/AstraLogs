function renderPeople() {
  var box = $("people");
  box.textContent = "";
  var people = entryMembers.slice();
  if (!people.some(function (member) { return member.id === currentUser.id; })) {
    people.unshift({
      id: currentUser.id,
      full_name: profile.myName,
      department: profile.myDept
    });
  }

  people.forEach(function (member) {
    var chip = document.createElement("span");
    chip.className = "chip";
    var label = document.createElement("label");
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selected.indexOf(member.full_name) !== -1;
    checkbox.addEventListener("change", function () {
      if (checkbox.checked && selected.indexOf(member.full_name) === -1) {
        selected.push(member.full_name);
      } else {
        selected = selected.filter(function (name) { return name !== member.full_name; });
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(member.full_name));
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
}

function renderTeam() {
  var list = $("teamList");
  list.textContent = "";
  $("teamCount").textContent = String(groups.length);
  $("teamMemberCount").textContent = teamMembers.length + (teamMembers.length === 1 ? " member" : " members");
  $("teamDescription").textContent = groups.length
    ? "Choose a group to view its members and manage invitations."
    : "Create a group to invite collaborators and share collections.";

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
      avatar.textContent = member.full_name.trim().charAt(0).toUpperCase();
      var copy = document.createElement("div");
      copy.className = "team-member-copy";
      var name = document.createElement("strong");
      name.textContent = member.full_name;
      var details = document.createElement("span");
      details.textContent = "@" + member.username + (member.id === currentUser.id ? " · You" : "");
      copy.appendChild(name);
      copy.appendChild(details);
      row.appendChild(avatar);
      row.appendChild(copy);
      list.appendChild(row);
    });
  }

  renderInvites("receivedInvites", receivedInvites, true);
  renderInvites("sentInvites", sentInvites, false);
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
    $("inviteStatus").textContent = "Invitation sent. They must accept it before joining the group.";
    $("inviteStatus").className = "message ok";
    await loadWorkspaceData();
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
    $("createGroupStatus").textContent = "Group created.";
    $("createGroupStatus").className = "message ok";
    await loadWorkspaceData();
  } catch (error) {
    $("createGroupStatus").textContent = "Could not create group. " + error.message;
    $("createGroupStatus").className = "message err";
  } finally {
    button.disabled = false;
  }
});

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  username text,
  full_name text not null check (length(trim(full_name)) > 0),
  department text not null check (length(trim(department)) > 0),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique_idx
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now()
);

do $$
declare
  existing_key text;
  key_columns text[];
begin
  select constraint_row.conname, array_agg(attribute_row.attname order by key_column.ordinality)
  into existing_key, key_columns
  from pg_constraint constraint_row
  join unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality) on true
  join pg_attribute attribute_row
    on attribute_row.attrelid = constraint_row.conrelid
    and attribute_row.attnum = key_column.attnum
  where constraint_row.conrelid = 'public.workspace_memberships'::regclass
    and constraint_row.contype = 'p'
  group by constraint_row.conname;

  if existing_key is not null and key_columns <> array['workspace_id', 'user_id'] then
    execute format('alter table public.workspace_memberships drop constraint %I', existing_key);
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.workspace_memberships'::regclass
      and constraint_row.contype = 'p'
  ) then
    alter table public.workspace_memberships
      add primary key (workspace_id, user_id);
  end if;
end
$$;

create index if not exists workspace_memberships_user_idx
  on public.workspace_memberships (user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invitee_id uuid not null references auth.users (id) on delete cascade,
  invited_by uuid not null references auth.users (id),
  invitee_username text not null,
  invited_by_username text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

alter table public.workspace_invites
  add column if not exists invited_by_username text not null default '';

create unique index if not exists workspace_invites_one_pending_idx
  on public.workspace_invites (workspace_id, invitee_id)
  where status = 'pending';

create table if not exists public.logbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists logbooks_owner_created_idx
  on public.logbooks (owner_id, created_at desc);
create index if not exists logbooks_workspace_created_idx
  on public.logbooks (workspace_id, created_at desc);

create table if not exists public.accomplishments (
  id uuid primary key default gen_random_uuid(),
  form_title text not null,
  submitted_by uuid not null references public.profiles (id),
  workspace_id uuid references public.workspaces (id),
  logbook_id uuid references public.logbooks (id) on delete cascade,
  log_date date not null,
  time_request time,
  time_completion time,
  interns text[] not null default '{}',
  department text not null check (length(trim(department)) > 0),
  task text not null check (length(trim(task)) > 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.time_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  work_date date not null,
  morning_in timestamptz,
  morning_out timestamptz,
  afternoon_in timestamptz,
  afternoon_out timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);

alter table public.accomplishments
  add column if not exists workspace_id uuid references public.workspaces (id);
alter table public.accomplishments
  add column if not exists logbook_id uuid references public.logbooks (id) on delete cascade;
alter table public.accomplishments alter column workspace_id drop not null;

insert into public.logbooks (name, owner_id, workspace_id)
select workspace_row.name, workspace_row.owner_id, workspace_row.id
from public.workspaces workspace_row
where not exists (
  select 1
  from public.logbooks logbook_row
  where logbook_row.workspace_id = workspace_row.id
);

insert into public.logbooks (name, owner_id)
select coalesce(nullif(trim(profile_row.full_name), ''), 'Personal logbook'),
       accomplishment_row.submitted_by
from public.accomplishments accomplishment_row
join public.profiles profile_row on profile_row.id = accomplishment_row.submitted_by
where accomplishment_row.workspace_id is null
  and accomplishment_row.logbook_id is null
group by accomplishment_row.submitted_by, profile_row.full_name
having not exists (
  select 1
  from public.logbooks logbook_row
  where logbook_row.owner_id = accomplishment_row.submitted_by
    and logbook_row.workspace_id is null
);

update public.accomplishments accomplishment_row
set logbook_id = logbook_row.id
from public.logbooks logbook_row
where accomplishment_row.logbook_id is null
  and accomplishment_row.workspace_id = logbook_row.workspace_id;

update public.accomplishments accomplishment_row
set logbook_id = logbook_row.id
from public.logbooks logbook_row
where accomplishment_row.logbook_id is null
  and accomplishment_row.workspace_id is null
  and accomplishment_row.submitted_by = logbook_row.owner_id
  and logbook_row.workspace_id is null;

alter table public.accomplishments alter column logbook_id set not null;

create index if not exists accomplishments_log_date_idx
  on public.accomplishments (log_date desc);
create index if not exists accomplishments_logbook_date_idx
  on public.accomplishments (logbook_id, log_date desc);
create index if not exists time_records_user_date_idx
  on public.time_records (user_id, work_date desc);
create index if not exists time_records_workspace_date_idx
  on public.time_records (workspace_id, work_date desc);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.workspace_invites enable row level security;
alter table public.logbooks enable row level security;
alter table public.accomplishments enable row level security;
alter table public.time_records enable row level security;

create or replace function public.is_workspace_member_of(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_memberships
    where workspace_id = target_workspace
      and user_id = auth.uid()
  );
$$;

create or replace function public.can_view_profile(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select profile_id = auth.uid()
    or exists (
      select 1
      from public.workspace_memberships mine
      join public.workspace_memberships theirs
        on theirs.workspace_id = mine.workspace_id
      where mine.user_id = auth.uid()
        and theirs.user_id = profile_id
    );
$$;

create or replace function public.can_access_logbook(target_logbook uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.logbooks logbook_row
    where logbook_row.id = target_logbook
      and (
        logbook_row.owner_id = auth.uid()
        or (
          logbook_row.workspace_id is not null
          and exists (
            select 1
            from public.workspace_memberships membership_row
            where membership_row.workspace_id = logbook_row.workspace_id
              and membership_row.user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_workspace uuid;
begin
  if caller is null then
    raise exception 'Sign in is required.';
  end if;
  if not exists (select 1 from public.profiles where id = caller) then
    raise exception 'Create your profile before starting a group.';
  end if;

  insert into public.workspaces (name, owner_id)
  values (coalesce(nullif(trim(workspace_name), ''), 'New group'), caller)
  returning id into new_workspace;

  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (new_workspace, caller, 'owner');
  return new_workspace;
end;
$$;

create or replace function public.create_logbook(logbook_name text, target_workspace uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_logbook uuid;
begin
  if caller is null then
    raise exception 'Sign in is required.';
  end if;
  if not exists (select 1 from public.profiles where id = caller) then
    raise exception 'Create your profile before starting a collection.';
  end if;
  if nullif(trim(logbook_name), '') is null then
    raise exception 'Collection name is required.';
  end if;
  if target_workspace is not null
    and not public.is_workspace_member_of(target_workspace) then
    raise exception 'Join that group before sharing a collection with it.';
  end if;

  insert into public.logbooks (name, owner_id, workspace_id)
  values (trim(logbook_name), caller, target_workspace)
  returning id into new_logbook;

  return new_logbook;
end;
$$;

create or replace function public.record_time_punch(
  target_date date,
  punch_slot text,
  punched_at timestamptz,
  target_workspace uuid,
  allow_correction boolean default false
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  saved_record uuid;
begin
  if caller is null then
    raise exception 'Sign in is required.';
  end if;
  if target_date is null then
    raise exception 'A work date is required.';
  end if;
  if punch_slot is null or punch_slot not in ('morning_in', 'morning_out', 'afternoon_in', 'afternoon_out') then
    raise exception 'Choose a valid time-record slot.';
  end if;
  if punched_at is null then
    raise exception 'A punch time is required.';
  end if;
  if target_workspace is not null
    and not public.is_workspace_member_of(target_workspace) then
    raise exception 'Join that group before sharing a time record with it.';
  end if;

  insert into public.time_records (
    user_id, workspace_id, work_date,
    morning_in, morning_out, afternoon_in, afternoon_out
  )
  values (
    caller,
    target_workspace,
    target_date,
    case when punch_slot = 'morning_in' then punched_at end,
    case when punch_slot = 'morning_out' then punched_at end,
    case when punch_slot = 'afternoon_in' then punched_at end,
    case when punch_slot = 'afternoon_out' then punched_at end
  )
  on conflict (user_id, work_date) do update
  set morning_in = case when punch_slot = 'morning_in' then excluded.morning_in else time_records.morning_in end,
      morning_out = case when punch_slot = 'morning_out' then excluded.morning_out else time_records.morning_out end,
      afternoon_in = case when punch_slot = 'afternoon_in' then excluded.afternoon_in else time_records.afternoon_in end,
      afternoon_out = case when punch_slot = 'afternoon_out' then excluded.afternoon_out else time_records.afternoon_out end
  where allow_correction
    or (punch_slot = 'morning_in' and time_records.morning_in is null)
    or (punch_slot = 'morning_out' and time_records.morning_out is null)
    or (punch_slot = 'afternoon_in' and time_records.afternoon_in is null)
    or (punch_slot = 'afternoon_out' and time_records.afternoon_out is null)
  returning id into saved_record;

  if saved_record is null then
    raise exception 'That time slot is already recorded. Use manual entry to correct it.';
  end if;
  return true;
end;
$$;

drop function if exists public.invite_user_to_workspace(text);
create or replace function public.invite_user_to_workspace(target_username text, target_workspace uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_id uuid;
  target_name text;
  invite_id uuid;
begin
  if not public.is_workspace_member_of(target_workspace) then
    raise exception 'Join that group before inviting users.';
  end if;

  select id, username into target_id, target_name
  from public.profiles
  where lower(username) = lower(trim(target_username));
  if target_id is null then
    raise exception 'No account found with that username.';
  end if;
  if target_id = caller then
    raise exception 'You are already in this group.';
  end if;
  if exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace and user_id = target_id
  ) then
    raise exception 'That user is already in this group.';
  end if;
  if exists (
    select 1 from public.workspace_invites
    where workspace_id = target_workspace and invitee_id = target_id and status = 'pending'
  ) then
    raise exception 'An invitation is already pending for that user.';
  end if;

  insert into public.workspace_invites (
    workspace_id, invitee_id, invited_by, invitee_username, invited_by_username
  )
  values (
    target_workspace,
    target_id,
    caller,
    target_name,
    (select username from public.profiles where id = caller)
  )
  returning id into invite_id;
  return invite_id;
end;
$$;

create or replace function public.respond_to_workspace_invite(invite_id uuid, accept_invite boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_row public.workspace_invites%rowtype;
begin
  select * into invite_row
  from public.workspace_invites
  where id = invite_id and invitee_id = auth.uid() and status = 'pending'
  for update;
  if not found then
    raise exception 'Invitation not found or already handled.';
  end if;

  update public.workspace_invites
  set status = case when accept_invite then 'accepted' else 'declined' end,
      responded_at = now()
  where id = invite_row.id;

  if accept_invite then
    insert into public.workspace_memberships (workspace_id, user_id, role)
    values (invite_row.workspace_id, auth.uid(), 'member')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  return true;
end;
$$;

revoke all on function public.is_workspace_member_of(uuid) from public;
revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.can_access_logbook(uuid) from public;
revoke all on function public.create_workspace(text) from public;
revoke all on function public.create_logbook(text, uuid) from public;
revoke all on function public.record_time_punch(date, text, timestamptz, uuid, boolean) from public;
revoke all on function public.invite_user_to_workspace(text, uuid) from public;
revoke all on function public.respond_to_workspace_invite(uuid, boolean) from public;
grant execute on function public.is_workspace_member_of(uuid) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.can_access_logbook(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.create_logbook(text, uuid) to authenticated;
grant execute on function public.record_time_punch(date, text, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.invite_user_to_workspace(text, uuid) to authenticated;
grant execute on function public.respond_to_workspace_invite(uuid, boolean) to authenticated;

drop policy if exists "Team can view profiles" on public.profiles;
drop policy if exists "Users can view their own or group profiles" on public.profiles;
create policy "Users can view their own or group profiles"
  on public.profiles for select
  to authenticated
  using (public.can_view_profile(id));

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (
    id = auth.uid()
    and email = (select auth.jwt() ->> 'email')
    and username = lower(split_part((select auth.jwt() ->> 'email'), '@', 1))
  );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and email = (select auth.jwt() ->> 'email')
    and username = lower(split_part((select auth.jwt() ->> 'email'), '@', 1))
  );

drop policy if exists "Members can view workspaces" on public.workspaces;
drop policy if exists "Members and invitees can view workspaces" on public.workspaces;
create policy "Members and invitees can view workspaces"
  on public.workspaces for select
  to authenticated
  using (
    public.is_workspace_member_of(id)
    or exists (
      select 1 from public.workspace_invites invite_row
      where invite_row.workspace_id = id
        and invite_row.invitee_id = auth.uid()
        and invite_row.status = 'pending'
    )
  );

drop policy if exists "Members can view group members" on public.workspace_memberships;
create policy "Members can view group members"
  on public.workspace_memberships for select
  to authenticated
  using (public.is_workspace_member_of(workspace_id));

drop policy if exists "Users can view their group invitations" on public.workspace_invites;
create policy "Users can view their group invitations"
  on public.workspace_invites for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or public.is_workspace_member_of(workspace_id)
  );

drop policy if exists "Owners and group members can view logbooks" on public.logbooks;
create policy "Owners and group members can view logbooks"
  on public.logbooks for select
  to authenticated
  using (public.can_access_logbook(id));

drop policy if exists "Owners can create logbooks" on public.logbooks;
create policy "Owners can create logbooks"
  on public.logbooks for insert
  to authenticated
  with check (
    owner_id = auth.uid()
    and (
      workspace_id is null
      or public.is_workspace_member_of(workspace_id)
    )
  );

drop policy if exists "Owners can update logbooks" on public.logbooks;
create policy "Owners can update logbooks"
  on public.logbooks for update
  to authenticated
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      workspace_id is null
      or public.is_workspace_member_of(workspace_id)
    )
  );

drop policy if exists "Owners can delete logbooks" on public.logbooks;
create policy "Owners can delete logbooks"
  on public.logbooks for delete
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Team can view accomplishments" on public.accomplishments;
drop policy if exists "Members can view group accomplishments" on public.accomplishments;
drop policy if exists "Logbook owners and group can view accomplishments" on public.accomplishments;
create policy "Logbook owners and group can view accomplishments"
  on public.accomplishments for select
  to authenticated
  using (public.can_access_logbook(logbook_id));

drop policy if exists "Users can submit accomplishments as themselves" on public.accomplishments;
drop policy if exists "Members can submit accomplishments as themselves" on public.accomplishments;
drop policy if exists "Logbook owners and group can add accomplishments" on public.accomplishments;
create policy "Logbook owners and group can add accomplishments"
  on public.accomplishments for insert
  to authenticated
  with check (
    submitted_by = auth.uid()
    and public.can_access_logbook(logbook_id)
  );

drop policy if exists "Authors can delete their own group accomplishments" on public.accomplishments;
drop policy if exists "Logbook owners and group can edit accomplishments" on public.accomplishments;
create policy "Logbook owners and group can edit accomplishments"
  on public.accomplishments for update
  to authenticated
  using (public.can_access_logbook(logbook_id))
  with check (public.can_access_logbook(logbook_id));

drop policy if exists "Logbook owners and group can delete accomplishments" on public.accomplishments;
create policy "Logbook owners and group can delete accomplishments"
  on public.accomplishments for delete
  to authenticated
  using (public.can_access_logbook(logbook_id));

drop policy if exists "Users can view own or shared time records" on public.time_records;
create policy "Users can view own or shared time records"
  on public.time_records for select
  to authenticated
  using (
    user_id = auth.uid()
    or (workspace_id is not null and public.is_workspace_member_of(workspace_id))
  );

drop policy if exists "Users can add own time records" on public.time_records;
create policy "Users can add own time records"
  on public.time_records for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member_of(workspace_id))
  );

drop policy if exists "Users can update own time records" on public.time_records;
create policy "Users can update own time records"
  on public.time_records for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (workspace_id is null or public.is_workspace_member_of(workspace_id))
  );

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.workspaces, public.workspace_memberships, public.workspace_invites to authenticated;
grant select, insert, update, delete on public.logbooks to authenticated;
grant select, insert, delete on public.accomplishments to authenticated;
grant select, insert, update on public.time_records to authenticated;
grant update (log_date, time_request, time_completion, interns, department, task, notes)
  on public.accomplishments to authenticated;
revoke all on public.profiles, public.workspaces, public.workspace_memberships,
  public.workspace_invites, public.logbooks, public.accomplishments, public.time_records from anon;

drop function if exists public.bootstrap_workspace(text);
drop function if exists public.is_workspace_member();

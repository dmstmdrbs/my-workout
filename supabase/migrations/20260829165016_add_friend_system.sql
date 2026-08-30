-- Friends MVP.  The existing public.profiles table remains private because it
-- contains email addresses.  social_profiles is the deliberately small,
-- friend-visible projection used by this feature.

create table public.social_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  display_name text not null default '트레이너' check (char_length(display_name) between 1 and 80),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.friend_invites (
  token uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.social_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.social_profiles (user_id) on delete cascade,
  addressee_id uuid not null references public.social_profiles (user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id),
  check ((status = 'accepted') = (accepted_at is not null))
);

create table public.user_blocks (
  blocker_id uuid not null references public.social_profiles (user_id) on delete cascade,
  blocked_id uuid not null references public.social_profiles (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create unique index friendships_pair_unique_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_requester_status_idx on public.friendships (requester_id, status, updated_at desc);
create index friendships_addressee_status_idx on public.friendships (addressee_id, status, updated_at desc);
create unique index friend_invites_one_active_idx on public.friend_invites (inviter_id) where revoked_at is null;
create index friend_invites_owner_created_idx on public.friend_invites (inviter_id, created_at desc);
create index friend_invites_expiry_idx on public.friend_invites (expires_at) where revoked_at is null;
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

insert into public.social_profiles (user_id, display_name, avatar_url, created_at, updated_at)
select
  id,
  left(coalesce(nullif(btrim(display_name), ''), '트레이너'), 80),
  left(avatar_url, 2048),
  created_at,
  updated_at
from public.profiles
on conflict (user_id) do update
set display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = excluded.updated_at;

create schema if not exists private;

create or replace function private.sync_social_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.social_profiles (user_id, display_name, avatar_url, created_at, updated_at)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.display_name), ''), '트레이너'), 80),
    left(new.avatar_url, 2048),
    new.created_at,
    new.updated_at
  )
  on conflict (user_id) do update
  set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function private.sync_social_profile() from public, anon, authenticated;

create trigger sync_social_profile_after_write
after insert or update of display_name, avatar_url on public.profiles
for each row execute function private.sync_social_profile();

alter table public.social_profiles enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friendships enable row level security;
alter table public.user_blocks enable row level security;

-- Only data required by the current user's friendship graph is readable.
create policy "social_profiles_select_visible"
on public.social_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.friendships f
    where (f.requester_id = (select auth.uid()) and f.addressee_id = social_profiles.user_id)
       or (f.addressee_id = (select auth.uid()) and f.requester_id = social_profiles.user_id)
  )
  or exists (
    select 1
    from public.user_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = social_profiles.user_id
  )
);

create policy "friend_invites_select_own"
on public.friend_invites for select to authenticated
using (inviter_id = (select auth.uid()));

create policy "friendships_select_participant"
on public.friendships for select to authenticated
using ((select auth.uid()) in (requester_id, addressee_id));

create policy "user_blocks_select_own"
on public.user_blocks for select to authenticated
using (blocker_id = (select auth.uid()));

-- Browser clients may only read these tables.  Every mutation goes through a
-- narrowly scoped RPC below, which validates auth.uid() and the state change.
grant select on table
  public.social_profiles,
  public.friend_invites,
  public.friendships,
  public.user_blocks
to authenticated;

create or replace function public.create_or_rotate_friend_invite()
returns table (token uuid, created_at timestamptz, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if (select count(*) from public.friend_invites i
      where i.inviter_id = v_actor and i.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'invite rotation limit reached' using errcode = '54000';
  end if;

  update public.friend_invites
  set revoked_at = now()
  where inviter_id = v_actor and revoked_at is null;

  return query
  insert into public.friend_invites (inviter_id)
  values (v_actor)
  returning friend_invites.token, friend_invites.created_at, friend_invites.expires_at;
end;
$$;

create or replace function public.resolve_friend_invite(p_token uuid)
returns table (
  resolution_state text,
  user_id uuid,
  display_name text,
  avatar_url text,
  friendship_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_inviter uuid;
  v_friendship public.friendships%rowtype;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select i.inviter_id into v_inviter
  from public.friend_invites i
  where i.token = p_token
    and i.revoked_at is null
    and i.expires_at > now();

  if v_inviter is null then
    return query select 'unavailable'::text, null::uuid, null::text, null::text, null::uuid;
    return;
  end if;

  if v_inviter = v_actor then
    return query
    select 'self'::text, p.user_id, p.display_name, p.avatar_url, null::uuid
    from public.social_profiles p where p.user_id = v_inviter;
    return;
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = v_inviter)
       or (b.blocker_id = v_inviter and b.blocked_id = v_actor)
  ) then
    return query select 'unavailable'::text, null::uuid, null::text, null::text, null::uuid;
    return;
  end if;

  select f.* into v_friendship
  from public.friendships f
  where (f.requester_id = v_actor and f.addressee_id = v_inviter)
     or (f.requester_id = v_inviter and f.addressee_id = v_actor);

  return query
  select
    case
      when v_friendship.id is null then 'available'
      when v_friendship.status = 'accepted' then 'friends'
      when v_friendship.requester_id = v_actor then 'outgoing_pending'
      else 'incoming_pending'
    end,
    p.user_id,
    p.display_name,
    p.avatar_url,
    v_friendship.id
  from public.social_profiles p
  where p.user_id = v_inviter;
end;
$$;

create or replace function public.send_friend_request(p_token uuid)
returns table (
  friendship_id uuid,
  target_user_id uuid,
  target_display_name text,
  target_avatar_url text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid;
  v_friendship public.friendships%rowtype;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select i.inviter_id into v_target
  from public.friend_invites i
  where i.token = p_token and i.revoked_at is null and i.expires_at > now();

  if v_target is null or v_target = v_actor then
    raise exception 'invite unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = v_target)
       or (b.blocker_id = v_target and b.blocked_id = v_actor)
  ) then
    raise exception 'invite unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.friendships f
    where (f.requester_id = v_actor and f.addressee_id = v_target)
       or (f.requester_id = v_target and f.addressee_id = v_actor)
  ) then
    raise exception 'friendship already exists' using errcode = '23505';
  end if;

  if (select count(*) from public.friendships f
      where f.status = 'accepted' and v_actor in (f.requester_id, f.addressee_id)) >= 200 then
    raise exception 'friend limit reached' using errcode = '54000';
  end if;

  if (select count(*) from public.friendships f
      where f.status = 'accepted' and v_target in (f.requester_id, f.addressee_id)) >= 200 then
    raise exception 'friend unavailable' using errcode = '54000';
  end if;

  if (select count(*) from public.friendships f
      where f.status = 'pending' and f.requester_id = v_actor) >= 20 then
    raise exception 'pending request limit reached' using errcode = '54000';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_actor, v_target)
  returning * into v_friendship;

  return query
  select v_friendship.id, p.user_id, p.display_name, p.avatar_url, v_friendship.created_at
  from public.social_profiles p where p.user_id = v_target;
end;
$$;

create or replace function public.accept_friend_request(p_friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_requester uuid;
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select f.requester_id into v_requester
  from public.friendships f
  where f.id = p_friendship_id and f.addressee_id = v_actor and f.status = 'pending'
  for update;

  if v_requester is null then raise exception 'friend request not found' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = v_requester)
       or (b.blocker_id = v_requester and b.blocked_id = v_actor)
  ) then raise exception 'friend request unavailable' using errcode = '22023'; end if;
  if (select count(*) from public.friendships f
      where f.status = 'accepted' and v_actor in (f.requester_id, f.addressee_id)) >= 200 then
    raise exception 'friend limit reached' using errcode = '54000';
  end if;
  if (select count(*) from public.friendships f
      where f.status = 'accepted' and v_requester in (f.requester_id, f.addressee_id)) >= 200 then
    raise exception 'friend unavailable' using errcode = '54000';
  end if;

  update public.friendships
  set status = 'accepted', accepted_at = now(), updated_at = now()
  where id = p_friendship_id;
end;
$$;

create or replace function public.decline_friend_request(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.friendships
  where id = p_friendship_id and addressee_id = v_actor and status = 'pending';
  if not found then raise exception 'friend request not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.cancel_friend_request(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.friendships
  where id = p_friendship_id and requester_id = v_actor and status = 'pending';
  if not found then raise exception 'friend request not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.friendships
  where id = p_friendship_id and status = 'accepted'
    and v_actor in (requester_id, addressee_id);
  if not found then raise exception 'friendship not found' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.block_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_user_id is null or p_user_id = v_actor then raise exception 'invalid user' using errcode = '22023'; end if;
  if not exists (select 1 from public.social_profiles p where p.user_id = p_user_id) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_actor, p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships f
  where (f.requester_id = v_actor and f.addressee_id = p_user_id)
     or (f.requester_id = p_user_id and f.addressee_id = v_actor);
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'authentication required' using errcode = '42501'; end if;
  delete from public.user_blocks where blocker_id = v_actor and blocked_id = p_user_id;
end;
$$;

revoke all on function public.create_or_rotate_friend_invite() from public, anon;
revoke all on function public.resolve_friend_invite(uuid) from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.accept_friend_request(uuid) from public, anon;
revoke all on function public.decline_friend_request(uuid) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;

grant execute on function public.create_or_rotate_friend_invite() to authenticated;
grant execute on function public.resolve_friend_invite(uuid) to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;

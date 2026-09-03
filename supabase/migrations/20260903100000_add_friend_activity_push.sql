-- Native friend-activity push foundation. Client access is limited to three
-- authenticated RPCs. Tokens and the service-role outbox are never selectable
-- from the publishable-key client.

create table public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique check (char_length(token) between 16 and 4096),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_device_tokens_user_idx on public.push_device_tokens (user_id, updated_at desc);

create table public.workout_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, started_at)
);

create index workout_activity_events_user_created_idx
  on public.workout_activity_events (user_id, created_at desc);

create table public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  activity_event_id uuid not null references public.workout_activity_events (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 240),
  path text not null default '/friends' check (path = '/friends'),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  unique (recipient_user_id, activity_event_id)
);

create index push_notification_outbox_pending_idx
  on public.push_notification_outbox (created_at)
  where processed_at is null;

alter table public.push_device_tokens enable row level security;
alter table public.workout_activity_events enable row level security;
alter table public.push_notification_outbox enable row level security;

revoke all on table
  public.push_device_tokens,
  public.workout_activity_events,
  public.push_notification_outbox
from public, anon, authenticated;

create or replace function public.register_push_device(p_token text, p_platform text)
returns void
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
  if char_length(p_token) not between 16 and 4096 or p_platform not in ('ios', 'android') then
    raise exception 'invalid push device' using errcode = '22023';
  end if;

  -- A native token identifies one current app installation. Reassigning it on
  -- login prevents the previous account on a shared device receiving alerts.
  delete from public.push_device_tokens where token = p_token;
  insert into public.push_device_tokens (user_id, token, platform)
  values (v_actor, p_token, p_platform);
end;
$$;

create or replace function public.unregister_push_device(p_token text)
returns void
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
  delete from public.push_device_tokens where user_id = v_actor and token = p_token;
end;
$$;

create or replace function private.queue_friend_workout_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  select p.display_name into v_display_name
  from public.social_profiles p
  where p.user_id = new.user_id;

  insert into public.push_notification_outbox (
    recipient_user_id,
    activity_event_id,
    title,
    body,
    path
  )
  select
    case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end,
    new.id,
    '친구가 운동을 시작했어요',
    left(coalesce(v_display_name, '친구') || '님이 운동을 시작했어요. 응원을 보내 보세요!', 240),
    '/friends'
  from public.friendships f
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and exists (
      select 1 from public.push_device_tokens t
      where t.user_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
    )
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = new.user_id and b.blocked_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end)
         or (b.blocked_id = new.user_id and b.blocker_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end)
    )
  on conflict (recipient_user_id, activity_event_id) do nothing;

  return new;
end;
$$;

revoke all on function private.queue_friend_workout_push() from public, anon, authenticated;

create trigger queue_friend_workout_push_after_insert
after insert on public.workout_activity_events
for each row execute function private.queue_friend_workout_push();

create or replace function public.announce_workout_started(p_started_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_started_at timestamptz := p_started_at;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if v_started_at is null or abs(extract(epoch from (now() - v_started_at))) > 600 then
    v_started_at := now();
  end if;

  -- Starting/restoring repeatedly must not spam every friend. One activity
  -- notification per user in a 30-minute window is enough.
  if exists (
    select 1 from public.workout_activity_events e
    where e.user_id = v_actor and e.created_at >= now() - interval '30 minutes'
  ) then
    return;
  end if;

  insert into public.workout_activity_events (user_id, started_at)
  values (v_actor, v_started_at)
  on conflict (user_id, started_at) do nothing;
end;
$$;

revoke all on function public.register_push_device(text, text) from public, anon;
revoke all on function public.unregister_push_device(text) from public, anon;
revoke all on function public.announce_workout_started(timestamptz) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.unregister_push_device(text) to authenticated;
grant execute on function public.announce_workout_started(timestamptz) to authenticated;

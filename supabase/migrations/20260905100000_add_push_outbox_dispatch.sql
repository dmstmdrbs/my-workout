-- Turn the friend activity outbox into a device-level, lease-based queue.
-- Only service_role can claim or complete jobs; mobile and web clients keep
-- using the authenticated register/announce RPCs from the previous migration.

alter table public.push_notification_outbox
  drop constraint if exists push_notification_outbox_recipient_user_id_activity_event_id_key;

alter table public.push_notification_outbox
  add column device_token_id uuid,
  add column platform text,
  add column next_attempt_at timestamptz not null default now(),
  add column claimed_at timestamptz,
  add column claim_id uuid,
  add column discarded_at timestamptz;

-- Preserve already queued notifications. The original row takes the first
-- current device and additional rows snapshot the remaining devices.
update public.push_notification_outbox o
set (device_token_id, platform) = (
  select t.id, t.platform
  from public.push_device_tokens t
  where t.user_id = o.recipient_user_id
  order by t.updated_at desc, t.id
  limit 1
);

insert into public.push_notification_outbox (
  recipient_user_id,
  activity_event_id,
  title,
  body,
  path,
  created_at,
  processed_at,
  attempt_count,
  last_error,
  device_token_id,
  platform,
  next_attempt_at
)
select
  o.recipient_user_id,
  o.activity_event_id,
  o.title,
  o.body,
  o.path,
  o.created_at,
  o.processed_at,
  o.attempt_count,
  o.last_error,
  t.id,
  t.platform,
  now()
from public.push_notification_outbox o
join public.push_device_tokens t on t.user_id = o.recipient_user_id
where o.device_token_id is not null
  and t.id <> o.device_token_id;

delete from public.push_notification_outbox where device_token_id is null;

alter table public.push_notification_outbox
  alter column device_token_id set not null,
  alter column platform set not null,
  add constraint push_notification_outbox_device_token_fk
    foreign key (device_token_id) references public.push_device_tokens (id) on delete cascade,
  add constraint push_notification_outbox_platform_check
    check (platform in ('ios', 'android')),
  add constraint push_notification_outbox_claim_pair_check
    check ((claimed_at is null) = (claim_id is null));

create unique index push_notification_outbox_event_device_unique_idx
  on public.push_notification_outbox (activity_event_id, device_token_id);

drop index if exists public.push_notification_outbox_pending_idx;
create index push_notification_outbox_claimable_idx
  on public.push_notification_outbox (next_attempt_at, created_at)
  where processed_at is null and discarded_at is null;

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
    device_token_id,
    platform,
    title,
    body,
    path
  )
  select
    case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end,
    new.id,
    t.id,
    t.platform,
    '친구가 운동을 시작했어요',
    left(coalesce(v_display_name, '친구') || '님이 운동을 시작했어요. 응원을 보내 보세요!', 240),
    '/friends'
  from public.friendships f
  join public.push_device_tokens t
    on t.user_id = case when f.requester_id = new.user_id then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and new.user_id in (f.requester_id, f.addressee_id)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = new.user_id and b.blocked_id = t.user_id)
         or (b.blocked_id = new.user_id and b.blocker_id = t.user_id)
    )
  on conflict (activity_event_id, device_token_id) do nothing;

  return new;
end;
$$;

revoke all on function private.queue_friend_workout_push() from public, anon, authenticated;

create or replace function public.claim_push_notification_outbox(
  p_claim_id uuid,
  p_limit integer default 25,
  p_platforms text[] default array['ios', 'android']::text[]
)
returns table (
  outbox_id uuid,
  token text,
  platform text,
  title text,
  body text,
  path text,
  attempt_number integer
)
language sql
security definer
set search_path = ''
as $$
  with exhausted_leases as materialized (
    update public.push_notification_outbox o
    set discarded_at = now(),
        claimed_at = null,
        claim_id = null,
        last_error = left(coalesce(o.last_error, 'dispatcher lease expired after final attempt'), 1000)
    where o.processed_at is null
      and o.discarded_at is null
      and o.attempt_count >= 5
      and o.claimed_at < now() - interval '5 minutes'
    returning o.id
  ), candidates as materialized (
    select o.id
    from public.push_notification_outbox o
    where o.processed_at is null
      and o.discarded_at is null
      and o.next_attempt_at <= now()
      and o.attempt_count < 5
      and p_claim_id is not null
      and o.platform = any(p_platforms)
      and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
    order by o.next_attempt_at, o.created_at
    for update of o skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.push_notification_outbox o
    set claimed_at = now(),
        claim_id = p_claim_id,
        attempt_count = o.attempt_count + 1
    from candidates c
    where o.id = c.id
    returning o.id, o.device_token_id, o.platform, o.title, o.body, o.path, o.attempt_count
  )
  select
    c.id,
    t.token,
    c.platform,
    c.title,
    c.body,
    c.path,
    c.attempt_count
  from claimed c
  join public.push_device_tokens t on t.id = c.device_token_id;
$$;

create or replace function public.complete_push_notification_outbox(
  p_outbox_id uuid,
  p_claim_id uuid,
  p_outcome text,
  p_error text default null,
  p_retry_after_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_count integer;
  v_device_token_id uuid;
begin
  if p_outcome not in ('success', 'retry', 'permanent', 'invalid_token') then
    raise exception 'invalid push outcome' using errcode = '22023';
  end if;

  select o.attempt_count, o.device_token_id
  into v_attempt_count, v_device_token_id
  from public.push_notification_outbox o
  where o.id = p_outbox_id and o.claim_id = p_claim_id
  for update;

  if not found then
    return false;
  end if;

  if p_outcome = 'invalid_token' then
    -- The cascade also removes every pending delivery for this invalid token.
    delete from public.push_device_tokens where id = v_device_token_id;
    return true;
  elsif p_outcome = 'success' then
    update public.push_notification_outbox
    set processed_at = now(),
        claimed_at = null,
        claim_id = null,
        last_error = null
    where id = p_outbox_id;
  elsif p_outcome = 'permanent' or v_attempt_count >= 5 then
    update public.push_notification_outbox
    set discarded_at = now(),
        claimed_at = null,
        claim_id = null,
        last_error = left(coalesce(p_error, 'permanent push failure'), 1000)
    where id = p_outbox_id;
  else
    update public.push_notification_outbox
    set next_attempt_at = now() + make_interval(
          secs => greatest(15, least(coalesce(p_retry_after_seconds, 60), 3600))
        ),
        claimed_at = null,
        claim_id = null,
        last_error = left(coalesce(p_error, 'temporary push failure'), 1000)
    where id = p_outbox_id;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_push_notification_outbox(uuid, integer, text[]) from public, anon, authenticated;
revoke all on function public.complete_push_notification_outbox(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_push_notification_outbox(uuid, integer, text[]) to service_role;
grant execute on function public.complete_push_notification_outbox(uuid, uuid, text, text, integer) to service_role;

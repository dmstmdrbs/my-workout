-- Harden native friend push registration and dispatch against concurrent app
-- starts, excessive token fan-out, and relationship changes after enqueue.

create or replace function public.register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing_id uuid;
  v_existing_user_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if char_length(p_token) not between 16 and 4096 or p_platform not in ('ios', 'android') then
    raise exception 'invalid push device' using errcode = '22023';
  end if;

  -- Serialize a user's device list and the globally unique token. Updating a
  -- token already owned by this user preserves its id, so pending outbox rows
  -- are not deleted by the device FK cascade during an ordinary app restart.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-user:' || v_actor::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-token:' || p_token, 0)
  );

  select t.id, t.user_id
  into v_existing_id, v_existing_user_id
  from public.push_device_tokens t
  where t.token = p_token
  for update;

  if found and v_existing_user_id = v_actor then
    update public.push_device_tokens
    set platform = p_platform,
        updated_at = now()
    where id = v_existing_id;
  else
    if found then
      -- A token belongs to the current installation. Reassignment prevents a
      -- previous account on a shared device from receiving later alerts.
      delete from public.push_device_tokens where id = v_existing_id;
    end if;
    insert into public.push_device_tokens (user_id, token, platform)
    values (v_actor, p_token, p_platform);
  end if;

  -- Bound fan-out and storage abuse while retaining a practical multi-device
  -- allowance. Removing an old device also discards its now-undeliverable jobs.
  delete from public.push_device_tokens t
  where t.user_id = v_actor
    and t.id in (
      select stale.id
      from public.push_device_tokens stale
      where stale.user_id = v_actor
      order by stale.updated_at desc, stale.id desc
      offset 5
    );
end;
$$;

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

  -- The check and insert must share a per-user transaction lock. Without it,
  -- concurrent starts with distinct timestamps can both pass the 30m check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-announce:' || v_actor::text, 0)
  );

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

drop index if exists public.push_notification_outbox_claimable_idx;
create index push_notification_outbox_claimable_idx
  on public.push_notification_outbox (platform, next_attempt_at, created_at)
  where processed_at is null and discarded_at is null;

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
  ), eligible as materialized (
    select c.id
    from candidates c
    join public.push_notification_outbox o on o.id = c.id
    join public.workout_activity_events e on e.id = o.activity_event_id
    where exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = e.user_id and f.addressee_id = o.recipient_user_id)
          or
          (f.addressee_id = e.user_id and f.requester_id = o.recipient_user_id)
        )
    )
      and not exists (
        select 1
        from public.user_blocks b
        where (b.blocker_id = e.user_id and b.blocked_id = o.recipient_user_id)
           or (b.blocked_id = e.user_id and b.blocker_id = o.recipient_user_id)
      )
  ), discarded_relationships as (
    update public.push_notification_outbox o
    set discarded_at = now(),
        claimed_at = null,
        claim_id = null,
        last_error = 'friend relationship no longer permits delivery'
    from candidates c
    where o.id = c.id
      and not exists (select 1 from eligible e where e.id = c.id)
    returning o.id
  ), claimed as (
    update public.push_notification_outbox o
    set claimed_at = now(),
        claim_id = p_claim_id,
        attempt_count = o.attempt_count + 1
    from eligible c
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

revoke all on function public.register_push_device(text, text) from public, anon;
revoke all on function public.announce_workout_started(timestamptz) from public, anon;
revoke all on function public.claim_push_notification_outbox(uuid, integer, text[]) from public, anon, authenticated;
grant execute on function public.register_push_device(text, text) to authenticated;
grant execute on function public.announce_workout_started(timestamptz) to authenticated;
grant execute on function public.claim_push_notification_outbox(uuid, integer, text[]) to service_role;

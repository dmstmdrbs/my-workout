import { createClient } from "@supabase/supabase-js";
import {
  type ApnsCredentials,
  createApnsSender,
  createFcmSender,
  parseFirebaseServiceAccount,
  type PushDeliveryResult,
  type PushJob,
  type PushPlatform,
} from "../_shared/push-providers.ts";

interface ClaimedPushRow extends PushJob {
  outbox_id: string;
  platform: PushPlatform;
  attempt_number: number;
}

interface EnvironmentReader {
  get(name: string): string | undefined;
}

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, {
      status: 405,
      headers: jsonHeaders,
    });
  }

  const dispatchSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!dispatchSecret || dispatchSecret.length < 32) {
    return Response.json({ error: "dispatcher_not_configured" }, {
      status: 503,
      headers: jsonHeaders,
    });
  }
  if (
    !constantTimeEqual(
      request.headers.get("x-trainlog-dispatch-secret") ?? "",
      dispatchSecret,
    )
  ) {
    return Response.json({ error: "unauthorized" }, {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const runtime = createRuntimeConfig(Deno.env);
    if (runtime.platforms.length === 0) {
      return Response.json({ error: "no_push_provider_configured" }, {
        status: 503,
        headers: jsonHeaders,
      });
    }

    const requestedLimit = await readRequestedLimit(request);
    const claimId = crypto.randomUUID();
    const supabase = createClient(
      runtime.supabaseUrl,
      runtime.supabaseSecretKey,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase.rpc(
      "claim_push_notification_outbox",
      {
        p_claim_id: claimId,
        p_limit: requestedLimit,
        p_platforms: runtime.platforms,
      },
    );
    if (error) throw new Error(`outbox claim failed: ${error.message}`);

    const jobs = (data ?? []) as ClaimedPushRow[];
    const fcmSender = runtime.firebase
      ? createFcmSender(runtime.firebase)
      : null;
    const apnsSender = runtime.apns ? createApnsSender(runtime.apns) : null;

    const summary = {
      claimed: jobs.length,
      sent: 0,
      retried: 0,
      discarded: 0,
      invalidTokens: 0,
      completionErrors: 0,
    };
    await mapWithConcurrency(jobs, 10, async (job) => {
      const delivery = await deliver(job, fcmSender, apnsSender);
      const retryAfterSeconds = delivery.retryAfterSeconds ??
        Math.min(3600, 30 * (2 ** Math.max(0, job.attempt_number - 1)));
      const { data: completed, error: completionError } = await supabase.rpc(
        "complete_push_notification_outbox",
        {
          p_outbox_id: job.outbox_id,
          p_claim_id: claimId,
          p_outcome: delivery.outcome,
          p_error: delivery.error ?? null,
          p_retry_after_seconds: retryAfterSeconds,
        },
      );
      if (completionError || completed !== true) {
        summary.completionErrors += 1;
        return;
      }
      if (delivery.outcome === "success") summary.sent += 1;
      else if (delivery.outcome === "retry") summary.retried += 1;
      else if (delivery.outcome === "invalid_token") summary.invalidTokens += 1;
      else summary.discarded += 1;
    });

    return Response.json(summary, { headers: jsonHeaders });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "push dispatcher failed",
    );
    return Response.json({ error: "push_dispatch_failed" }, {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

async function deliver(
  job: ClaimedPushRow,
  fcmSender: ReturnType<typeof createFcmSender> | null,
  apnsSender: ReturnType<typeof createApnsSender> | null,
): Promise<PushDeliveryResult> {
  try {
    if (job.platform === "android" && fcmSender) return await fcmSender(job);
    if (job.platform === "ios" && apnsSender) return await apnsSender(job);
    return {
      outcome: "retry",
      error: `${job.platform} provider is not configured`,
      retryAfterSeconds: 300,
    };
  } catch (error) {
    return {
      outcome: "retry",
      error: error instanceof Error
        ? error.message.slice(0, 500)
        : "push provider request failed",
      retryAfterSeconds: 60,
    };
  }
}

export function createRuntimeConfig(environment: EnvironmentReader) {
  const supabaseUrl = requiredEnvironment(environment, "SUPABASE_URL");
  const supabaseSecretKey = readSupabaseSecretKey(environment);
  const firebaseRaw = environment.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  const firebase = firebaseRaw
    ? parseFirebaseServiceAccount(firebaseRaw)
    : null;
  const apns = readApnsCredentials(environment);
  const platforms: PushPlatform[] = [];
  if (firebase) platforms.push("android");
  if (apns) platforms.push("ios");
  return { supabaseUrl, supabaseSecretKey, firebase, apns, platforms };
}

function readSupabaseSecretKey(environment: EnvironmentReader) {
  const legacy = environment.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = requiredEnvironment(environment, "SUPABASE_SECRET_KEYS");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const preferred = parsed.default;
  if (typeof preferred === "string" && preferred) return preferred;
  const first = Object.values(parsed).find((value): value is string =>
    typeof value === "string" && value.length > 0
  );
  if (!first) {
    throw new Error("SUPABASE_SECRET_KEYS does not contain a usable key");
  }
  return first;
}

function readApnsCredentials(
  environment: EnvironmentReader,
): ApnsCredentials | null {
  const values = {
    keyId: environment.get("APNS_KEY_ID"),
    teamId: environment.get("APNS_TEAM_ID"),
    privateKey: environment.get("APNS_PRIVATE_KEY"),
    topic: environment.get("APNS_TOPIC") ?? "app.trainlog.mobile",
    environment: environment.get("APNS_ENVIRONMENT"),
  };
  const configuredCount =
    [values.keyId, values.teamId, values.privateKey].filter(Boolean).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== 3) throw new Error("APNs credentials are incomplete");
  if (!values.environment) throw new Error("APNS_ENVIRONMENT is required");
  if (
    values.environment !== "development" && values.environment !== "production"
  ) {
    throw new Error("APNS_ENVIRONMENT must be development or production");
  }
  return {
    keyId: values.keyId!,
    teamId: values.teamId!,
    privateKey: values.privateKey!.replaceAll("\\n", "\n"),
    topic: values.topic,
    environment: values.environment,
  };
}

function requiredEnvironment(environment: EnvironmentReader, name: string) {
  const value = environment.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function readRequestedLimit(request: Request) {
  try {
    const body = await request.json() as { limit?: unknown };
    if (typeof body.limit !== "number" || !Number.isFinite(body.limit)) {
      return 25;
    }
    return Math.max(1, Math.min(Math.floor(body.limit), 100));
  } catch {
    return 25;
  }
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^
      (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<void>,
) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await callback(item);
      }
    },
  );
  await Promise.all(workers);
}

export type PushPlatform = "ios" | "android";

export interface PushJob {
  token: string;
  title: string;
  body: string;
  path: string;
}

export type PushOutcome = "success" | "retry" | "permanent" | "invalid_token";

export interface PushDeliveryResult {
  outcome: PushOutcome;
  error?: string;
  retryAfterSeconds?: number;
}

export interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  topic: string;
  environment: "development" | "production";
}

type Fetcher = typeof fetch;

const encoder = new TextEncoder();
const firebaseScope = "https://www.googleapis.com/auth/firebase.messaging";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const providerRequestTimeoutMs = 10_000;

export function createFcmSender(
  credentials: FirebaseServiceAccount,
  fetcher: Fetcher = fetch,
  now: () => number = Date.now,
) {
  let cachedAccessToken: { value: string; expiresAtMs: number } | null = null;
  let pendingAccessToken: Promise<string> | null = null;

  const refreshAccessToken = async () => {
    const issuedAt = Math.floor(now() / 1000);
    const assertion = await signJwt(
      { alg: "RS256", typ: "JWT" },
      {
        iss: credentials.client_email,
        scope: firebaseScope,
        aud: googleTokenUrl,
        iat: issuedAt,
        exp: issuedAt + 3600,
      },
      credentials.private_key,
      "RS256",
    );
    const response = await fetcher(googleTokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(providerRequestTimeoutMs),
    });
    const data = await readJson(response);
    if (!response.ok || typeof data.access_token !== "string") {
      throw new Error(
        `FCM OAuth failed (${response.status}): ${describeProviderError(data)}`,
      );
    }

    const expiresIn = typeof data.expires_in === "number"
      ? data.expires_in
      : 3600;
    cachedAccessToken = {
      value: data.access_token,
      expiresAtMs: now() + Math.max(60, expiresIn) * 1000,
    };
    return cachedAccessToken.value;
  };

  const getAccessToken = () => {
    if (cachedAccessToken && cachedAccessToken.expiresAtMs - now() > 60_000) {
      return Promise.resolve(cachedAccessToken.value);
    }
    if (pendingAccessToken) return pendingAccessToken;
    pendingAccessToken = refreshAccessToken().finally(() => {
      pendingAccessToken = null;
    });
    return pendingAccessToken;
  };

  return async (job: PushJob): Promise<PushDeliveryResult> => {
    const accessToken = await getAccessToken();
    const response = await fetcher(
      `https://fcm.googleapis.com/v1/projects/${
        encodeURIComponent(credentials.project_id)
      }/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: job.token,
            notification: { title: job.title, body: job.body },
            data: { path: job.path },
            android: {
              priority: "high",
              notification: {
                channel_id: "friend-activity",
                default_sound: true,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(providerRequestTimeoutMs),
      },
    );
    if (response.ok) return { outcome: "success" };

    const data = await readJson(response);
    const errorCode = findFcmErrorCode(data);
    const error = `FCM ${response.status}${errorCode ? ` ${errorCode}` : ""}: ${
      describeProviderError(data)
    }`;
    if (response.status === 404 || errorCode === "UNREGISTERED") {
      return { outcome: "invalid_token", error };
    }
    // The payload is fixed and validated by this sender, so INVALID_ARGUMENT
    // identifies a malformed or expired registration token here.
    if (response.status === 400 && errorCode === "INVALID_ARGUMENT") {
      return { outcome: "invalid_token", error };
    }
    if (response.status === 429 || response.status >= 500) {
      return {
        outcome: "retry",
        error,
        retryAfterSeconds: readRetryAfterSeconds(response, now()),
      };
    }
    if (response.status === 401 || response.status === 403) {
      return { outcome: "retry", error, retryAfterSeconds: 900 };
    }
    return { outcome: "permanent", error };
  };
}

export function createApnsSender(
  credentials: ApnsCredentials,
  fetcher: Fetcher = fetch,
  now: () => number = Date.now,
) {
  let cachedProviderToken: { value: string; issuedAtMs: number } | null = null;
  let pendingProviderToken: Promise<string> | null = null;

  const createProviderToken = async () => {
    const value = await signJwt(
      { alg: "ES256", kid: credentials.keyId },
      { iss: credentials.teamId, iat: Math.floor(now() / 1000) },
      credentials.privateKey,
      "ES256",
    );
    cachedProviderToken = { value, issuedAtMs: now() };
    return value;
  };

  const getProviderToken = () => {
    // Apple requires provider tokens to be refreshed at least hourly and asks
    // providers not to regenerate them for every request. Reuse for 50 minutes.
    if (
      cachedProviderToken &&
      now() - cachedProviderToken.issuedAtMs < 50 * 60_000
    ) {
      return Promise.resolve(cachedProviderToken.value);
    }
    if (pendingProviderToken) return pendingProviderToken;
    pendingProviderToken = createProviderToken().finally(() => {
      pendingProviderToken = null;
    });
    return pendingProviderToken;
  };

  return async (job: PushJob): Promise<PushDeliveryResult> => {
    const providerToken = await getProviderToken();
    const host = credentials.environment === "production"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
    const response = await fetcher(
      `${host}/3/device/${encodeURIComponent(job.token)}`,
      {
        method: "POST",
        headers: {
          authorization: `bearer ${providerToken}`,
          "apns-topic": credentials.topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "apns-expiration": "0",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          aps: {
            alert: { title: job.title, body: job.body },
            sound: "default",
          },
          path: job.path,
        }),
        signal: AbortSignal.timeout(providerRequestTimeoutMs),
      },
    );
    if (response.ok) return { outcome: "success" };

    const data = await readJson(response);
    const reason = typeof data.reason === "string" ? data.reason : undefined;
    const error = `APNs ${response.status}${reason ? ` ${reason}` : ""}: ${
      describeProviderError(data)
    }`;
    if (
      response.status === 410 || reason === "Unregistered"
    ) {
      return { outcome: "invalid_token", error };
    }
    if (response.status === 429 || response.status >= 500) {
      return {
        outcome: "retry",
        error,
        retryAfterSeconds: readRetryAfterSeconds(response, now()),
      };
    }
    if (response.status === 401 || response.status === 403) {
      return { outcome: "retry", error, retryAfterSeconds: 900 };
    }
    return { outcome: "permanent", error };
  };
}

export function parseFirebaseServiceAccount(
  raw: string,
): FirebaseServiceAccount {
  const value = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
  if (!value.project_id || !value.client_email || !value.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing required fields");
  }
  return {
    project_id: value.project_id,
    client_email: value.client_email,
    private_key: normalizePrivateKey(value.private_key),
  };
}

export function readRetryAfterSeconds(response: Response, nowMs = Date.now()) {
  const value = response.headers.get("retry-after");
  if (!value) return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(15, Math.min(Math.ceil(seconds), 3600));
  }
  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) return 60;
  return Math.max(15, Math.min(Math.ceil((dateMs - nowMs) / 1000), 3600));
}

async function signJwt(
  header: Record<string, string>,
  claims: Record<string, string | number>,
  privateKey: string,
  algorithm: "RS256" | "ES256",
) {
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const isRsa = algorithm === "RS256";
  const cryptoAlgorithm = isRsa
    ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
    : { name: "ECDSA", namedCurve: "P-256" };
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(normalizePrivateKey(privateKey)),
    cryptoAlgorithm,
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    isRsa ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function normalizePrivateKey(value: string) {
  return value.replaceAll("\\n", "\n").trim();
}

function pemToBytes(pem: string) {
  const base64 = pem.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,
    "",
  );
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value: unknown) {
  return base64UrlBytes(encoder.encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(
    /=+$/,
    "",
  );
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function findFcmErrorCode(data: Record<string, unknown>) {
  const error = data.error;
  if (!error || typeof error !== "object") return undefined;
  const details = (error as { details?: unknown }).details;
  if (!Array.isArray(details)) return undefined;
  for (const detail of details) {
    if (!detail || typeof detail !== "object") continue;
    const errorCode = (detail as { errorCode?: unknown }).errorCode;
    if (typeof errorCode === "string") return errorCode;
  }
  return undefined;
}

function describeProviderError(data: Record<string, unknown>) {
  const directReason = data.reason;
  if (typeof directReason === "string") return directReason.slice(0, 400);
  const error = data.error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 400);
  }
  return "unknown provider error";
}

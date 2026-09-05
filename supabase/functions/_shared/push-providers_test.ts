import {
  createApnsSender,
  createFcmSender,
  parseFirebaseServiceAccount,
  readRetryAfterSeconds,
} from "./push-providers.ts";

Deno.test("FCM shares OAuth refresh while sending Android notifications", async () => {
  const privateKey = await createPrivateKeyPem({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  });
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) {
      return Promise.resolve(
        Response.json({ access_token: "access-token", expires_in: 3600 }),
      );
    }
    return Promise.resolve(
      Response.json({ name: "projects/trainlog/messages/1" }),
    );
  };
  const sender = createFcmSender(
    {
      project_id: "trainlog",
      client_email: "push@trainlog.iam.gserviceaccount.com",
      private_key: privateKey,
    },
    fetcher,
    () => 1_700_000_000_000,
  );

  const [first, second] = await Promise.all([
    sender({
      token: "android-token-1",
      title: "title",
      body: "body",
      path: "/friends",
    }),
    sender({
      token: "android-token-2",
      title: "title",
      body: "body",
      path: "/friends",
    }),
  ]);

  assertEquals(first.outcome, "success");
  assertEquals(second.outcome, "success");
  assertEquals(
    requests.filter((request) => request.url.includes("oauth2.googleapis.com"))
      .length,
    1,
  );
  assertEquals(requests.length, 3);
  const payload = JSON.parse(String(requests[1].init?.body));
  assertEquals(payload.message.data.path, "/friends");
  assertEquals(
    payload.message.android.notification.channel_id,
    "friend-activity",
  );
});

Deno.test("FCM removes an unregistered token instead of retrying it", async () => {
  const privateKey = await createPrivateKeyPem({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  });
  let requestCount = 0;
  const fetcher: typeof fetch = () => {
    requestCount += 1;
    if (requestCount === 1) {
      return Promise.resolve(
        Response.json({ access_token: "access-token", expires_in: 3600 }),
      );
    }
    return Promise.resolve(Response.json({
      error: {
        message: "Requested entity was not found.",
        details: [{ errorCode: "UNREGISTERED" }],
      },
    }, { status: 404 }));
  };
  const sender = createFcmSender({
    project_id: "trainlog",
    client_email: "push@trainlog.iam.gserviceaccount.com",
    private_key: privateKey,
  }, fetcher);

  const result = await sender({
    token: "expired-token",
    title: "title",
    body: "body",
    path: "/friends",
  });

  assertEquals(result.outcome, "invalid_token");
});

Deno.test("FCM keeps a token when a code-less 404 may be a project configuration error", async () => {
  const privateKey = await createPrivateKeyPem({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  });
  let requestCount = 0;
  const fetcher: typeof fetch = () => {
    requestCount += 1;
    if (requestCount === 1) {
      return Promise.resolve(
        Response.json({ access_token: "access-token", expires_in: 3600 }),
      );
    }
    return Promise.resolve(Response.json({
      error: { message: "Requested entity was not found." },
    }, { status: 404 }));
  };
  const sender = createFcmSender({
    project_id: "wrong-project",
    client_email: "push@trainlog.iam.gserviceaccount.com",
    private_key: privateKey,
  }, fetcher);

  const result = await sender({
    token: "valid-token",
    title: "title",
    body: "body",
    path: "/friends",
  });

  assertEquals(result.outcome, "permanent");
});

Deno.test("APNs uses the selected environment and alert payload", async () => {
  const privateKey = await createPrivateKeyPem({
    name: "ECDSA",
    namedCurve: "P-256",
  });
  let request: { url: string; init?: RequestInit } | undefined;
  const fetcher: typeof fetch = (input, init) => {
    request = { url: String(input), init };
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  const sender = createApnsSender(
    {
      keyId: "ABCDEFGHIJ",
      teamId: "KLMNOPQRST",
      privateKey,
      topic: "app.trainlog.mobile",
      environment: "production",
    },
    fetcher,
    () => 1_700_000_000_000,
  );

  const result = await sender({
    token: "ios-token",
    title: "title",
    body: "body",
    path: "/friends",
  });

  assertEquals(result.outcome, "success");
  assert(request?.url.startsWith("https://api.push.apple.com/3/device/"));
  const payload = JSON.parse(String(request?.init?.body));
  assertEquals(payload.aps.alert.title, "title");
  assertEquals(payload.path, "/friends");
});

Deno.test("APNs does not delete a token when the environment or topic may be wrong", async () => {
  const privateKey = await createPrivateKeyPem({
    name: "ECDSA",
    namedCurve: "P-256",
  });
  const fetcher: typeof fetch = () =>
    Promise.resolve(
      Response.json({ reason: "BadDeviceToken" }, { status: 400 }),
    );
  const sender = createApnsSender({
    keyId: "ABCDEFGHIJ",
    teamId: "KLMNOPQRST",
    privateKey,
    topic: "app.trainlog.mobile",
    environment: "development",
  }, fetcher);

  const result = await sender({
    token: "ios-token",
    title: "title",
    body: "body",
    path: "/friends",
  });

  assertEquals(result.outcome, "permanent");
});

Deno.test("Retry-After is bounded for queue scheduling", () => {
  const response = new Response(null, { headers: { "retry-after": "99999" } });
  assertEquals(readRetryAfterSeconds(response), 3600);
});

Deno.test("Firebase service account validation does not accept partial data", () => {
  let message = "";
  try {
    parseFirebaseServiceAccount(JSON.stringify({ project_id: "trainlog" }));
  } catch (error) {
    message = error instanceof Error ? error.message : "";
  }
  assert(message.includes("missing required fields"));
});

async function createPrivateKeyPem(
  algorithm: RsaHashedKeyGenParams | EcKeyGenParams,
) {
  const keys = await crypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ]);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  const bytes = new Uint8Array(pkcs8);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`;
}

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("assertion failed");
}

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`expected ${String(expected)}, received ${String(actual)}`);
  }
}

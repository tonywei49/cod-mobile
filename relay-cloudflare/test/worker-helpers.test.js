import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import worker, { RelaySession, internals } from "../src/worker.js";

test("normalizes short pairing codes like the Node relay", () => {
  assert.equal(internals.normalizeShortPairingCode(" abcd-2345 "), "ABCD2345");
  assert.equal(internals.normalizeShortPairingCode("abc"), "");
  assert.equal(internals.normalizeShortPairingCode("ABCDEFGHIJKLM"), "");
  assert.equal(internals.normalizeShortPairingCode("ABCDO123"), "");
});

test("normalizes mac registration", () => {
  const registration = internals.normalizeMacRegistration({
    macDeviceId: " mac-1 ",
    macIdentityPublicKey: " pub ",
    displayName: " Mac ",
    trustedPhoneDeviceId: " phone-1 ",
    trustedPhonePublicKey: " phone-pub ",
    pairingCode: " abcd2345 ",
    pairingVersion: "2",
    pairingExpiresAt: "1778668768789",
  }, "session-1");

  assert.deepEqual(registration, {
    sessionId: "session-1",
    macDeviceId: "mac-1",
    macIdentityPublicKey: "pub",
    displayName: "Mac",
    trustedPhoneDeviceId: "phone-1",
    trustedPhonePublicKey: "phone-pub",
    pairingCode: "ABCD2345",
    pairingVersion: 2,
    pairingExpiresAt: 1778668768789,
  });
});

test("verifies trusted reconnect Ed25519 signatures", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicJwk = publicKey.export({ format: "jwk" });
  const publicKeyBase64 = base64UrlToBase64(publicJwk.x);
  const transcript = internals.buildTrustedSessionResolveBytes({
    macDeviceId: "mac-1",
    phoneDeviceId: "phone-1",
    phoneIdentityPublicKey: publicKeyBase64,
    nonce: "nonce-1",
    timestamp: 1778668768789,
  });
  const signature = sign(null, Buffer.from(transcript), privateKey).toString("base64");

  assert.equal(
    await internals.verifyTrustedSessionResolveSignature(publicKeyBase64, transcript, signature),
    true
  );
  assert.equal(
    await internals.verifyTrustedSessionResolveSignature(publicKeyBase64, transcript, Buffer.alloc(64).toString("base64")),
    false
  );
});

test("serves public App Store legal and support pages without exposing the repo", async () => {
  for (const pathname of ["/privacy", "/terms", "/support"]) {
    const response = await worker.fetch(new Request(`https://codex.gotradetalk.com${pathname}`), {});
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/html/);
    assert.match(body, /Gogodex/);
    assert.doesNotMatch(body, /github\.com\/tonywei49\/cod-mobile/i);
  }
});

test("redirects root to the support page", async () => {
  const response = await worker.fetch(new Request("https://codex.gotradetalk.com/"), {});

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/support");
});

test("rejects unsupported methods on public pages", async () => {
  const response = await worker.fetch(new Request("https://codex.gotradetalk.com/privacy", {
    method: "POST",
  }), {});

  assert.equal(response.status, 405);
});

test("serves not found as an HTML page for browser navigation", async () => {
  const response = await worker.fetch(new Request("https://codex.gotradetalk.com/not-real"), {});
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /text\/html/);
  assert.match(body, /Page not found/);
});

test("accepts relay sockets through Durable Object WebSocket hibernation", async () => {
  const originalWebSocketPair = globalThis.WebSocketPair;
  const originalWebSocket = globalThis.WebSocket;
  const originalResponse = globalThis.Response;
  const acceptedSockets = [];

  globalThis.WebSocket = {
    OPEN: 1,
    CONNECTING: 0,
  };
  globalThis.WebSocketPair = class FakeWebSocketPair {
    constructor() {
      this[0] = new FakeSocket("client");
      this[1] = new FakeSocket("server");
    }
  };
  globalThis.Response = class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.webSocket = init.webSocket;
    }
  };

  try {
    const session = new RelaySession({
      acceptWebSocket(ws) {
        acceptedSockets.push(ws);
      },
      getWebSockets() {
        return [];
      },
    }, {});

    const response = await session.fetch(new Request("https://relay/relay/session-1", {
      headers: {
        upgrade: "websocket",
        "x-role": "mac",
      },
    }));

    assert.equal(response.status, 101);
    assert.equal(acceptedSockets.length, 1);
    assert.equal(acceptedSockets[0].name, "server");
    assert.equal(acceptedSockets[0].acceptCalls, 0);
  } finally {
    globalThis.WebSocketPair = originalWebSocketPair;
    globalThis.WebSocket = originalWebSocket;
    globalThis.Response = originalResponse;
  }
});

function base64UrlToBase64(value) {
  const base64 = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
}

class FakeSocket {
  constructor(name) {
    this.name = name;
    this.acceptCalls = 0;
    this.readyState = WebSocket.OPEN;
    this.sent = [];
    this.listeners = new Map();
  }

  accept() {
    this.acceptCalls += 1;
  }

  addEventListener(eventName, listener) {
    this.listeners.set(eventName, listener);
  }

  close() {
    this.readyState = 3;
  }

  send(message) {
    this.sent.push(message);
  }

  serializeAttachment(value) {
    this.attachment = value;
  }

  deserializeAttachment() {
    return this.attachment;
  }
}

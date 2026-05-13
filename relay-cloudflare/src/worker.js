// FILE: worker.js
// Purpose: Cloudflare Workers + Durable Objects relay for Gogodex.
// Layer: Serverless relay entrypoint

const CLEANUP_DELAY_MS = 60_000;
const MAC_ABSENCE_GRACE_MS = 15_000;
const CLOSE_CODE_SESSION_UNAVAILABLE = 4002;
const CLOSE_CODE_IPHONE_REPLACED = 4003;
const CLOSE_CODE_MAC_ABSENCE_BUFFER_FULL = 4004;
const TRUSTED_SESSION_RESOLVE_TAG = "remodex-trusted-session-resolve-v1";
const TRUSTED_SESSION_RESOLVE_SKEW_MS = 90_000;
const SHORT_PAIRING_CODE_MIN_LENGTH = 8;
const SHORT_PAIRING_CODE_MAX_LENGTH = 12;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      if (env.EXPOSE_DETAILED_HEALTH === "true") {
        const registry = registryStub(env);
        const response = await registry.fetch(new Request("https://registry/internal/stats"));
        const registryStats = await response.json();
        return json({ ok: true, registry: registryStats });
      }
      return json({ ok: true });
    }

    if (url.pathname.startsWith("/relay/")) {
      const sessionId = decodeURIComponent(url.pathname.slice("/relay/".length).split("/")[0] || "");
      if (!sessionId.trim()) {
        return json({ ok: false, error: "Missing session id", code: "missing_session_id" }, 400);
      }
      const objectId = env.RELAY_SESSION.idFromName(sessionId.trim());
      return env.RELAY_SESSION.get(objectId).fetch(request);
    }

    if (request.method === "POST" && url.pathname === "/v1/pairing/code/resolve") {
      return registryStub(env).fetch(request);
    }

    if (request.method === "POST" && url.pathname === "/v1/trusted/session/resolve") {
      return registryStub(env).fetch(request);
    }

    return json({ ok: false, error: "Not found" }, 404);
  },
};

export class RelaySession {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessionId = null;
    this.mac = null;
    this.clients = new Set();
    this.macRegistration = null;
    this.macAbsenceTimer = null;
    this.cleanupTimer = null;
    this.metrics = {
      acceptedConnections: 0,
      closedConnections: 0,
      macMessagesRelayed: 0,
      mobileMessagesRelayed: 0,
      mobileMessagesRejectedDuringMacAbsence: 0,
    };
    this.restoreHibernatedSockets();
    this.setAutoResponse();
  }

  async fetch(request) {
    const url = new URL(request.url);
    const sessionId = decodeURIComponent(url.pathname.slice("/relay/".length).split("/")[0] || "").trim();
    if (!sessionId) {
      return json({ ok: false, error: "Missing session id", code: "missing_session_id" }, 400);
    }
    this.sessionId = sessionId;

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "Expected WebSocket upgrade", code: "expected_websocket" }, 426);
    }

    const role = normalizeRelayRole(request.headers.get("x-role"));
    if (role !== "mac" && !isRelayMobileRole(role)) {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].close(4000, "Missing sessionId or invalid x-role header");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    if (isRelayMobileRole(role) && !this.canAcceptMobileClientConnection()) {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].close(CLOSE_CODE_SESSION_UNAVAILABLE, "Mac session not available");
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    const pair = new WebSocketPair();
    const server = pair[1];
    this.state.acceptWebSocket(server);
    this.metrics.acceptedConnections += 1;
    this.clearCleanupTimer();

    if (role === "mac") {
      await this.acceptMac(server, request.headers);
    } else {
      this.acceptMobile(server, role);
    }

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  restoreHibernatedSockets() {
    if (typeof this.state.getWebSockets !== "function") {
      return;
    }

    for (const ws of this.state.getWebSockets()) {
      const attachment = readSocketAttachment(ws);
      const role = normalizeRelayRole(attachment?.role);
      if (!role) {
        continue;
      }

      if (attachment?.sessionId && !this.sessionId) {
        this.sessionId = String(attachment.sessionId);
      }

      if (role === "mac") {
        this.mac = ws;
        this.macRegistration = normalizeMacRegistration(attachment?.macRegistration, this.sessionId);
      } else if (isRelayMobileRole(role)) {
        this.clients.add(ws);
      }
    }
  }

  setAutoResponse() {
    if (
      typeof this.state.setWebSocketAutoResponse === "function"
      && typeof WebSocketRequestResponsePair !== "undefined"
    ) {
      this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }
  }

  async webSocketMessage(ws, message) {
    const attachment = readSocketAttachment(ws);
    const role = normalizeRelayRole(attachment?.role);
    if (!role) {
      ws.close(4000, "Missing socket role");
      return;
    }
    if (attachment?.sessionId && !this.sessionId) {
      this.sessionId = String(attachment.sessionId);
    }
    await this.handleMessage(ws, role, message);
  }

  async webSocketClose(ws) {
    const attachment = readSocketAttachment(ws);
    await this.handleClose(ws, normalizeRelayRole(attachment?.role));
  }

  async webSocketError(ws) {
    const attachment = readSocketAttachment(ws);
    await this.handleClose(ws, normalizeRelayRole(attachment?.role));
  }

  async acceptMac(ws, headers) {
    this.clearMacAbsenceTimer();
    const nextRegistration = normalizeMacRegistration({
      macDeviceId: readHeaderString(headers.get("x-mac-device-id")),
      macIdentityPublicKey: readHeaderString(headers.get("x-mac-identity-public-key")),
      displayName: readHeaderString(headers.get("x-machine-name")),
      trustedPhoneDeviceId: readHeaderString(headers.get("x-trusted-phone-device-id")),
      trustedPhonePublicKey: readHeaderString(headers.get("x-trusted-phone-public-key")),
      pairingCode: readHeaderString(headers.get("x-pairing-code")),
      pairingVersion: readHeaderString(headers.get("x-pairing-version")),
      pairingExpiresAt: readHeaderString(headers.get("x-pairing-expires-at")),
    }, this.sessionId);

    if (this.mac && this.mac.readyState === WebSocket.OPEN) {
      this.mac.close(4001, "Replaced by new Mac connection");
    }
    await this.unregisterMacRegistration();
    this.mac = ws;
    this.macRegistration = nextRegistration;
    writeSocketAttachment(ws, {
      role: "mac",
      sessionId: this.sessionId,
      macRegistration: this.macRegistration,
    });
    await this.registerMacRegistration();
  }

  acceptMobile(ws, role) {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close(CLOSE_CODE_IPHONE_REPLACED, "Replaced by newer mobile connection");
      }
      this.clients.delete(client);
    }
    writeSocketAttachment(ws, {
      role,
      sessionId: this.sessionId,
    });
    this.clients.add(ws);
  }

  async handleMessage(ws, role, data) {
    const msg = typeof data === "string" ? data : String(data);
    if (role === "mac" && await this.applyMacRegistrationMessage(msg)) {
      return;
    }

    if (role === "mac") {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          this.metrics.macMessagesRelayed += 1;
          client.send(msg);
        }
      }
      return;
    }

    if (this.mac?.readyState === WebSocket.OPEN) {
      this.metrics.mobileMessagesRelayed += 1;
      this.mac.send(msg);
      return;
    }

    this.metrics.mobileMessagesRejectedDuringMacAbsence += 1;
    ws.close(CLOSE_CODE_MAC_ABSENCE_BUFFER_FULL, "Mac temporarily unavailable");
  }

  async handleClose(ws, role) {
    this.metrics.closedConnections += 1;
    if (role === "mac") {
      if (this.mac === ws) {
        this.mac = null;
        await this.unregisterMacRegistration();
        if (this.clients.size > 0) {
          this.scheduleMacAbsenceTimeout();
        } else {
          this.scheduleCleanup();
        }
      }
    } else {
      this.clients.delete(ws);
      this.scheduleCleanup();
    }
  }

  async applyMacRegistrationMessage(rawMessage) {
    const parsed = safeParseJSON(rawMessage);
    if (parsed?.kind !== "relayMacRegistration" || typeof parsed.registration !== "object") {
      return false;
    }

    await this.unregisterMacRegistration();
    this.macRegistration = normalizeMacRegistration(parsed.registration, this.sessionId);
    await this.registerMacRegistration();
    return true;
  }

  canAcceptMobileClientConnection() {
    if (this.mac?.readyState === WebSocket.OPEN) {
      return true;
    }
    return Boolean(this.macAbsenceTimer);
  }

  scheduleMacAbsenceTimeout() {
    if (this.mac || this.macAbsenceTimer) {
      return;
    }
    this.clearCleanupTimer();
    this.macAbsenceTimer = setTimeout(() => {
      this.macAbsenceTimer = null;
      void this.unregisterMacRegistration();
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(CLOSE_CODE_SESSION_UNAVAILABLE, "Mac disconnected");
        }
      }
      this.scheduleCleanup();
    }, MAC_ABSENCE_GRACE_MS);
  }

  clearMacAbsenceTimer() {
    if (this.macAbsenceTimer) {
      clearTimeout(this.macAbsenceTimer);
      this.macAbsenceTimer = null;
    }
  }

  scheduleCleanup() {
    if (this.mac || this.clients.size > 0 || this.cleanupTimer || this.macAbsenceTimer) {
      return;
    }
  }

  clearCleanupTimer() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async registerMacRegistration() {
    if (!this.macRegistration?.macDeviceId) {
      return;
    }
    await registryStub(this.env).fetch("https://registry/internal/register", {
      method: "POST",
      body: JSON.stringify(this.macRegistration),
      headers: { "content-type": "application/json" },
    });
  }

  async unregisterMacRegistration() {
    if (!this.macRegistration?.macDeviceId) {
      return;
    }
    await registryStub(this.env).fetch("https://registry/internal/unregister", {
      method: "POST",
      body: JSON.stringify(this.macRegistration),
      headers: { "content-type": "application/json" },
    });
  }
}

export class RelayRegistry {
  constructor(state) {
    this.state = state;
    this.usedResolveNonces = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/internal/stats") {
      const macSessions = await this.state.storage.list({ prefix: "mac:" });
      const pairingCodes = await this.state.storage.list({ prefix: "pairing:" });
      return json({
        macSessions: macSessions.size,
        pairingCodes: pairingCodes.size,
        usedResolveNonces: this.usedResolveNonces.size,
      });
    }

    if (request.method === "POST" && url.pathname === "/internal/register") {
      const registration = await request.json();
      await this.register(registration);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/internal/unregister") {
      const registration = await request.json();
      await this.unregister(registration);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/v1/pairing/code/resolve") {
      return this.resolvePairingCode(await readJSONBody(request));
    }

    if (request.method === "POST" && url.pathname === "/v1/trusted/session/resolve") {
      return this.resolveTrustedMacSession(await readJSONBody(request));
    }

    return json({ ok: false, error: "Not found" }, 404);
  }

  async register(registration) {
    const normalized = normalizeMacRegistration(registration, registration?.sessionId);
    if (!normalized.macDeviceId || !normalized.sessionId) {
      return;
    }

    await this.state.storage.put(`mac:${normalized.macDeviceId}`, normalized);

    if (normalized.pairingCode && Number.isFinite(normalized.pairingExpiresAt)) {
      await this.state.storage.put(`pairing:${normalized.pairingCode}`, normalized);
    }
  }

  async unregister(registration) {
    const normalized = normalizeMacRegistration(registration, registration?.sessionId);
    const macKey = `mac:${normalized.macDeviceId}`;
    const storedMac = normalized.macDeviceId ? await this.state.storage.get(macKey) : null;
    if (storedMac?.sessionId === normalized.sessionId) {
      await this.state.storage.delete(macKey);
    }

    const pairingKey = `pairing:${normalized.pairingCode}`;
    const storedPairing = normalized.pairingCode ? await this.state.storage.get(pairingKey) : null;
    if (storedPairing?.sessionId === normalized.sessionId) {
      await this.state.storage.delete(pairingKey);
    }
  }

  async resolvePairingCode(body) {
    const normalizedCode = normalizeShortPairingCode(body?.code);
    if (!normalizedCode) {
      return json({ ok: false, error: "The pairing code is missing or malformed.", code: "invalid_request" }, 400);
    }

    const pairingKey = `pairing:${normalizedCode}`;
    const registration = await this.state.storage.get(pairingKey);
    if (!registration) {
      return json({ ok: false, error: "This pairing code is unavailable.", code: "pairing_code_unavailable" }, 404);
    }

    const now = Number(body?.now) || Date.now();
    if (!Number.isFinite(registration.pairingExpiresAt) || now > registration.pairingExpiresAt) {
      await this.state.storage.delete(pairingKey);
      return json({ ok: false, error: "This pairing code has expired.", code: "pairing_code_expired" }, 410);
    }

    if (!registration.macDeviceId || !registration.macIdentityPublicKey || !Number.isFinite(registration.pairingVersion)) {
      return json({ ok: false, error: "The bridge pairing metadata is incomplete.", code: "pairing_code_incomplete" }, 409);
    }

    return json({
      ok: true,
      v: registration.pairingVersion,
      sessionId: registration.sessionId,
      macDeviceId: registration.macDeviceId,
      macIdentityPublicKey: registration.macIdentityPublicKey,
      expiresAt: registration.pairingExpiresAt,
    });
  }

  async resolveTrustedMacSession(body) {
    const normalizedMacDeviceId = normalizeNonEmptyString(body?.macDeviceId);
    const normalizedPhoneDeviceId = normalizeNonEmptyString(body?.phoneDeviceId);
    const normalizedPhoneIdentityPublicKey = normalizeNonEmptyString(body?.phoneIdentityPublicKey);
    const normalizedNonce = normalizeNonEmptyString(body?.nonce);
    const normalizedSignature = normalizeNonEmptyString(body?.signature);
    const normalizedTimestamp = Number(body?.timestamp);
    const now = Number(body?.now) || Date.now();

    if (
      !normalizedMacDeviceId
      || !normalizedPhoneDeviceId
      || !normalizedPhoneIdentityPublicKey
      || !normalizedNonce
      || !normalizedSignature
      || !Number.isFinite(normalizedTimestamp)
    ) {
      return json({ ok: false, error: "The trusted-session resolve request is missing required fields.", code: "invalid_request" }, 400);
    }

    if (Math.abs(now - normalizedTimestamp) > TRUSTED_SESSION_RESOLVE_SKEW_MS) {
      return json({ ok: false, error: "This trusted-session resolve request has expired.", code: "resolve_request_expired" }, 401);
    }

    this.pruneUsedResolveNonces(now);
    const nonceKey = `${normalizedMacDeviceId}|${normalizedPhoneDeviceId}|${normalizedNonce}`;
    if (this.usedResolveNonces.has(nonceKey)) {
      return json({ ok: false, error: "This trusted-session resolve request was already used.", code: "resolve_request_replayed" }, 409);
    }

    const liveSession = await this.state.storage.get(`mac:${normalizedMacDeviceId}`);
    if (!liveSession) {
      return json({ ok: false, error: "The trusted Mac is offline right now.", code: "session_unavailable" }, 404);
    }

    if (
      liveSession.trustedPhoneDeviceId !== normalizedPhoneDeviceId
      || liveSession.trustedPhonePublicKey !== normalizedPhoneIdentityPublicKey
    ) {
      return json({ ok: false, error: "This iPhone is not trusted for the requested Mac.", code: "phone_not_trusted" }, 403);
    }

    const transcriptBytes = buildTrustedSessionResolveBytes({
      macDeviceId: normalizedMacDeviceId,
      phoneDeviceId: normalizedPhoneDeviceId,
      phoneIdentityPublicKey: normalizedPhoneIdentityPublicKey,
      nonce: normalizedNonce,
      timestamp: normalizedTimestamp,
    });
    const valid = await verifyTrustedSessionResolveSignature(
      normalizedPhoneIdentityPublicKey,
      transcriptBytes,
      normalizedSignature
    );
    if (!valid) {
      return json({ ok: false, error: "The trusted-session resolve signature is invalid.", code: "invalid_signature" }, 403);
    }

    this.usedResolveNonces.set(nonceKey, now + TRUSTED_SESSION_RESOLVE_SKEW_MS);
    return json({
      ok: true,
      macDeviceId: normalizedMacDeviceId,
      macIdentityPublicKey: liveSession.macIdentityPublicKey,
      displayName: liveSession.displayName || null,
      sessionId: liveSession.sessionId,
    });
  }

  pruneUsedResolveNonces(now) {
    for (const [nonceKey, expiresAt] of this.usedResolveNonces.entries()) {
      if (now >= expiresAt) {
        this.usedResolveNonces.delete(nonceKey);
      }
    }
  }
}

function registryStub(env) {
  return env.RELAY_REGISTRY.get(env.RELAY_REGISTRY.idFromName("global"));
}

async function readJSONBody(request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeRelayRole(headerValue) {
  return typeof headerValue === "string" ? headerValue.trim().toLowerCase() : "";
}

function isRelayMobileRole(role) {
  return role === "iphone" || role === "android";
}

function normalizeMacRegistration(registration, sessionId) {
  return {
    sessionId: normalizeNonEmptyString(sessionId || registration?.sessionId),
    macDeviceId: normalizeNonEmptyString(registration?.macDeviceId),
    macIdentityPublicKey: normalizeNonEmptyString(registration?.macIdentityPublicKey),
    displayName: normalizeNonEmptyString(registration?.displayName),
    trustedPhoneDeviceId: normalizeNonEmptyString(registration?.trustedPhoneDeviceId),
    trustedPhonePublicKey: normalizeNonEmptyString(registration?.trustedPhonePublicKey),
    pairingCode: normalizeShortPairingCode(registration?.pairingCode),
    pairingVersion: normalizePositiveInteger(registration?.pairingVersion),
    pairingExpiresAt: normalizePositiveInteger(registration?.pairingExpiresAt),
  };
}

function buildTrustedSessionResolveBytes({
  macDeviceId,
  phoneDeviceId,
  phoneIdentityPublicKey,
  nonce,
  timestamp,
}) {
  return concatBytes([
    encodeLengthPrefixedUTF8(TRUSTED_SESSION_RESOLVE_TAG),
    encodeLengthPrefixedUTF8(macDeviceId),
    encodeLengthPrefixedUTF8(phoneDeviceId),
    encodeLengthPrefixedData(base64ToBytes(phoneIdentityPublicKey)),
    encodeLengthPrefixedUTF8(nonce),
    encodeLengthPrefixedUTF8(String(timestamp)),
  ]);
}

async function verifyTrustedSessionResolveSignature(publicKeyBase64, transcriptBytes, signatureBase64) {
  try {
    const publicKey = await crypto.subtle.importKey(
      "raw",
      base64ToBytes(publicKeyBase64),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      { name: "Ed25519" },
      publicKey,
      base64ToBytes(signatureBase64),
      transcriptBytes
    );
  } catch {
    return false;
  }
}

function encodeLengthPrefixedUTF8(value) {
  return encodeLengthPrefixedData(new TextEncoder().encode(value));
}

function encodeLengthPrefixedData(value) {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, value.length, false);
  return concatBytes([length, value]);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function normalizeShortPairingCode(value) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (
    normalized.length < SHORT_PAIRING_CODE_MIN_LENGTH
    || normalized.length > SHORT_PAIRING_CODE_MAX_LENGTH
    || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

function normalizePositiveInteger(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function readHeaderString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSocketAttachment(ws) {
  if (typeof ws?.deserializeAttachment !== "function") {
    return null;
  }
  try {
    return ws.deserializeAttachment();
  } catch {
    return null;
  }
}

function writeSocketAttachment(ws, attachment) {
  if (typeof ws?.serializeAttachment === "function") {
    ws.serializeAttachment(attachment);
  }
}

function safeParseJSON(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export const internals = {
  buildTrustedSessionResolveBytes,
  normalizeMacRegistration,
  normalizeShortPairingCode,
  verifyTrustedSessionResolveSignature,
};

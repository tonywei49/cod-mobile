import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { internals } from "../src/worker.js";

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

function base64UrlToBase64(value) {
  const base64 = String(value).replaceAll("-", "+").replaceAll("_", "/");
  return base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
}

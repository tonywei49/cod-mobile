// FILE: codex-desktop-session-index.test.js
// Purpose: Verifies phone-authored Remodex turns are indexed for Codex.app desktop visibility.
// Layer: Unit test
// Depends on: node:test, node:assert/strict, fs, os, path, ../src/codex-desktop-session-index

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildDesktopThreadTitle,
  extractUserText,
  syncPhoneAuthoredDesktopSessionIndex,
  upsertDesktopSessionIndex,
} = require("../src/codex-desktop-session-index");

test("syncPhoneAuthoredDesktopSessionIndex indexes a phone turn/start for Codex Desktop", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-index-"));
  const indexPath = path.join(tempDir, "session_index.jsonl");

  const didSync = syncPhoneAuthoredDesktopSessionIndex(JSON.stringify({
    id: "request-1",
    method: "turn/start",
    params: {
      threadId: "thread-phone-1",
      input: [
        { type: "text", text: " hello from iPhone " },
        { type: "image", url: "file://image.png" },
      ],
    },
  }), {
    indexPath,
    now: () => new Date("2026-05-11T00:00:00.000Z"),
  });

  assert.equal(didSync, true);
  const entries = readIndexEntries(indexPath);
  assert.deepEqual(entries, [{
    id: "thread-phone-1",
    thread_name: "手机：hello from iPhone",
    updated_at: "2026-05-11T00:00:00.000Z",
  }]);
});

test("upsertDesktopSessionIndex preserves a desktop-owned title while refreshing updated_at", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-index-"));
  const indexPath = path.join(tempDir, "session_index.jsonl");
  fs.writeFileSync(indexPath, JSON.stringify({
    id: "thread-existing",
    thread_name: "User renamed desktop thread",
    updated_at: "2026-05-10T00:00:00.000Z",
  }) + "\n", "utf8");

  upsertDesktopSessionIndex({
    id: "thread-existing",
    thread_name: "手机：new phone message",
    updated_at: "2026-05-11T00:00:00.000Z",
  }, { indexPath });

  assert.deepEqual(readIndexEntries(indexPath), [{
    id: "thread-existing",
    thread_name: "User renamed desktop thread",
    updated_at: "2026-05-11T00:00:00.000Z",
  }]);
});

test("buildDesktopThreadTitle compacts whitespace and truncates long titles", () => {
  assert.equal(
    buildDesktopThreadTitle("  hello\n\nworld  "),
    "手机：hello world"
  );
  assert.equal(Array.from(buildDesktopThreadTitle("x".repeat(100))).length, 80);
});

test("extractUserText reads mixed app-server input items", () => {
  assert.equal(extractUserText({
    input: [
      { type: "text", text: "first" },
      { type: "mention", text: "@file" },
      "third",
      { type: "image", url: "file://image.png" },
    ],
  }), "first @file third");
});

function readIndexEntries(indexPath) {
  return fs.readFileSync(indexPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

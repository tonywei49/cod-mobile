// FILE: codex-desktop-session-index.js
// Purpose: Makes phone-authored Codex threads visible to Codex.app's desktop session list.
// Layer: Bridge helper
// Exports: syncPhoneAuthoredDesktopSessionIndex, buildDesktopThreadTitle, upsertDesktopSessionIndex
// Depends on: fs, os, path

const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TITLE_PREFIX = "手机：";
const DEFAULT_FALLBACK_TITLE = "手机 Codex";
const MAX_TITLE_RUNES = 80;

function syncPhoneAuthoredDesktopSessionIndex(rawMessage, {
  indexPath = defaultDesktopSessionIndexPath(),
  fsModule = fs,
  now = () => new Date(),
  titlePrefix = DEFAULT_TITLE_PREFIX,
  fallbackTitle = DEFAULT_FALLBACK_TITLE,
} = {}) {
  const request = safeParseJSON(rawMessage);
  const method = readString(request?.method);
  if (method !== "turn/start" && method !== "thread/start") {
    return false;
  }

  const params = request?.params && typeof request.params === "object" ? request.params : {};
  const threadId = extractThreadId(params);
  if (!threadId) {
    return false;
  }

  const userText = extractUserText(params);
  const threadName = buildDesktopThreadTitle(userText, { titlePrefix, fallbackTitle });
  upsertDesktopSessionIndex({
    id: threadId,
    thread_name: threadName,
    updated_at: now().toISOString(),
  }, {
    indexPath,
    fsModule,
    generatedTitlePrefix: titlePrefix,
  });
  return true;
}

function defaultDesktopSessionIndexPath() {
  const home = os.homedir();
  return home ? path.join(home, ".codex", "session_index.jsonl") : "";
}

function buildDesktopThreadTitle(userText, {
  titlePrefix = DEFAULT_TITLE_PREFIX,
  fallbackTitle = DEFAULT_FALLBACK_TITLE,
} = {}) {
  const compact = String(userText || "").trim().split(/\s+/).filter(Boolean).join(" ");
  const baseTitle = compact ? `${titlePrefix}${compact}` : fallbackTitle;
  const runes = Array.from(baseTitle);
  if (runes.length <= MAX_TITLE_RUNES) {
    return baseTitle;
  }
  return `${runes.slice(0, MAX_TITLE_RUNES - 3).join("")}...`;
}

function upsertDesktopSessionIndex(entry, {
  indexPath = defaultDesktopSessionIndexPath(),
  fsModule = fs,
  generatedTitlePrefix = DEFAULT_TITLE_PREFIX,
} = {}) {
  if (!indexPath || !entry?.id) {
    return false;
  }

  const retained = [];
  let mergedEntry = {
    id: entry.id,
    thread_name: entry.thread_name || DEFAULT_FALLBACK_TITLE,
    updated_at: entry.updated_at || new Date().toISOString(),
  };

  for (const line of readIndexLines(indexPath, fsModule)) {
    const existing = safeParseJSON(line);
    if (!existing || existing.id !== entry.id) {
      retained.push(line);
      continue;
    }

    const existingTitle = readString(existing.thread_name);
    const shouldPreserveTitle = existingTitle && !existingTitle.startsWith(generatedTitlePrefix);
    mergedEntry = {
      ...existing,
      thread_name: shouldPreserveTitle ? existingTitle : mergedEntry.thread_name,
      updated_at: mergedEntry.updated_at,
    };
  }

  retained.push(JSON.stringify(mergedEntry));
  fsModule.mkdirSync(path.dirname(indexPath), { recursive: true, mode: 0o700 });
  fsModule.writeFileSync(indexPath, `${retained.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  return true;
}

function readIndexLines(indexPath, fsModule) {
  try {
    const data = fsModule.readFileSync(indexPath, "utf8");
    return data.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function extractThreadId(params) {
  return (
    readString(params.threadId)
    || readString(params.thread_id)
    || readString(params.thread?.id)
    || readString(params.thread?.threadId)
    || readString(params.thread?.thread_id)
    || readString(params.turn?.threadId)
    || readString(params.turn?.thread_id)
  );
}

function extractUserText(params) {
  const direct = readString(params.text)
    || readString(params.message)
    || readString(params.userInput)
    || readString(params.user_input);
  if (direct) {
    return direct;
  }

  if (!Array.isArray(params.input)) {
    return "";
  }

  const textParts = [];
  for (const item of params.input) {
    if (typeof item === "string") {
      textParts.push(item);
      continue;
    }
    const text = readString(item?.text)
      || readString(item?.content)
      || readString(item?.message);
    if (text) {
      textParts.push(text);
    }
  }
  return textParts.join(" ");
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function safeParseJSON(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  buildDesktopThreadTitle,
  defaultDesktopSessionIndexPath,
  extractUserText,
  syncPhoneAuthoredDesktopSessionIndex,
  upsertDesktopSessionIndex,
};

// FILE: start-remodex-dev-script.test.js
// Purpose: Verifies the local developer launcher starts bridge runs with conservative desktop refresh.
// Layer: CLI utility test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, child_process, fs, os, path

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const launcherPath = path.join(repoRoot, "start-remodex-dev.sh");

test("start-remodex-dev enables conservative desktop refresh for local bridge runs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "remodex-start-script-"));
  const binDir = path.join(tempDir, "bin");
  const logPath = path.join(tempDir, "node-env.log");
  fs.mkdirSync(binDir, { recursive: true });

  writeExecutable(path.join(binDir, "curl"), "#!/usr/bin/env bash\nexit 0\n");
  writeExecutable(path.join(binDir, "pgrep"), "#!/usr/bin/env bash\nexit 1\n");
  writeExecutable(path.join(binDir, "node"), `#!/usr/bin/env bash
printf 'REMODEX_RELAY=%s\\n' "$REMODEX_RELAY" >> "${logPath}"
printf 'REMODEX_REFRESH_ENABLED=%s\\n' "$REMODEX_REFRESH_ENABLED" >> "${logPath}"
printf 'REMODEX_REFRESH_MODE=%s\\n' "$REMODEX_REFRESH_MODE" >> "${logPath}"
exit 0
`);

  execFileSync("bash", [launcherPath, "--hostname", "10.0.0.2"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      REMODEX_RELAY: "",
      REMODEX_REFRESH_ENABLED: "",
      REMODEX_REFRESH_MODE: "",
      REMODEX_LOCAL_ENV_FILE: path.join(tempDir, "missing.env"),
    },
    stdio: "pipe",
  });

  const output = fs.readFileSync(logPath, "utf8");
  assert.match(output, /REMODEX_RELAY=ws:\/\/10\.0\.0\.2:9000\/relay/);
  assert.match(output, /REMODEX_REFRESH_ENABLED=true/);
  assert.match(output, /REMODEX_REFRESH_MODE=completion/);
});

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
}

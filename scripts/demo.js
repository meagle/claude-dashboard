#!/usr/bin/env node
/**
 * Demo script — animates fake sessions through all states so you can record
 * the dashboard. Run this, then screen-record the menu bar popover or
 * detached panel.
 *
 * Usage:
 *   node scripts/demo.js
 *
 * Ctrl+C to stop and clean up.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const SESSIONS_FILE = path.join(
  os.homedir(),
  ".config",
  "claude-dashboard",
  "sessions.json",
);
const CONFIG_FILE = path.join(
  os.homedir(),
  ".config",
  "claude-dashboard",
  "config.json",
);

// Suppress notifications for the duration of the demo
let configBackup = null;
try {
  configBackup = fs.readFileSync(CONFIG_FILE, "utf8");
} catch {}
try {
  const cfg = configBackup ? JSON.parse(configBackup) : {};
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(
      { ...cfg, notifications: false, notificationSound: false },
      null,
      2,
    ),
  );
} catch {}

function restoreConfig() {
  try {
    if (configBackup !== null) fs.writeFileSync(CONFIG_FILE, configBackup);
    else fs.unlinkSync(CONFIG_FILE);
  } catch {}
}

// Spawn background processes with "claude" in the script path so isAlive() passes
const WORKER_SCRIPT = "/tmp/claude-dashboard-demo-worker.js";
fs.writeFileSync(WORKER_SCRIPT, "setInterval(() => {}, 60000);");
const workers = [1, 2, 3].map(() =>
  spawn(process.execPath, [WORKER_SCRIPT], {
    detached: false,
    stdio: "ignore",
  }),
);
const PIDS = workers.map((w) => w.pid);

function write(sessions) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE + ".tmp", JSON.stringify(sessions, null, 2));
  fs.renameSync(SESSIONS_FILE + ".tmp", SESSIONS_FILE);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const now = Date.now();
const HOME = os.homedir();

// ── Base session shapes ───────────────────────────────────────────────────────

function session(overrides) {
  return {
    sessionId: "demo-" + overrides.id,
    pid: PIDS[overrides.id - 1],
    termSessionId: null,
    workingDir: HOME + "/code/" + overrides.dir,
    dirName: overrides.dir,
    branch: overrides.branch ?? "main",
    worktree: overrides.worktree ?? null,
    status: "active",
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    lastToolSummary: null,
    lastPrompt: overrides.prompt ?? null,
    lastMessage: null,
    currentTask: overrides.task ?? null,
    tasks: overrides.tasks ?? [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    turns: 1,
    toolCount: overrides.toolCount ?? 0,
    totalTokens: overrides.totalTokens ?? null,
    model: overrides.model ?? "Sonnet 4.6",
    contextPct: overrides.contextPct ?? 18,
    bashStartedAt: null,
    gitSummary: overrides.gitSummary ?? null,
    gitAhead: overrides.gitAhead ?? null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: now - (overrides.age ?? 0),
    turnStartedAt: now - (overrides.turnAge ?? 0),
    lastActivity: now - (overrides.lastActivity ?? 0),
    dismissed: false,
    ...overrides.extra,
  };
}

// ── Demo sequence ─────────────────────────────────────────────────────────────

async function run() {
  console.log("🎬  Demo starting in 10 seconds — get QuickTime ready!\n");
  for (let i = 10; i >= 1; i--) {
    process.stdout.write(`    ${i}...\r`);
    await sleep(1000);
  }
  console.log("    ▶ Recording! Open the dashboard now.          \n");

  // Backup existing sessions
  let backup = null;
  try {
    backup = fs.readFileSync(SESSIONS_FILE, "utf8");
  } catch {}

  // Restore on exit
  process.on("SIGINT", () => {
    workers.forEach((w) => w.kill());
    if (backup !== null) fs.writeFileSync(SESSIONS_FILE, backup);
    else
      try {
        fs.unlinkSync(SESSIONS_FILE);
      } catch {}
    restoreConfig();
    console.log("\n✅  Demo stopped. Sessions restored.");
    process.exit(0);
  });

  // ── Step 1: First session appears ──────────────────────────────────────────
  console.log("Step 1/10 — First session starts (active)");
  const s1 = session({
    id: 1,
    dir: "claude-dashboard",
    branch: "master",
    prompt: "Refactor the hook to support streaming responses — the current implementation buffers the full response before writing to sessions.json, which means the card doesn't update until the turn completes",
    task: "Refactor hook to support streaming",
    tasks: [
      { id: "t1", subject: "Read existing hook code", status: "completed" },
      {
        id: "t2",
        subject: "Add streaming response field",
        status: "in_progress",
      },
      { id: "t3", subject: "Update tests", status: "pending" },
    ],
    gitSummary: "4 files +82 -31",
    contextPct: 22,
    age: 90_000,
    turnAge: 12_000,
    toolCount: 14,
    extra: {
      currentTool: "Read",
      lastToolSummary: "packages/hook/src/hook.ts",
    },
  });
  write([s1]);
  await sleep(2500);

  // ── Step 2: Second session appears ─────────────────────────────────────────
  console.log("Step 2/10 — Second session starts (active)");
  const s2 = session({
    id: 2,
    dir: "api-service",
    branch: "feature/auth",
    prompt: "Add rate limiting middleware to all endpoints — use a sliding window algorithm, 100 req/min per IP, return 429 with Retry-After header",
    task: "Add rate limiting middleware",
    gitSummary: "2 files +44 -3",
    contextPct: 11,
    age: 45_000,
    turnAge: 8_000,
    toolCount: 7,
    extra: { currentTool: "Bash", lastToolSummary: "npm test -- --grep rate" },
  });
  write([s1, s2]);
  await sleep(2500);

  // ── Step 3: Worktree session appears ───────────────────────────────────────
  console.log("Step 3/10 — Worktree session appears");
  const s3 = session({
    id: 3,
    dir: "payments-service",
    branch: "main",
    worktree: "stripe-v2",
    prompt: "Migrate Stripe integration to v2 API — update all payment intents, refunds, and webhook handlers. Make sure we handle the new idempotency key format",
    task: "Migrate Stripe integration to v2",
    gitSummary: "7 files +210 -88",
    contextPct: 35,
    age: 20_000,
    turnAge: 4_000,
    toolCount: 4,
    extra: {
      currentTool: "WebFetch",
      lastToolSummary: "https://stripe.com/docs/api/v2",
      partialResponse:
        "The Stripe v2 API uses a different authentication flow. Instead of passing the secret key directly, you now create a scoped session token first. I'll update the client initialisation, then work through each endpoint — payment intents need the new confirm_at parameter, and refunds now require an explicit reason code…",
    },
  });
  write([s1, s2, s3]);
  await sleep(2500);

  // ── Step 4: Session 1 hits a permission dialog ─────────────────────────────
  console.log("Step 4/10 — Session 1 waiting for permission");
  const s1_perm = {
    ...s1,
    status: "waiting_permission",
    currentTool: null,
    lastTool: "Write",
    lastToolSummary: "packages/hook/src/hook.ts",
    lastActivity: Date.now(),
  };
  write([s1_perm, s2, s3]);
  await sleep(3000);

  // ── Step 5: Session 2 asks a question ──────────────────────────────────────
  console.log("Step 5/10 — Session 2 waiting for input");
  const s2_input = {
    ...s2,
    status: "waiting_input",
    currentTool: null,
    lastMessage:
      "Should I apply rate limiting to internal health-check endpoints too? They're called every 30s by the load balancer so they'd burn through the 100 req/min budget pretty fast.",
    lastActivity: Date.now(),
  };
  write([s1_perm, s2_input, s3]);
  await sleep(3000);

  // ── Step 6: Session 1 resumes (permission granted) ─────────────────────────
  console.log("Step 6/10 — Session 1 resumes after permission granted");
  const s1_resume = {
    ...s1,
    status: "active",
    currentTool: "Bash",
    lastToolSummary: "npm test",
    turnStartedAt: Date.now(),
    lastActivity: Date.now(),
    contextPct: 28,
    toolCount: 22,
    tasks: [
      { id: "t1", subject: "Read existing hook code", status: "completed" },
      {
        id: "t2",
        subject: "Add streaming response field",
        status: "completed",
      },
      { id: "t3", subject: "Update tests", status: "in_progress" },
    ],
  };
  write([s1_resume, s2_input, s3]);
  await sleep(2500);

  // ── Step 7: Session 3 enters a loop ───────────────────────────────────────
  console.log("Step 7/10 — Session 3 stuck in loop");
  const s3_loop = {
    ...s3,
    status: "active",
    currentTool: "Bash",
    lastToolSummary: "stripe-v2/migrate.sh",
    errorState: true,
    loopTool: "Bash",
    loopCount: 4,
    lastActivity: Date.now(),
    toolCount: 14,
  };
  write([s1_resume, s2_input, s3_loop]);
  await sleep(3000);

  // ── Step 8: Worktree session recovers and finishes ─────────────────────────
  console.log("Step 8/10 — Worktree session done");
  const s3_done = {
    ...s3,
    status: "done",
    currentTool: null,
    partialResponse: null,
    lastMessage:
      "Migration complete. Updated payment intents, refunds, and webhook handlers to v2. The new idempotency key format uses a UUID prefix — existing keys in the DB are still valid. All 23 integration tests passing.",
    lastActivity: Date.now(),
    gitSummary: "9 files +287 -102",
    gitAhead: 3,
    toolCount: 19,
    totalTokens: 84000,
  };
  write([s1_resume, s2_input, s3_done]);
  await sleep(2500);

  // ── Step 8: Session 1 finishes ─────────────────────────────────────────────
  console.log("Step 9/10 — Session 1 done");
  const s1_done = {
    ...s1_resume,
    status: "done",
    currentTool: null,
    lastMessage: "Done. Added partialResponse field to Session, hook now writes it on every PostToolUse event, and clears it on Stop. The renderer polls this field to show the streaming preview. All 47 tests passing.",
    lastActivity: Date.now(),
    costUsd: 0.0312,
    turns: 8,
    contextPct: 31,
    toolCount: 31,
    totalTokens: 142000,
    tasks: [
      { id: "t1", subject: "Read existing hook code", status: "completed" },
      {
        id: "t2",
        subject: "Add streaming response field",
        status: "completed",
      },
      { id: "t3", subject: "Update tests", status: "completed" },
    ],
  };
  write([s1_done, s2_input, s3_done]);
  await sleep(2500);

  // ── Step 9: Session 2 finishes ─────────────────────────────────────────────
  console.log("Step 10/10 — Session 2 done");
  const s2_done = {
    ...s2_input,
    status: "done",
    currentTool: null,
    lastMessage:
      "Rate limiting applied to all public endpoints using a sliding window counter in Redis. Health checks excluded via path allowlist. Added integration tests for the 429 response and Retry-After header.",
    lastActivity: Date.now(),
    costUsd: 0.0189,
    turns: 5,
    contextPct: 14,
    toolCount: 12,
    totalTokens: 51000,
    gitSummary: "3 files +61 -3",
  };
  write([s1_done, s2_done, s3_done]);
  await sleep(3000);

  // Clear all cards
  write([]);
  workers.forEach((w) => w.kill());
  if (backup !== null) fs.writeFileSync(SESSIONS_FILE, backup);
  else
    try {
      fs.unlinkSync(SESSIONS_FILE);
    } catch {}
  restoreConfig();
  console.log("\n🎬  Done — stop recording!");
  console.log(`
To convert your recording to a GIF with ffmpeg:

  # High quality, 800px wide, 20fps
  ffmpeg -i input.mov -vf "fps=20,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer" -loop 0 output.gif

  # Smaller file size (~400px wide, 15fps)
  ffmpeg -i input.mov -vf "fps=15,scale=400:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer" -loop 0 output-small.gif

Replace "input.mov" with your actual recording filename.
`);
}

run().catch(console.error);

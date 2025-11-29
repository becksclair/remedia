// Bun runtime global (loose typing is fine for this script-only helper)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Bun: any;

const REAL_URL =
  process.env.PLAYWRIGHT_REAL_URL || "https://www.redgifs.com/watch/delayedaromatichousefly";

const REAL_URL_ALT =
  process.env.PLAYWRIGHT_REAL_URL_ALT || "https://www.redgifs.com/watch/ovalhugebuck";

async function main() {
  const cmd = ["bunx", "playwright", "test", "e2e/real-download.spec.ts"];

  const proc = Bun.spawn({
    cmd,
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_REAL_DL: "1",
      PLAYWRIGHT_REAL_URL: REAL_URL,
      PLAYWRIGHT_REAL_URL_ALT: REAL_URL_ALT,
    },
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error("[real-download-e2e] failure:", err);
  process.exit(1);
});

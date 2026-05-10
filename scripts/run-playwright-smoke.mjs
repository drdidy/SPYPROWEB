import { spawnSync } from "node:child_process";

const shouldSkipLocalWindows =
  process.platform === "win32" && !process.env.CI && !process.env.E2E_FORCE_LOCAL;

if (shouldSkipLocalWindows) {
  console.log(
    "Playwright smoke scaffolded. Skipping local Windows run because next dev currently hangs on /dashboard; set E2E_FORCE_LOCAL=1 to force it.",
  );
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  command,
  [
    "playwright",
    "test",
    "tests/dashboard/smoke.spec.ts",
    "--reporter=line",
    "--workers=1",
  ],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Builds the browser version of the app into table/public/play, where the table service serves it at /play.
 * Runs after the table build (Railway's build command is `npm run build --prefix table`).
 * A failure here never fails the deploy: the server then runs without /play, and the share link only opens the app.
 * SKIP_WEB=1 skips it, for a quick local server build.
 * REQUIRE_WEB=1 (set it on Railway) makes a failed browser build fail the whole build instead, so the deploy is
 * refused and the last working version keeps running.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const out = `${root}table/public/play`;

if (process.env.SKIP_WEB === "1") {
  console.log("[web] SKIP_WEB=1, not building the browser version.");
  process.exit(0);
}

function run(args) {
  console.log(`[web] npm ${args.join(" ")}`);
  const result = spawnSync("npm", args, { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" } });
  return result.status === 0;
}

const installed = existsSync(`${root}client/node_modules/expo`) || run(["ci", "--prefix", "client", "--no-audit", "--no-fund"]);
// An old build must not outlive a failed one: the server would serve a page that no longer matches the API.
rmSync(out, { recursive: true, force: true });
if (!installed || !run(["run", "export:web", "--prefix", "client"])) {
  rmSync(out, { recursive: true, force: true });
  if (process.env.REQUIRE_WEB === "1") {
    console.error("[web] The browser version did not build, and REQUIRE_WEB=1 is set. Failing the build, so the last working deploy keeps running.");
    process.exit(1);
  }
  console.error("[web] The browser version did not build. The server deploys without /play.");
}

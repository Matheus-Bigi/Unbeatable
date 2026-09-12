// Automated smoke test: drives the full app (camera check -> countdown ->
// prediction/commitment -> round result -> Best-of-3 match -> Play Again)
// using Playwright's fake camera device and a stubbed hand-tracking module,
// since this environment has no real camera/network access to the CDN model.
// Run: node tests/smoke.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8765;

function startServer() {
  return new Promise((resolve, reject) => {
    const server = spawn("npx", ["http-server", projectRoot, "-p", String(PORT), "-c-1", "-s"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onData = (data) => {
      if (data.toString().includes("Available on")) {
        server.stdout.off("data", onData);
        resolve(server);
      }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", (d) => process.stderr.write(d));
    server.on("error", reject);
    setTimeout(() => resolve(server), 4000); // fallback if banner text ever changes
  });
}

async function main() {
  const server = await startServer();
  const errors = [];
  let browser;
  try {
    browser = await chromium.launch({
      args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    });
    const context = await browser.newContext({ permissions: ["camera"] });
    await context.grantPermissions(["camera"]);
    const page = await context.newPage();

    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await page.route("**/vision_bundle.mjs", (route) =>
      route.fulfill({
        path: path.join(projectRoot, "tests", "stub-vision-bundle.mjs"),
        contentType: "text/javascript",
      })
    );

    await page.goto(`http://localhost:${PORT}/index.html`);

    await page.click("#btn-quick-play");
    await page.fill("#input-name", "TESTER");
    await page.click("#btn-name-continue");

    await page.waitForSelector("#btn-camera-ready:not([disabled])", { timeout: 15000 });
    console.log("[ok] camera check ready (tracker initialized, stream live)");

    await page.click("#btn-camera-ready");
    await page.waitForSelector("#screen-play.active", { timeout: 5000 });
    console.log("[ok] entered play screen");

    await page.waitForSelector("#btn-start-match:not(.hidden)", { timeout: 5000 });
    await page.click("#btn-start-match");
    console.log("[ok] started first match");

    // Play through a full Best-of-3 match (Play Again once) to exercise the loop.
    for (let match = 0; match < 2; match++) {
      let rounds = 0;
      while (rounds < 12) {
        const matchVisible = await page.locator("#screen-match.active").count();
        if (matchVisible) break;

        await page.waitForSelector(".round-banner:not(:empty)", { timeout: 8000 });
        const banner = await page.textContent("#round-banner");
        console.log(`[round] ${banner}`);
        rounds++;

        const nextVisible = await page.locator("#btn-next-round:not(.hidden)").count();
        if (nextVisible) {
          await page.click("#btn-next-round");
        } else {
          await page.waitForSelector("#screen-match.active", { timeout: 4000 }).catch(() => {});
        }
      }

      await page.waitForSelector("#screen-match.active", { timeout: 8000 });
      const title = await page.textContent("#match-title");
      const score = await page.textContent("#match-score");
      console.log(`[ok] match ${match + 1} finished: ${title} ${score}`);

      if (match === 0) {
        await page.click("#btn-play-again");
        await page.waitForSelector("#screen-play.active", { timeout: 4000 });
        console.log("[ok] Play Again returned to play screen immediately");
      }
    }

    if (errors.length) {
      console.error("FAIL - runtime errors detected:\n" + errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("PASS - full pipeline ran with no runtime errors");
    }
  } catch (err) {
    console.error("FAIL -", err.message);
    if (errors.length) console.error("Collected errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  } finally {
    await browser?.close();
    server.kill();
  }
}

main();

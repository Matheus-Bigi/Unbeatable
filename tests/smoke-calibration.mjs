// Automated smoke test for gesture calibration: drives the camera-check
// screen's new "show ROCK, then PAPER, then SCISSORS" step to completion
// (not just the skip escape hatch) using the stubbed hand-tracking module's
// synthetic pose cycle, then confirms it auto-advances into play.
// Run: node tests/smoke-calibration.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8769;

function startServer() {
  return new Promise((resolve) => {
    const server = spawn("npx", ["http-server", projectRoot, "-p", String(PORT), "-c-1", "-s"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
    setTimeout(() => resolve(server), 1500);
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
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("ERR_CONNECTION_RESET") || text.includes("fonts.g")) return;
      errors.push(`console.error: ${text}`);
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
    await page.click("#btn-camera-ready");
    await page.waitForSelector("#calibration-panel:not(.hidden)", { timeout: 5000 });
    console.log("[ok] entered gesture calibration");

    // The stub's synthetic pose cycles through paper -> rock -> scissors
    // over ~8.5s; each calibration rep needs to catch its target gesture's
    // held phase, so give generous timeouts covering a few full cycles.
    await page.waitForSelector("#calib-rock.ok", { timeout: 30000 });
    console.log("[ok] ROCK confirmed");
    await page.waitForSelector("#calib-paper.ok", { timeout: 30000 });
    console.log("[ok] PAPER confirmed");
    // SCISSORS is the last rep -- the app auto-advances into play the same
    // tick it's confirmed, so the checkmark never sits visible on screen
    // long enough for a visibility-based selector to catch it. Waiting on
    // the screen transition itself is the reliable signal that it passed.
    await page.waitForSelector("#screen-play.active", { timeout: 30000 });
    console.log("[ok] SCISSORS confirmed, auto-advanced into play");

    if (errors.length) {
      console.error("FAIL - runtime errors detected:\n" + errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("PASS - gesture calibration ran to completion with no runtime errors");
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

// Automated smoke test for Pass & Play: 2 players, each plays a full
// Best-of-3, then verifies the session-results table populates and
// "PLAY AGAIN" cycles back to player 1 without re-adding players.
// Run: node tests/smoke-passplay.mjs

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8768;

function startServer() {
  return new Promise((resolve) => {
    const server = spawn("npx", ["http-server", projectRoot, "-p", String(PORT), "-c-1", "-s"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
    setTimeout(() => resolve(server), 1500);
  });
}

async function playOneMatch(page) {
  let rounds = 0;
  while (rounds < 12) {
    const matchVisible = await page.locator("#screen-match.active").count();
    if (matchVisible) break;
    await page.waitForSelector(".round-banner .round-verdict:not(:empty)", { timeout: 8000 });
    rounds++;
    const nextVisible = await page.locator("#btn-next-round:not(.hidden)").count();
    if (nextVisible) {
      await page.click("#btn-next-round");
    } else {
      await page.waitForSelector("#screen-match.active", { timeout: 4000 }).catch(() => {});
    }
  }
  await page.waitForSelector("#screen-match.active", { timeout: 8000 });
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

    await page.click("#btn-pass-play");
    await page.fill('.passplay-input[data-slot="0"]', "ALEX");
    await page.fill('.passplay-input[data-slot="1"]', "SAM");
    await page.click("#btn-passplay-start");

    await page.waitForSelector("#btn-camera-ready:not([disabled])", { timeout: 15000 });
    await page.click("#btn-camera-ready");

    await page.waitForSelector("#calibration-panel:not(.hidden)", { timeout: 5000 });
    await page.click("#btn-calibration-skip");

    await page.waitForSelector("#screen-passplay-pass.active", { timeout: 5000 });
    const firstName = await page.textContent("#passplay-pass-name");
    if (firstName !== "ALEX") throw new Error(`expected pass-screen for ALEX first, got ${firstName}`);
    console.log("[ok] pass-device screen shows ALEX first");

    await page.click("#btn-passplay-ready");
    await page.waitForSelector("#screen-play.active", { timeout: 5000 });
    console.log("[ok] ALEX entered play (auto-started, no extra start button)");

    await playOneMatch(page);
    console.log("[ok] ALEX's match finished");

    const nextLabel1 = await page.textContent("#btn-passplay-next");
    if (!nextLabel1.includes("PASS TO NEXT PLAYER")) throw new Error(`expected 'pass to next player', got ${nextLabel1}`);
    await page.click("#btn-passplay-next");

    await page.waitForSelector("#screen-passplay-pass.active", { timeout: 5000 });
    const secondName = await page.textContent("#passplay-pass-name");
    if (secondName !== "SAM") throw new Error(`expected pass-screen for SAM second, got ${secondName}`);
    console.log("[ok] pass-device screen shows SAM second");

    await page.click("#btn-passplay-ready");
    await page.waitForSelector("#screen-play.active", { timeout: 5000 });
    await playOneMatch(page);
    console.log("[ok] SAM's match finished");

    const nextLabel2 = await page.textContent("#btn-passplay-next");
    if (!nextLabel2.includes("SEE RESULTS")) throw new Error(`expected 'see results' as last player, got ${nextLabel2}`);
    await page.click("#btn-passplay-next");

    await page.waitForSelector("#screen-passplay-results.active", { timeout: 5000 });
    const rows = await page.locator("#passplay-results-body tr").count();
    if (rows !== 2) throw new Error(`expected 2 result rows, got ${rows}`);
    const rowsText = await page.locator("#passplay-results-body").innerText();
    if (!rowsText.includes("ALEX") || !rowsText.includes("SAM")) throw new Error(`results missing a player name: ${rowsText}`);
    console.log("[ok] session results show both players:\n" + rowsText);

    // PLAY AGAIN should go straight back to player 1's pass screen, no re-adding players.
    await page.click("#btn-passplay-again");
    await page.waitForSelector("#screen-passplay-pass.active", { timeout: 5000 });
    const replayName = await page.textContent("#passplay-pass-name");
    if (replayName !== "ALEX") throw new Error(`expected PLAY AGAIN to restart at ALEX, got ${replayName}`);
    console.log("[ok] Play Again restarts at player 1 without re-adding players");

    if (errors.length) {
      console.error("FAIL - runtime errors detected:\n" + errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("PASS - pass & play flow ran with no runtime errors");
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

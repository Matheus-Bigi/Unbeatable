import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto("http://localhost:8767/index.html");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/shot-home.png" });

  // Force-populate the play screen and match screen with sample content,
  // bypassing camera/game logic entirely, just to see the visual design.
  await page.evaluate(() => {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById("screen-play").classList.add("active");
    document.getElementById("hud-score").textContent = "1 — 1";
    document.getElementById("hud-round").textContent = "Round 3";
    document.getElementById("countdown").textContent = "2";
    document.getElementById("machine-hand").innerHTML = '<img class="hand-photo" src="assets/hands/neutral.webp" alt="" />';
    document.getElementById("player-hand").innerHTML = '<img class="hand-photo" src="assets/hands/neutral.webp" alt="" />';
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/shot-play.png" });

  await page.evaluate(() => {
    const el = document.getElementById("round-banner");
    el.classList.add("lose");
    el.querySelector(".round-verdict").textContent = "MACHINE WINS";
    el.querySelector(".round-line").textContent = "“Too slow.”";
    el.querySelector(".round-reaction").textContent = "0.142s";
    document.getElementById("machine-hand").innerHTML = '<img class="hand-photo" src="assets/hands/paper.webp" alt="" />';
    document.getElementById("player-hand").innerHTML = '<img class="hand-photo" src="assets/hands/rock.webp" alt="" />';
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/shot-play-result.png" });

  await page.evaluate(() => {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById("screen-match").classList.add("active");
    document.getElementById("match-title").textContent = "YOU WIN";
    document.getElementById("match-title").classList.add("win");
    document.getElementById("match-score").textContent = "2 — 1";
    document.getElementById("stat-fastest").textContent = "0.089s";
    document.getElementById("stat-average").textContent = "0.203s";
    document.getElementById("stat-streak").textContent = "3";
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/shot-match.png" });

  await page.evaluate(() => {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    document.getElementById("screen-camera").classList.add("active");
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "/tmp/shot-camera.png" });

  await browser.close();
  console.log("done");
}

main();

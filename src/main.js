import { startCamera, stopCamera, averageBrightness } from "./camera.js?v=10";
import { HandTracker } from "./handTracker.js?v=10";
import { classifyFrame } from "./gestureClassifier.js?v=10";
import { GameEngine, RoundState } from "./gameEngine.js?v=10";
import { DEFAULT_DIFFICULTY } from "./difficultyConfig.js?v=10";
import { MACHINE_LINES, pickLine } from "./machineAI.js?v=10";
import * as storage from "./storage.js?v=10";
import { showScreen, handImageSrc, updateProbBars, setHandImage, renderRoundBanner, drawSkeleton, syncCanvasSize } from "./ui.js?v=10";
import { primeAudio, countdownBeep, resultBeep } from "./sound.js?v=10";

const el = (id) => document.getElementById(id);

const homeBtn = el("btn-quick-play");
const passPlayBtn = el("btn-pass-play");
const leaderboardBtn = el("btn-leaderboard");
const nameInput = el("input-name");
const nameContinueBtn = el("btn-name-continue");
const passplayStartBtn = el("btn-passplay-start");
const passplayInputs = document.querySelectorAll(".passplay-input");
const cameraBackBtn = el("btn-camera-back");
const passplayPassNameEl = el("passplay-pass-name");
const passplayReadyBtn = el("btn-passplay-ready");
const passplayNextBtn = el("btn-passplay-next");
const passplayAgainBtn = el("btn-passplay-again");
const passplayResultsBody = el("passplay-results-body");
const leaderboardBody = el("leaderboard-body");
const leaderboardEmpty = el("leaderboard-empty");
const cameraVideo = el("video");
const cameraOverlay = el("overlay");
const cameraStatus = el("camera-status");
const cameraChecklist = el("camera-checklist");
const checkHand = el("check-hand");
const checkDistance = el("check-distance");
const checkLight = el("check-light");
const readyBtn = el("btn-camera-ready");
const calibrationPanel = el("calibration-panel");
const calibrationEmoji = el("calibration-emoji");
const calibrationLabel = el("calibration-label");
const calibSkipBtn = el("btn-calibration-skip");
const calibItems = { rock: el("calib-rock"), paper: el("calib-paper"), scissors: el("calib-scissors") };
const playVideo = el("video-play");
const playOverlay = el("overlay-play");
const hudScore = el("hud-score");
const hudRound = el("hud-round");
const countdownEl = el("countdown");
const machineHandEl = el("machine-hand");
const playerHandEl = el("player-hand");
const playerDuelLabel = el("player-duel-label");
const roundBannerEl = el("round-banner");
const nextRoundBtn = el("btn-next-round");
const startMatchBtn = el("btn-start-match");
const stuckHelpEl = el("stuck-help");
const stuckRetryBtn = el("btn-stuck-retry");
const playAgainBtn = el("btn-play-again");
const matchTitle = el("match-title");
const matchScore = el("match-score");
const statFastest = el("stat-fastest");
const statAverage = el("stat-average");
const statStreak = el("stat-streak");

const bars = { rock: el("bar-rock"), paper: el("bar-paper"), scissors: el("bar-scissors") };
const brightnessCanvas = document.createElement("canvas");

// The live probability bars and the play-screen hand-skeleton overlay are
// tuning aids, not part of the player-facing experience -- only show them
// when explicitly asked for (e.g. testing on a real device with ?debug).
const DEBUG = new URLSearchParams(location.search).has("debug");
if (!DEBUG) el("prob-bars").classList.add("hidden");

const tracker = new HandTracker();
let cameraStream = null;
let playerName = "";
let checkLoopRunning = false;
let handDetectedRecently = 0;
let checkPhase = "environment"; // "environment" | "calibration"
let calibIndex = 0;
let calibStreak = 0;
let gameEngine = null;
let roundsPlayedInMatch = 0;
let stuckWatchdog = null;
let mode = "quick"; // "quick" | "passplay"
let passPlay = null; // { players: [{name, matchWins, fastestMs}], currentIndex }

// A round should always resolve within ~4.4s (READY + 3-2-1 + delivery
// window). If it hasn't by well past that, something went wrong on this
// device -- surface it instead of leaving the player staring at a frozen
// screen with no way out.
const STUCK_TIMEOUT_MS = 9000;

function armStuckWatchdog() {
  clearTimeout(stuckWatchdog);
  stuckWatchdog = setTimeout(() => stuckHelpEl.classList.remove("hidden"), STUCK_TIMEOUT_MS);
}

function disarmStuckWatchdog() {
  clearTimeout(stuckWatchdog);
}

stuckRetryBtn.addEventListener("click", () => {
  stuckHelpEl.classList.add("hidden");
  gameEngine.startRound();
});

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.back;
    if (target === "screen-home") {
      gameEngine?.cancel();
      stopCameraCheckLoop();
      disarmStuckWatchdog();
      mode = "quick";
      passPlay = null;
    }
    showScreen(target);
  });
});

homeBtn.addEventListener("click", () => {
  primeAudio();
  mode = "quick";
  cameraBackBtn.dataset.back = "screen-name";
  showScreen("screen-name");
});

passPlayBtn.addEventListener("click", () => {
  primeAudio();
  mode = "passplay";
  showScreen("screen-passplay-setup");
});

leaderboardBtn.addEventListener("click", () => {
  renderLeaderboard();
  showScreen("screen-leaderboard");
});

nameContinueBtn.addEventListener("click", async () => {
  const value = nameInput.value.trim();
  if (!value) return;
  playerName = value.toUpperCase();
  showScreen("screen-camera");
  await enterCameraCheck();
});

passplayStartBtn.addEventListener("click", async () => {
  const names = [...passplayInputs].map((input) => input.value.trim()).filter(Boolean);
  if (names.length === 0) return;
  passPlay = {
    players: names.map((name) => ({ name: name.toUpperCase(), matchWins: 0, fastestMs: null })),
    currentIndex: 0,
  };
  cameraBackBtn.dataset.back = "screen-passplay-setup";
  showScreen("screen-camera");
  await enterCameraCheck();
});

readyBtn.addEventListener("click", () => {
  if (checkPhase === "environment") {
    enterCalibrationPhase();
  } else {
    stopCameraCheckLoop();
    proceedAfterCameraCheck();
  }
});

calibSkipBtn.addEventListener("click", () => {
  // Calibration is a confidence check, not a gate -- someone whose gestures
  // keep misreading here shouldn't be locked out of playing entirely.
  stopCameraCheckLoop();
  proceedAfterCameraCheck();
});

passplayReadyBtn.addEventListener("click", () => {
  playerName = passPlay.players[passPlay.currentIndex].name;
  enterPlay({ autoStart: true }).catch((err) => console.warn("[UNBEATABLE] enterPlay failed:", err));
});

passplayNextBtn.addEventListener("click", () => {
  passPlay.currentIndex++;
  if (passPlay.currentIndex >= passPlay.players.length) {
    showPassPlayResults();
  } else {
    showPassPlayPassScreen();
  }
});

passplayAgainBtn.addEventListener("click", () => {
  passPlay.players.forEach((p) => {
    p.matchWins = 0;
    p.fastestMs = null;
  });
  passPlay.currentIndex = 0;
  showPassPlayPassScreen();
});

nextRoundBtn.addEventListener("click", () => {
  nextRoundBtn.classList.add("hidden");
  gameEngine.startRound();
  roundsPlayedInMatch++;
  hudRound.textContent = `Round ${roundsPlayedInMatch + 1}`;
});

playAgainBtn.addEventListener("click", () => {
  showScreen("screen-play");
  roundsPlayedInMatch = 0;
  hudRound.textContent = "Round 1";
  hudScore.textContent = "0 — 0";
  gameEngine.startMatch();
});

function proceedAfterCameraCheck() {
  if (mode === "passplay") {
    showPassPlayPassScreen();
  } else {
    enterPlay().catch((err) => console.warn("[UNBEATABLE] enterPlay failed:", err));
  }
}

function showPassPlayPassScreen() {
  passplayPassNameEl.textContent = passPlay.players[passPlay.currentIndex].name;
  showScreen("screen-passplay-pass");
}

function showPassPlayResults() {
  const sorted = [...passPlay.players].sort(
    (a, b) => b.matchWins - a.matchWins || (a.fastestMs ?? Infinity) - (b.fastestMs ?? Infinity)
  );
  renderRankedTable(passplayResultsBody, sorted.map((p, i) => [
    String(i + 1),
    p.name,
    String(p.matchWins),
    p.fastestMs !== null ? `${(p.fastestMs / 1000).toFixed(3)}s` : "-",
  ]));
  showScreen("screen-passplay-results");
}

function renderLeaderboard() {
  const players = storage.listAllPlayers();
  if (players.length === 0) {
    leaderboardBody.innerHTML = "";
    leaderboardEmpty.classList.remove("hidden");
    return;
  }
  leaderboardEmpty.classList.add("hidden");
  const sorted = players
    .map(({ name, stats }) => ({ name, wins: stats.roundWins, fastest: stats.fastestMs, streak: stats.bestStreak }))
    .sort((a, b) => b.wins - a.wins || (a.fastest ?? Infinity) - (b.fastest ?? Infinity));
  renderRankedTable(leaderboardBody, sorted.map((p, i) => [
    String(i + 1),
    p.name,
    String(p.wins),
    p.fastest !== null ? `${(p.fastest / 1000).toFixed(3)}s` : "-",
    String(p.streak),
  ]));
}

// Builds table rows from plain-text cell values via textContent (never
// innerHTML) -- player names are free-typed user input, so they must never
// be interpreted as markup.
function renderRankedTable(tbody, rows) {
  tbody.innerHTML = "";
  for (const cells of rows) {
    const row = document.createElement("tr");
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
}

async function ensureTracker() {
  if (tracker.landmarker) return;
  cameraStatus.textContent = "Loading vision model…";
  await tracker.init();
}

async function enterCameraCheck() {
  cameraStatus.textContent = "Requesting camera…";
  readyBtn.disabled = true;
  try {
    stopCamera(cameraStream);
    cameraStream = await startCamera(cameraVideo);
    await ensureTracker();
    cameraStatus.textContent = "Show your hand in the frame.";
    readyBtn.disabled = false;
    startCameraCheckLoop();
  } catch (err) {
    cameraStatus.textContent = "Camera unavailable — check permissions in Settings.";
  }
}

const AUTO_ADVANCE_HOLD_MS = 1200;
const CALIBRATION_ORDER = ["rock", "paper", "scissors"];
const CALIBRATION_LABELS = { rock: "ROCK", paper: "PAPER", scissors: "SCISSORS" };
// Consecutive matching-label frames required before a calibration rep counts
// -- long enough to rule out a lucky single-frame flicker, short enough that
// deliberately holding the pose for under a second confirms it.
const CALIBRATION_HOLD_FRAMES = 10;

function enterCalibrationPhase() {
  checkPhase = "calibration";
  calibIndex = 0;
  calibStreak = 0;
  Object.values(calibItems).forEach((li) => li.classList.remove("ok"));
  cameraChecklist.classList.add("hidden");
  readyBtn.classList.add("hidden");
  calibrationPanel.classList.remove("hidden");
  cameraStatus.textContent = "Let's confirm your gestures.";
  updateCalibrationPrompt();
}

function updateCalibrationPrompt() {
  const target = CALIBRATION_ORDER[calibIndex];
  calibrationEmoji.src = handImageSrc(target);
  calibrationLabel.textContent = CALIBRATION_LABELS[target];
}

function startCameraCheckLoop() {
  checkLoopRunning = true;
  handDetectedRecently = 0;
  checkPhase = "environment";
  calibIndex = 0;
  calibStreak = 0;
  cameraChecklist.classList.remove("hidden");
  readyBtn.classList.remove("hidden");
  calibrationPanel.classList.add("hidden");
  Object.values(calibItems).forEach((li) => li.classList.remove("ok"));
  let lastBrightnessCheck = 0;
  let lightOk = false;
  let perfectSinceMs = null;

  const loop = () => {
    if (!checkLoopRunning) return;
    const now = performance.now();
    syncCanvasSize(cameraOverlay, cameraVideo);
    const detection = tracker.detect(cameraVideo, now);

    if (detection) {
      handDetectedRecently = now;
      drawSkeleton(cameraOverlay, detection.landmarks);
    } else {
      drawSkeleton(cameraOverlay, null);
    }

    if (checkPhase === "calibration") {
      if (detection) {
        const { label } = classifyFrame(detection.landmarks);
        const target = CALIBRATION_ORDER[calibIndex];
        calibStreak = label === target ? calibStreak + 1 : 0;
        if (calibStreak >= CALIBRATION_HOLD_FRAMES) {
          calibItems[target].classList.add("ok");
          calibIndex++;
          calibStreak = 0;
          if (calibIndex >= CALIBRATION_ORDER.length) {
            stopCameraCheckLoop();
            proceedAfterCameraCheck();
            return;
          }
          updateCalibrationPrompt();
        }
      }
      requestAnimationFrame(loop);
      return;
    }

    if (detection) {
      const xs = detection.landmarks.map((p) => p.x);
      const ys = detection.landmarks.map((p) => p.y);
      const bboxW = Math.max(...xs) - Math.min(...xs);
      checkHand.classList.add("ok");
      if (bboxW < 0.18) {
        checkDistance.textContent = "Move closer.";
        checkDistance.classList.remove("ok");
      } else if (bboxW > 0.65) {
        checkDistance.textContent = "Move back.";
        checkDistance.classList.remove("ok");
      } else {
        checkDistance.textContent = "Distance OK";
        checkDistance.classList.add("ok");
      }
    } else {
      if (now - handDetectedRecently > 800) checkHand.classList.remove("ok");
    }

    if (now - lastBrightnessCheck > 400) {
      lastBrightnessCheck = now;
      const brightness = averageBrightness(cameraVideo, brightnessCanvas);
      lightOk = brightness >= 65;
      checkLight.textContent = lightOk ? "Lighting looks good." : "A little more light.";
      checkLight.classList.toggle("ok", lightOk);
    }

    const allGood = checkHand.classList.contains("ok") && checkDistance.classList.contains("ok") && lightOk;
    if (allGood) {
      perfectSinceMs ??= now;
      const heldMs = now - perfectSinceMs;
      cameraStatus.textContent = heldMs > 300 ? `Perfect. Continuing in ${Math.ceil((AUTO_ADVANCE_HOLD_MS - heldMs) / 1000)}…` : "Perfect.";
      if (heldMs >= AUTO_ADVANCE_HOLD_MS) {
        // Auto-continue into gesture calibration once conditions hold steady
        // -- so the player never has to break their pose to tap READY with
        // their other hand. Manually tapping READY at any time also advances.
        enterCalibrationPhase();
        requestAnimationFrame(loop);
        return;
      }
    } else {
      perfectSinceMs = null;
      cameraStatus.textContent = "Show your hand in the frame.";
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function stopCameraCheckLoop() {
  checkLoopRunning = false;
}

async function waitUntilReady(videoEl) {
  if (videoEl.readyState >= 2) return;
  await new Promise((resolve) => {
    const onReady = () => {
      videoEl.removeEventListener("loadeddata", onReady);
      resolve();
    };
    videoEl.addEventListener("loadeddata", onReady);
  });
}

async function enterPlay({ autoStart = false } = {}) {
  playVideo.srcObject = cameraStream;
  await playVideo.play();
  await waitUntilReady(playVideo);
  showScreen("screen-play");
  playerDuelLabel.textContent = playerName;
  roundsPlayedInMatch = 0;
  hudRound.textContent = "Round 1";
  hudScore.textContent = "0 — 0";

  gameEngine = new GameEngine({
    tracker,
    videoEl: playVideo,
    config: DEFAULT_DIFFICULTY,
    callbacks: {
      onRoundReset() {
        renderRoundBanner(roundBannerEl);
        machineHandEl.classList.remove("thinking");
        setHandImage(machineHandEl, null);
        setHandImage(playerHandEl, null);
        countdownEl.textContent = "";
        updateProbBars(bars, { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 });
        nextRoundBtn.classList.add("hidden");
        stuckHelpEl.classList.add("hidden");
        armStuckWatchdog();
      },
      onCountdown(label) {
        countdownEl.textContent = label;
        countdownBeep(label);
        if (label === "GO") setTimeout(() => (countdownEl.textContent = ""), 500);
      },
      onProb(ema) {
        updateProbBars(bars, ema);
      },
      onFrame(detection) {
        if (DEBUG) drawSkeleton(playOverlay, detection ? detection.landmarks : null);
      },
      onMachineDeciding() {
        machineHandEl.classList.add("thinking");
      },
      onMachineReveal({ move }) {
        machineHandEl.classList.remove("thinking");
        setHandImage(machineHandEl, move, { reveal: true });
      },
      onRoundResult({ outcome, playerMove, machineMove, reactionMs, tooEarly, late, lateChange, score, matchOver }) {
        disarmStuckWatchdog();
        resultBeep(outcome);
        setHandImage(playerHandEl, playerMove, { reveal: true });
        hudScore.textContent = `${score.player} — ${score.machine}`;
        storage.recordRound(playerName, { outcome, reactionMs });
        if (!matchOver) nextRoundBtn.classList.remove("hidden");

        let verdict;
        let kind;
        let line;
        if (outcome === "player") {
          verdict = "YOU WIN";
          kind = "win";
          line = pickLine(MACHINE_LINES.playerWin);
        } else if (outcome === "machine") {
          verdict = "MACHINE WINS";
          kind = "lose";
          line = lateChange ? pickLine(MACHINE_LINES.lateChange) : pickLine(MACHINE_LINES.machineWin);
        } else {
          verdict = "DRAW";
          kind = null;
          line = pickLine(MACHINE_LINES.draw);
        }
        renderRoundBanner(roundBannerEl, { verdict, line, reactionMs, kind, tooEarly, late });
      },
      onMatchResult(result) {
        storage.recordMatch(playerName);
        if (mode === "passplay") {
          const p = passPlay.players[passPlay.currentIndex];
          if (result.winner === "player") p.matchWins++;
          const fastest = Math.min(...result.reactions);
          p.fastestMs = p.fastestMs === null ? fastest : Math.min(p.fastestMs, fastest);
        }
        setTimeout(() => showMatchScreen(result), 1600);
      },
    },
  });

  runPlayOverlayLoop();

  if (autoStart) {
    gameEngine.startMatch();
  } else {
    // Give the player as long as they need to get positioned before the
    // very first round of a match -- everything up to here has been
    // automatic (camera check -> READY -> straight into play), so don't
    // also auto-start the countdown; wait for a deliberate tap.
    startMatchBtn.classList.remove("hidden");
    startMatchBtn.onclick = () => {
      startMatchBtn.classList.add("hidden");
      gameEngine.startMatch();
    };
  }
}

function runPlayOverlayLoop() {
  const loop = () => {
    if (playVideo.readyState >= 2) {
      syncCanvasSize(playOverlay, playVideo);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function showMatchScreen(result) {
  if (!result) return;
  const stats = storage.loadStats(playerName);
  const fastest = stats.fastestMs;
  const avg = storage.averageReactionMs(stats);

  matchTitle.textContent = result.winner === "player" ? "YOU WIN" : "MACHINE WINS";
  matchTitle.classList.toggle("win", result.winner === "player");
  matchTitle.classList.toggle("lose", result.winner === "machine");
  matchScore.textContent = `${result.score.player} — ${result.score.machine}`;
  statFastest.textContent = fastest !== null ? `${(fastest / 1000).toFixed(3)}s` : "-";
  statAverage.textContent = avg !== null ? `${(avg / 1000).toFixed(3)}s` : "-";
  statStreak.textContent = stats.bestStreak;

  const isPassPlay = mode === "passplay";
  playAgainBtn.classList.toggle("hidden", isPassPlay);
  passplayNextBtn.classList.toggle("hidden", !isPassPlay);
  if (isPassPlay) {
    const isLast = passPlay.currentIndex >= passPlay.players.length - 1;
    passplayNextBtn.textContent = isLast ? "SEE RESULTS" : "PASS TO NEXT PLAYER";
  }

  showScreen("screen-match");
}

window.addEventListener("beforeunload", () => {
  stopCamera(cameraStream);
});

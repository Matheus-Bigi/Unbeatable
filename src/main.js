import { startCamera, stopCamera, averageBrightness } from "./camera.js?v=2";
import { HandTracker } from "./handTracker.js?v=2";
import { GameEngine, RoundState } from "./gameEngine.js?v=2";
import { DEFAULT_DIFFICULTY } from "./difficultyConfig.js?v=2";
import { MACHINE_LINES, pickLine } from "./machineAI.js?v=2";
import * as storage from "./storage.js?v=2";
import { showScreen, moveEmoji, updateProbBars, setMachineHand, setRoundBanner, drawSkeleton, syncCanvasSize } from "./ui.js?v=2";

const el = (id) => document.getElementById(id);

const homeBtn = el("btn-quick-play");
const nameInput = el("input-name");
const nameContinueBtn = el("btn-name-continue");
const cameraVideo = el("video");
const cameraOverlay = el("overlay");
const cameraStatus = el("camera-status");
const checkHand = el("check-hand");
const checkDistance = el("check-distance");
const checkLight = el("check-light");
const readyBtn = el("btn-camera-ready");
const playVideo = el("video-play");
const playOverlay = el("overlay-play");
const hudScore = el("hud-score");
const hudRound = el("hud-round");
const countdownEl = el("countdown");
const machineHandEl = el("machine-hand");
const playerHandEl = el("player-hand");
const roundBannerEl = el("round-banner");
const nextRoundBtn = el("btn-next-round");
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
let gameEngine = null;
let pendingMatchResult = null;
let roundsPlayedInMatch = 0;
let stuckWatchdog = null;

// A round should always resolve within ~5.2s (READY + 3-2-1 + delivery
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
    }
    showScreen(target);
  });
});

homeBtn.addEventListener("click", () => showScreen("screen-name"));

nameContinueBtn.addEventListener("click", async () => {
  const value = nameInput.value.trim();
  if (!value) return;
  playerName = value.toUpperCase();
  showScreen("screen-camera");
  await enterCameraCheck();
});

readyBtn.addEventListener("click", () => {
  stopCameraCheckLoop();
  enterPlay().catch((err) => console.warn("[UNBEATABLE] enterPlay failed:", err));
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

async function ensureTracker() {
  if (tracker.landmarker) return;
  cameraStatus.textContent = "Loading vision model…";
  await tracker.init();
}

async function enterCameraCheck() {
  cameraStatus.textContent = "Requesting camera…";
  readyBtn.disabled = true;
  try {
    cameraStream = await startCamera(cameraVideo);
    await ensureTracker();
    cameraStatus.textContent = "Show your hand in the frame.";
    readyBtn.disabled = false;
    startCameraCheckLoop();
  } catch (err) {
    cameraStatus.textContent = "Camera unavailable — check permissions in Settings.";
  }
}

function startCameraCheckLoop() {
  checkLoopRunning = true;
  handDetectedRecently = 0;
  let lastBrightnessCheck = 0;
  let lightOk = false;

  const loop = () => {
    if (!checkLoopRunning) return;
    const now = performance.now();
    syncCanvasSize(cameraOverlay, cameraVideo);
    const detection = tracker.detect(cameraVideo, now);

    if (detection) {
      handDetectedRecently = now;
      drawSkeleton(cameraOverlay, detection.landmarks);
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
      drawSkeleton(cameraOverlay, null);
      if (now - handDetectedRecently > 800) checkHand.classList.remove("ok");
    }

    if (now - lastBrightnessCheck > 400) {
      lastBrightnessCheck = now;
      const brightness = averageBrightness(cameraVideo, brightnessCanvas);
      lightOk = brightness >= 65;
      checkLight.textContent = lightOk ? "Lighting looks good." : "A little more light.";
      checkLight.classList.toggle("ok", lightOk);
    }

    if (checkHand.classList.contains("ok") && checkDistance.classList.contains("ok") && lightOk) {
      cameraStatus.textContent = "Perfect.";
    } else {
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

async function enterPlay() {
  playVideo.srcObject = cameraStream;
  await playVideo.play();
  await waitUntilReady(playVideo);
  showScreen("screen-play");
  roundsPlayedInMatch = 0;
  hudRound.textContent = "Round 1";
  hudScore.textContent = "0 — 0";

  gameEngine = new GameEngine({
    tracker,
    videoEl: playVideo,
    config: DEFAULT_DIFFICULTY,
    callbacks: {
      onRoundReset() {
        setRoundBanner(roundBannerEl, "", null);
        setMachineHand(machineHandEl, "🤖");
        playerHandEl.textContent = "🖐️";
        countdownEl.textContent = "";
        updateProbBars(bars, { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 });
        nextRoundBtn.classList.add("hidden");
        stuckHelpEl.classList.add("hidden");
        armStuckWatchdog();
      },
      onCountdown(label) {
        countdownEl.textContent = label;
        if (label === "GO") setTimeout(() => (countdownEl.textContent = ""), 500);
      },
      onProb(ema) {
        updateProbBars(bars, ema);
      },
      onFrame(detection) {
        if (DEBUG) drawSkeleton(playOverlay, detection ? detection.landmarks : null);
      },
      onMachineCommit({ move }) {
        setMachineHand(machineHandEl, moveEmoji(move), { reveal: true });
      },
      onRoundResult({ outcome, playerMove, machineMove, reactionMs, lateChange, score, matchOver }) {
        disarmStuckWatchdog();
        playerHandEl.textContent = playerMove ? moveEmoji(playerMove) : "❓";
        hudScore.textContent = `${score.player} — ${score.machine}`;
        storage.recordRound(playerName, { outcome, reactionMs });
        if (!matchOver) nextRoundBtn.classList.remove("hidden");

        let text;
        let kind;
        let line;
        if (outcome === "player") {
          text = "YOU WIN";
          kind = "win";
          line = pickLine(MACHINE_LINES.playerWin);
        } else if (outcome === "machine") {
          text = "MACHINE WINS";
          kind = "lose";
          line = lateChange ? pickLine(MACHINE_LINES.lateChange) : pickLine(MACHINE_LINES.machineWin);
        } else {
          text = "DRAW";
          kind = null;
          line = pickLine(MACHINE_LINES.draw);
        }
        setRoundBanner(roundBannerEl, `${text} — "${line}" (${(reactionMs / 1000).toFixed(3)}s)`, kind);
      },
      onMatchResult(result) {
        pendingMatchResult = result;
        storage.recordMatch(playerName);
        setTimeout(() => showMatchScreen(pendingMatchResult), 1600);
      },
    },
  });

  runPlayOverlayLoop();
  gameEngine.startMatch();
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
  matchScore.textContent = `${result.score.player} — ${result.score.machine}`;
  statFastest.textContent = fastest !== null ? `${(fastest / 1000).toFixed(3)}s` : "-";
  statAverage.textContent = avg !== null ? `${(avg / 1000).toFixed(3)}s` : "-";
  statStreak.textContent = stats.bestStreak;
  showScreen("screen-match");
}

window.addEventListener("beforeunload", () => {
  stopCamera(cameraStream);
});

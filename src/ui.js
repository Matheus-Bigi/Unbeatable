// Real photographed hand poses (rock/paper/scissors + a loose, unformed
// "neutral" pose used for the idle/thinking state) replace the earlier
// emoji glyphs everywhere a hand gesture is shown -- the Machine's reveal,
// the player's reveal, and the gesture-calibration prompt.
const HAND_IMAGES = {
  rock: "assets/hands/rock.webp?v=12",
  paper: "assets/hands/paper.webp?v=12",
  scissors: "assets/hands/scissors.webp?v=12",
};
const NEUTRAL_HAND_IMAGE = "assets/hands/neutral.webp?v=12";

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
}

/** Photo path for a gesture; a falsy/unrecognized move falls back to the neutral pose. */
export function handImageSrc(move) {
  return HAND_IMAGES[move] ?? NEUTRAL_HAND_IMAGE;
}

export function updateProbBars(bars, ema) {
  bars.rock.style.width = `${Math.round(ema.rock * 100)}%`;
  bars.paper.style.width = `${Math.round(ema.paper * 100)}%`;
  bars.scissors.style.width = `${Math.round(ema.scissors * 100)}%`;
}

/** Sets a duel-panel's hand photo (creating its <img> the first time). */
export function setHandImage(el, move, { reveal = false } = {}) {
  let img = el.querySelector("img");
  if (!img) {
    img = document.createElement("img");
    img.className = "hand-photo";
    img.alt = "";
    el.appendChild(img);
  }
  img.src = handImageSrc(move);
  if (reveal) {
    el.classList.remove("reveal");
    // restart the CSS animation
    void el.offsetWidth;
    el.classList.add("reveal");
  }
}

export function renderRoundBanner(root, { verdict = "", line = "", reactionMs = null, kind = null, tooEarly = false, late = false } = {}) {
  root.classList.remove("win", "lose");
  if (kind) root.classList.add(kind);
  root.querySelector(".round-verdict").textContent = verdict;
  root.querySelector(".round-line").textContent = line ? `“${line}”` : "";

  const reactionEl = root.querySelector(".round-reaction");
  if (typeof reactionMs !== "number") {
    reactionEl.textContent = "";
    return;
  }
  const seconds = `${(reactionMs / 1000).toFixed(3)}s`;
  // Surface *why* a reaction time looks the way it does, rather than just
  // showing a bare number: committing anywhere from "1" onward is a normal
  // read (real throws start around "1", not after "GO" finishes) and isn't
  // flagged. Only a genuinely too-early false read (before "1") or a graced
  // late delivery gets called out -- both are edge cases, not the norm.
  const tag = tooEarly ? " ⚡ TOO EARLY" : late ? " ⏱ RAN LATE" : "";
  reactionEl.textContent = seconds + tag;
}

// 21-point MediaPipe hand skeleton connections, for the debug overlay.
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export function drawSkeleton(canvas, landmarks) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;
  ctx.strokeStyle = "rgba(255,159,28,0.9)";
  ctx.lineWidth = 2;
  for (const [a, b] of CONNECTIONS) {
    const p1 = landmarks[a];
    const p2 = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(p1.x * width, p1.y * height);
    ctx.lineTo(p2.x * width, p2.y * height);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(244,246,251,0.9)";
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function syncCanvasSize(canvas, videoEl) {
  const rect = videoEl.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

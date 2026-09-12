const MOVE_EMOJI = { rock: "✊", paper: "✋", scissors: "✌️" };

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => el.classList.toggle("active", el.id === id));
}

export function moveEmoji(move) {
  return MOVE_EMOJI[move] ?? "🖐️";
}

export function updateProbBars(bars, ema) {
  bars.rock.style.width = `${Math.round(ema.rock * 100)}%`;
  bars.paper.style.width = `${Math.round(ema.paper * 100)}%`;
  bars.scissors.style.width = `${Math.round(ema.scissors * 100)}%`;
}

export function setMachineHand(el, emoji, { reveal = false } = {}) {
  el.textContent = emoji;
  if (reveal) {
    el.classList.remove("reveal");
    // restart the CSS animation
    void el.offsetWidth;
    el.classList.add("reveal");
  }
}

export function setRoundBanner(el, text, kind) {
  el.textContent = text;
  el.classList.remove("win", "lose");
  if (kind) el.classList.add(kind);
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
  ctx.strokeStyle = "rgba(79,141,255,0.9)";
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

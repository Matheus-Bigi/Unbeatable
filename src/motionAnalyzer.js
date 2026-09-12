import { dist } from "./landmarkUtils.js?v=14";

const VELOCITY_NORM = 0.9; // normalized-units/sec that counts as "fast" hand motion
// Fingertip indices (thumb, index, middle, ring, pinky) per MediaPipe hand
// landmark layout -- their centroid is what actually moves while a gesture
// is being formed.
const FINGERTIPS = [4, 8, 12, 16, 20];

function centroid(landmarks, indices) {
  let x = 0;
  let y = 0;
  for (const i of indices) {
    x += landmarks[i].x;
    y += landmarks[i].y;
  }
  return { x: x / indices.length, y: y / indices.length };
}

/**
 * Tracks recent hand motion so the prediction engine can trust a frame more
 * once the hand has settled into a pose, and trust it less while the hand is
 * still moving quickly through the natural countdown up/down rhythm.
 *
 * Tracks both wrist and fingertip-centroid velocity, not wrist alone: a lot
 * of people form rock/paper/scissors by curling/extending their fingers
 * while keeping the forearm essentially still, so wrist velocity by itself
 * reads "perfectly settled" from the very first frame even while the
 * fingers are still actively changing shape. Either signal moving counts as
 * "not settled yet".
 */
export class MotionAnalyzer {
  constructor(maxFrames = 12) {
    this.maxFrames = maxFrames;
    this.history = [];
  }

  push(landmarks, timestampMs) {
    this.history.push({ wrist: landmarks[0], fingertips: centroid(landmarks, FINGERTIPS), t: timestampMs });
    if (this.history.length > this.maxFrames) this.history.shift();
  }

  /** Normalized hand velocity (units/sec), 0 if not enough history yet. */
  velocity() {
    if (this.history.length < 2) return 0;
    const a = this.history[this.history.length - 2];
    const b = this.history[this.history.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    const wristV = dist(a.wrist, b.wrist) / dt;
    const fingerV = dist(a.fingertips, b.fingertips) / dt;
    return Math.max(wristV, fingerV);
  }

  /** 1 = hand settled/still, 0 = hand moving fast. */
  stability() {
    return Math.max(0, 1 - this.velocity() / VELOCITY_NORM);
  }

  reset() {
    this.history = [];
  }
}

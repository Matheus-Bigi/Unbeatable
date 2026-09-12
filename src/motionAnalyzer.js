import { dist } from "./landmarkUtils.js?v=15";

const VELOCITY_NORM = 0.9; // normalized-units/sec that counts as "fast" hand motion
// Fingertip indices (thumb, index, middle, ring, pinky) per MediaPipe hand
// landmark layout -- these are what actually move while a gesture is being
// formed.
const FINGERTIPS = [4, 8, 12, 16, 20];

function pickPoints(landmarks, indices) {
  return indices.map((i) => landmarks[i]);
}

/**
 * Tracks recent hand motion so the prediction engine can trust a frame more
 * once the hand has settled into a pose, and trust it less while the hand is
 * still moving quickly through the natural countdown up/down rhythm.
 *
 * Tracks both wrist and per-fingertip velocity, not wrist alone: a lot of
 * people form rock/paper/scissors by curling/extending their fingers while
 * keeping the forearm essentially still, so wrist velocity by itself reads
 * "perfectly settled" from the very first frame even while the fingers are
 * still actively changing shape. Fingertip motion is averaged per-tip
 * displacement, not the centroid of the 5 tips -- fingers curling inward
 * symmetrically (a very common motion here) can leave their average
 * position nearly fixed even while every tip is clearly still moving, which
 * would silently defeat the whole point of this signal.
 */
export class MotionAnalyzer {
  constructor(maxFrames = 12) {
    this.maxFrames = maxFrames;
    this.history = [];
  }

  push(landmarks, timestampMs) {
    this.history.push({ wrist: landmarks[0], fingertips: pickPoints(landmarks, FINGERTIPS), t: timestampMs });
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
    const fingerDisplacements = a.fingertips.map((p, i) => dist(p, b.fingertips[i]));
    const avgFingerV = fingerDisplacements.reduce((sum, d) => sum + d, 0) / fingerDisplacements.length / dt;
    return Math.max(wristV, avgFingerV);
  }

  /** 1 = hand settled/still, 0 = hand moving fast. */
  stability() {
    return Math.max(0, 1 - this.velocity() / VELOCITY_NORM);
  }

  reset() {
    this.history = [];
  }
}

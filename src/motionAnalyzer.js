import { dist } from "./landmarkUtils.js?v=7";

const VELOCITY_NORM = 0.9; // normalized-units/sec that counts as "fast" hand motion

/**
 * Tracks recent wrist motion so the prediction engine can trust a frame more
 * once the hand has settled into a pose, and trust it less while the hand is
 * still moving quickly through the natural countdown up/down rhythm.
 */
export class MotionAnalyzer {
  constructor(maxFrames = 12) {
    this.maxFrames = maxFrames;
    this.history = [];
  }

  push(landmarks, timestampMs) {
    this.history.push({ wrist: landmarks[0], t: timestampMs });
    if (this.history.length > this.maxFrames) this.history.shift();
  }

  /** Normalized wrist velocity (units/sec), 0 if not enough history yet. */
  velocity() {
    if (this.history.length < 2) return 0;
    const a = this.history[this.history.length - 2];
    const b = this.history[this.history.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    return dist(a.wrist, b.wrist) / dt;
  }

  /** 1 = hand settled/still, 0 = hand moving fast. */
  stability() {
    return Math.max(0, 1 - this.velocity() / VELOCITY_NORM);
  }

  reset() {
    this.history = [];
  }
}

// A single tuned config for the MVP. Structured so a future EASY/MEDIUM
// tier is just another object like this one -- nothing else has to change.
export const DEFAULT_DIFFICULTY = {
  name: "HARD",
  // EMA smoothing rate for per-frame probabilities (higher = reacts faster, noisier).
  emaAlpha: 0.4,
  // How many consecutive high-confidence frames are needed to lock a prediction.
  commitFrames: 3,
  // Probability (0-1) a class must clear, consecutively, to be locked in.
  commitThreshold: 0.72,
  // Don't allow a commit in the first stretch of the countdown (hand is often
  // still neutral/raising) -- avoids a spurious lock before any real signal exists.
  armDelayMs: 350,
  // Player has this long after GO to deliver a final, readable gesture.
  deliveryWindowMs: 1300,
  // Probability threshold + consecutive frames to flag a late gesture change
  // (player switched away from an already-locked prediction).
  lateChangeProb: 0.75,
  lateChangeFrames: 4,
};

// A single tuned config for the MVP. Structured so a future EASY/MEDIUM
// tier is just another object like this one -- nothing else has to change.
export const DEFAULT_DIFFICULTY = {
  name: "HARD",
  // EMA smoothing rate for per-frame probabilities (higher = reacts faster, noisier).
  emaAlpha: 0.4,
  // How many consecutive high-confidence frames are needed to lock a prediction.
  commitFrames: 4,
  // Probability (0-1) a class must clear, consecutively, to be locked in.
  commitThreshold: 0.72,
  // Commitment can only happen from this many ms BEFORE "GO" onward (i.e.
  // anchored to the real final-throw window, not to when the countdown
  // started). This is the single most important knob for the "unbeatable"
  // feeling: a resting/neutral hand shape during READY/3/2 can easily read
  // as a confident class through pure softmax sharpening, even though
  // nothing about the player's real throw has happened yet. Gating the
  // earliest possible commit to just before GO means the engine can only
  // ever be reacting to the player's actual final gesture forming, not to
  // whatever their hand happened to rest as seconds earlier.
  armBeforeGoMs: 700,
  // Player has this long after GO to deliver a final, readable gesture.
  // Combined with armBeforeGoMs this defines a ~2s window straddling GO
  // during which the Machine is allowed to commit.
  deliveryWindowMs: 1300,
  // Probability threshold + consecutive frames to flag a late gesture change
  // (player switched away from an already-locked prediction).
  lateChangeProb: 0.75,
  lateChangeFrames: 4,
};

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
  // nothing about the player's real throw has happened yet. Real players
  // start their throw motion around "1", not after "GO" finishes, so the
  // window opens exactly there (matches COUNTDOWN_STEP_MS in gameEngine.js)
  // -- late enough that the engine is never reacting to a resting pose from
  // seconds earlier, early enough to catch the real throw as it happens.
  armBeforeGoMs: 900,
  // Player has this long after GO to deliver a final, readable gesture.
  // Combined with armBeforeGoMs this defines a ~2s window straddling GO
  // during which the Machine is allowed to commit.
  deliveryWindowMs: 1300,
  // ROCK is a closed/relaxed fist -- for a lot of people that's close to
  // their hand's natural resting shape, so it's the class most likely to
  // read as a confident classification from doing nothing in particular,
  // not from a real early throw. PAPER and SCISSORS both require
  // deliberately shaping the fingers, so they're much less likely to be a
  // false early trigger. Require a higher bar and longer sustained
  // evidence specifically for rock so it can't win the "psychic" moment on
  // a false positive; leave paper/scissors at the base threshold.
  commitThresholdByClass: { rock: 0.88 },
  commitFramesByClass: { rock: 7 },
  // If the player's gesture still looks unsettled (mid-transition) right
  // at the delivery deadline, grant one short extension instead of forcing
  // a read on a hand that's still moving -- a bit of tolerance for a
  // player who's just a beat slow, rather than penalizing them for it.
  lateGraceMs: 400,
  // Probability threshold + consecutive frames to flag a late gesture change
  // (player switched away from an already-locked prediction).
  lateChangeProb: 0.75,
  lateChangeFrames: 4,
};

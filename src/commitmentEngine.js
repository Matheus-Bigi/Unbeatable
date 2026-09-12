/**
 * Decides WHEN the Machine has seen enough to lock in a prediction, and
 * detects if the player changes gesture after that lock (a "late change").
 * Never uses information from after the moment it is called -- it is fed
 * one already-smoothed estimate per live frame, in order, nothing else.
 */
export class CommitmentEngine {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.committed = null; // { label, prob, t, reactionMs }
    this.streak = { rock: 0, paper: 0, scissors: 0 };
    this.postCommitStreak = { rock: 0, paper: 0, scissors: 0 };
    this.lateChangeDetected = false;
  }

  /**
   * @param ema {rock,paper,scissors} smoothed probabilities
   * @param nowMs current frame timestamp
   * @param countdownStartMs when "3" first appeared
   * @param goMs when "GO" fired (for reaction-time bookkeeping)
   */
  update(ema, nowMs, countdownStartMs, goMs) {
    const [topLabel, topProb] = Object.entries(ema).sort((a, b) => b[1] - a[1])[0];

    if (this.committed) {
      if (topLabel !== this.committed.label && topProb >= this.config.lateChangeProb) {
        this.postCommitStreak[topLabel] = (this.postCommitStreak[topLabel] || 0) + 1;
        if (this.postCommitStreak[topLabel] >= this.config.lateChangeFrames) {
          this.lateChangeDetected = true;
        }
      }
      return this.committed;
    }

    if (nowMs - countdownStartMs < this.config.armDelayMs) return null;

    if (topProb >= this.config.commitThreshold) {
      this.streak[topLabel] = (this.streak[topLabel] || 0) + 1;
    } else {
      this.streak = { rock: 0, paper: 0, scissors: 0 };
    }

    if (this.streak[topLabel] >= this.config.commitFrames) {
      this.committed = {
        label: topLabel,
        prob: topProb,
        t: nowMs,
        reactionMs: Math.max(0, nowMs - goMs),
      };
    }

    return this.committed;
  }
}

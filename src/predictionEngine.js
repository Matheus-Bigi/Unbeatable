/**
 * Continuously smooths per-frame gesture probabilities into a running
 * estimate. Only ever sees frames pushed to it so far (no lookahead) --
 * it IS the "what could the Machine know right now" estimate from the spec.
 */
export class PredictionEngine {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.ema = { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };
  }

  /** frameProbs: {rock,paper,scissors} from the classifier. stability: 0-1 from MotionAnalyzer. */
  update(frameProbs, stability) {
    // Slow the update while the hand is still moving fast -- the gesture is
    // likely still forming and a snap judgement now would just be noise.
    const alpha = this.config.emaAlpha * (0.4 + 0.6 * stability);
    for (const key of ["rock", "paper", "scissors"]) {
      this.ema[key] += alpha * (frameProbs[key] - this.ema[key]);
    }
    return { ...this.ema };
  }

  top() {
    const entries = Object.entries(this.ema).sort((a, b) => b[1] - a[1]);
    return { label: entries[0][0], prob: entries[0][1] };
  }
}

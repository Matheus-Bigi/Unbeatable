import { classifyFrame } from "./gestureClassifier.js?v=7";
import { MotionAnalyzer } from "./motionAnalyzer.js?v=7";
import { PredictionEngine } from "./predictionEngine.js?v=7";
import { CommitmentEngine } from "./commitmentEngine.js?v=7";
import { chooseMachineMove, resolveRound } from "./machineAI.js?v=7";

export const RoundState = {
  READY: "READY",
  PREP: "PREP",
  COUNTDOWN_3: "COUNTDOWN_3",
  COUNTDOWN_2: "COUNTDOWN_2",
  COUNTDOWN_1: "COUNTDOWN_1",
  GO: "GO",
  DELIVERY: "DELIVERY",
  RESULT: "RESULT",
};

const COUNTDOWN_STEP_MS = 900;
// A beat of "READY" before "3-2-1-GO" so the player has a moment to get
// into position after the screen changes, rather than the countdown
// starting the instant the round does.
const PREP_MS = 1200;

/**
 * Owns one Best-of-3 match: the countdown, the continuous per-frame
 * observation loop, and scoring. Talks to the CV/prediction stack (which
 * knows nothing about rounds or UI) and reports out via callbacks so the
 * presentation layer (ui.js) never has to know how a prediction was made.
 */
export class GameEngine {
  constructor({ tracker, videoEl, config, callbacks = {} }) {
    this.tracker = tracker;
    this.videoEl = videoEl;
    this.config = config;
    this.callbacks = callbacks;

    this.motion = new MotionAnalyzer();
    this.prediction = new PredictionEngine(config);
    this.commitment = new CommitmentEngine(config);

    this.score = { player: 0, machine: 0 };
    this.roundReactions = [];
    this.state = RoundState.READY;

    this._raf = null;
    this._timers = [];
  }

  setState(state) {
    this.state = state;
    this.callbacks.onState?.(state);
  }

  startMatch() {
    this.score = { player: 0, machine: 0 };
    this.roundReactions = [];
    this.startRound();
  }

  startRound() {
    this.motion.reset();
    this.prediction.reset();
    this.commitment.reset();
    this.machineMove = null;
    this.finalPlayerMove = null;
    this.recentLabels = [];
    this.callbacks.onRoundReset?.();

    const now = performance.now();
    // countdownStartMs anchors "3" itself (not the READY beat before it),
    // purely to compute goMs -- the commitment engine gates purely off
    // goMs (see CommitmentEngine.update), not off when the countdown began.
    this.countdownStartMs = now + PREP_MS;
    this.goMs = this.countdownStartMs + 3 * COUNTDOWN_STEP_MS;
    this.deliveryDeadline = this.goMs + this.config.deliveryWindowMs;
    this.effectiveDeadline = this.deliveryDeadline;
    this.gracedLate = false;

    const seq = [
      [RoundState.PREP, "READY", 0],
      [RoundState.COUNTDOWN_3, "3", PREP_MS],
      [RoundState.COUNTDOWN_2, "2", PREP_MS + COUNTDOWN_STEP_MS],
      [RoundState.COUNTDOWN_1, "1", PREP_MS + 2 * COUNTDOWN_STEP_MS],
      [RoundState.GO, "GO", PREP_MS + 3 * COUNTDOWN_STEP_MS],
    ];
    seq.forEach(([state, label, delay]) => {
      const timer = setTimeout(() => {
        this.setState(state);
        this.callbacks.onCountdown?.(label);
        if (state === RoundState.GO) this.setState(RoundState.DELIVERY);
      }, delay);
      this._timers.push(timer);
    });

    this._ensureLoop();
  }

  // Runs continuously once started, independent of round state -- _tick()
  // itself is a no-op outside an active round. Stopping the loop based on
  // transient state (e.g. "state === RESULT") is racy: a new round's first
  // countdown tick is scheduled via setTimeout(0), which isn't guaranteed to
  // run before the next requestAnimationFrame, so the loop could see stale
  // RESULT state and terminate itself right as a round starts. Only cancel()
  // stops it.
  _ensureLoop() {
    if (this._raf) return;
    const loop = () => {
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _tick() {
    if (this.state === RoundState.READY || this.state === RoundState.RESULT) return;
    // This runs every animation frame for the whole match. An uncaught
    // error on a single frame (camera hiccup, an unready video element,
    // anything unanticipated on a real device) must never kill the loop --
    // that would silently freeze the round with no visible error. Worst
    // case here is one skipped frame; the round still resolves at its
    // delivery deadline regardless.
    try {
      this._tickInner(performance.now());
    } catch (err) {
      console.warn("[UNBEATABLE] frame processing error, skipping this frame:", err);
    }
  }

  _tickInner(nowMs) {
    const detection = this.tracker.detect(this.videoEl, nowMs);

    this.callbacks.onFrame?.(detection);

    if (detection) {
      this.motion.push(detection.landmarks, nowMs);
      const frame = classifyFrame(detection.landmarks);
      this.recentLabels.push(frame.label);
      if (this.recentLabels.length > 6) this.recentLabels.shift();

      const ema = this.prediction.update(frame.probs, this.motion.stability());
      this.callbacks.onProb?.(ema);

      const committed = this.commitment.update(ema, nowMs, this.goMs);
      if (committed && !this.machineMove) this._lockMachineMove(committed);
    }

    if (this.state === RoundState.DELIVERY && nowMs >= this.effectiveDeadline) {
      const stillUnsettled = this.recentLabels[this.recentLabels.length - 1] === "uncertain";
      if (stillUnsettled && !this.gracedLate) {
        // The player's hand is still visibly mid-transition right at the
        // deadline -- give them one short extension rather than forcing a
        // read on a gesture that hasn't settled yet.
        this.gracedLate = true;
        this.effectiveDeadline = nowMs + this.config.lateGraceMs;
      } else {
        this._deliver(nowMs);
      }
    }
  }

  // Locks the Machine's move internally the instant prediction is
  // confident enough -- that's the actual "psychic" mechanic, and its
  // timing is what the reaction-time stat reports. It deliberately does
  // NOT reveal the move on screen yet: showing it immediately would let
  // the player just watch the Machine's hand and throw the counter to
  // it, since the real recognition/prediction here isn't fast or precise
  // enough (yet) to make an early visible reveal actually unreactable.
  // A non-committal "thinking" cue can still fire so the round still
  // feels alive before the reveal.
  _lockMachineMove(committed) {
    const { move } = chooseMachineMove(committed);
    this.machineMove = move;
    this._machineReactionMs = committed.reactionMs;
    this.callbacks.onMachineDeciding?.();
  }

  _deliver(nowMs) {
    const counts = {};
    for (const label of this.recentLabels) {
      if (label === "uncertain") continue;
      counts[label] = (counts[label] || 0) + 1;
    }
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    this.finalPlayerMove = ranked[0]?.[0] ?? this.commitment.committed?.label ?? null;

    if (!this.machineMove) {
      const { move } = chooseMachineMove(null);
      this.machineMove = move;
      this._machineReactionMs = this.config.deliveryWindowMs;
    }

    // The visual reveal always happens right here, at delivery -- whether
    // the Machine locked in early (fast internal reaction time) or had to
    // guess at the deadline, the player only ever sees it at the same
    // moment their own gesture is judged.
    this.callbacks.onMachineReveal?.({ move: this.machineMove, reactionMs: this._machineReactionMs });

    this.setState(RoundState.RESULT);
    this._finishRound(nowMs);
  }

  _finishRound() {
    const playerMove = this.finalPlayerMove;
    const outcome = playerMove ? resolveRound(playerMove, this.machineMove) : "machine";

    if (outcome === "player") this.score.player++;
    else if (outcome === "machine") this.score.machine++;

    const committed = this.commitment.committed;
    const reactionMs = committed ? committed.reactionMs : this.config.deliveryWindowMs;
    this.roundReactions.push(reactionMs);

    const matchOver = this.score.player >= 2 || this.score.machine >= 2;

    this.callbacks.onRoundResult?.({
      outcome,
      playerMove,
      machineMove: this.machineMove,
      reactionMs,
      beforeGo: committed?.beforeGo ?? false,
      late: this.gracedLate,
      lateChange: this.commitment.lateChangeDetected,
      score: { ...this.score },
      matchOver,
    });

    if (matchOver) {
      this.callbacks.onMatchResult?.({
        winner: this.score.player > this.score.machine ? "player" : "machine",
        score: { ...this.score },
        reactions: [...this.roundReactions],
      });
    }
  }

  cancel() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }
}

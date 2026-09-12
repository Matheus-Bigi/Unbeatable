// Minimal synthesized sound via Web Audio -- no audio asset files needed.
// iOS Safari requires the AudioContext be created/resumed from within a
// user gesture, so call primeAudio() from the first tap in the flow.

let ctx = null;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// Call from every user tap in the flow, not just the first one -- iOS
// Safari can auto-suspend the AudioContext again after it's sat idle for a
// while (camera check + calibration can easily take long enough), and
// resuming it from code that isn't itself inside a fresh gesture can fail
// silently. Cheap and idempotent, so over-calling it is harmless.
export function primeAudio() {
  const audioCtx = getCtx();
  if (!audioCtx || unlocked) return;
  unlocked = true;
  // Merely creating/resuming the context isn't always enough to unlock
  // audible output on iOS Safari -- some versions only fully unlock after
  // real (even silent) audio has actually played from within a genuine
  // user gesture, so play one inaudible blip right here.
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.01);
}

export function beep({ freq = 440, durationMs = 120, volume = 0.15, type = "sine" } = {}) {
  const audioCtx = getCtx();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain).connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000 + 0.02);
}

const COUNTDOWN_TONES = {
  READY: { freq: 300, durationMs: 120, volume: 0.1 },
  3: { freq: 440, durationMs: 110, volume: 0.14 },
  2: { freq: 440, durationMs: 110, volume: 0.14 },
  1: { freq: 520, durationMs: 140, volume: 0.18 },
  GO: { freq: 880, durationMs: 220, volume: 0.22, type: "square" },
};

export function countdownBeep(label) {
  const tone = COUNTDOWN_TONES[label];
  if (tone) beep(tone);
}

export function resultBeep(outcome) {
  if (outcome === "player") beep({ freq: 660, durationMs: 180, volume: 0.2 });
  else if (outcome === "machine") beep({ freq: 220, durationMs: 220, volume: 0.2, type: "square" });
  else beep({ freq: 380, durationMs: 150, volume: 0.15 });
}

// Test-only stand-in for @mediapipe/tasks-vision's HandLandmarker/FilesetResolver.
// Emits a synthetic hand that cycles through an open-palm (PAPER) pose, a
// closed fist (ROCK) pose, and a scissors pose over time -- with a genuine
// eased transition from PAPER into ROCK early in the cycle (modeling a
// "throwing" motion for the prediction/commitment pipeline) -- so both
// round-play and gesture-calibration smoke tests have real signal to work
// with, without needing network access or a real camera feed.

const WRIST = { x: 0.5, y: 0.85, z: 0 };
const FINGER_X = { index: 0.42, middle: 0.48, ring: 0.54, pinky: 0.6 };
// [mcp, pip, dip, tip] -- full 4-joint layout so every one of the 21
// landmarks a real HandLandmarker returns is populated (the skeleton
// overlay draws edges through the dip joints too).
const FINGER_INDICES = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

// Per-finger curl amount (0 = extended, 1 = curled) for each canonical pose.
const POSE_T = {
  paper: { index: 0, middle: 0, ring: 0, pinky: 0 },
  rock: { index: 1, middle: 1, ring: 1, pinky: 1 },
  scissors: { index: 0, middle: 0, ring: 1, pinky: 1 },
};

// [atMs, pose] keyframes; each finger's curl is linearly interpolated
// between the surrounding keyframes' poses, then the whole thing repeats.
// The first 6000ms (paper -> transition -> rock) is unchanged from before,
// so existing round-timing behavior is preserved; scissors is appended
// after so gesture-calibration tests can reach all three gestures.
const KEYFRAMES = [
  [0, "paper"],
  [1500, "paper"],
  [3000, "rock"],
  [6000, "rock"],
  [6500, "scissors"],
  [8000, "scissors"],
  [8500, "paper"],
];
const CYCLE_MS = 8500;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function poseAt(elapsedMs) {
  const t = elapsedMs % CYCLE_MS;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const [t0, pose0] = KEYFRAMES[i];
    const [t1, pose1] = KEYFRAMES[i + 1];
    if (t >= t0 && t < t1) {
      const frac = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      const a = POSE_T[pose0];
      const b = POSE_T[pose1];
      return {
        index: lerp(a.index, b.index, frac),
        middle: lerp(a.middle, b.middle, frac),
        ring: lerp(a.ring, b.ring, frac),
        pinky: lerp(a.pinky, b.pinky, frac),
      };
    }
  }
  return POSE_T.paper;
}

function fingerPoints(fx, t) {
  const open = { pip: { x: fx, y: 0.55 }, tip: { x: fx, y: 0.35 } };
  const closed = { pip: { x: fx, y: 0.68 }, tip: { x: fx, y: 0.74 } };
  const pip = { x: lerp(open.pip.x, closed.pip.x, t), y: lerp(open.pip.y, closed.pip.y, t), z: 0 };
  const tip = { x: lerp(open.tip.x, closed.tip.x, t), y: lerp(open.tip.y, closed.tip.y, t), z: 0 };
  const dip = { x: lerp(pip.x, tip.x, 0.5), y: lerp(pip.y, tip.y, 0.5), z: 0 };
  return { mcp: { x: fx, y: 0.75, z: 0 }, pip, dip, tip };
}

function buildLandmarks(tByFinger) {
  const lm = new Array(21);
  lm[0] = WRIST;
  lm[1] = { x: 0.4, y: 0.8, z: 0 };
  lm[2] = { x: 0.36, y: 0.74, z: 0 };
  lm[3] = { x: 0.33, y: 0.68, z: 0 };
  lm[4] = { x: 0.3, y: 0.62, z: 0 };
  for (const [name, [mcpI, pipI, dipI, tipI]] of Object.entries(FINGER_INDICES)) {
    const p = fingerPoints(FINGER_X[name], tByFinger[name]);
    lm[mcpI] = p.mcp;
    lm[pipI] = p.pip;
    lm[dipI] = p.dip;
    lm[tipI] = p.tip;
  }
  return lm;
}

export class HandLandmarker {
  static async createFromOptions() {
    return new HandLandmarker();
  }
  constructor() {
    this.startTime = performance.now();
  }
  detectForVideo(_video, timestampMs) {
    const elapsed = timestampMs - this.startTime;
    const tByFinger = poseAt(elapsed);
    return { landmarks: [buildLandmarks(tByFinger)], handedness: [[{ categoryName: "Right" }]] };
  }
  close() {}
}

export class FilesetResolver {
  static async forVisionTasks() {
    return {};
  }
}

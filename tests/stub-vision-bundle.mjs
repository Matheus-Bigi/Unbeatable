// Test-only stand-in for @mediapipe/tasks-vision's HandLandmarker/FilesetResolver.
// Emits a synthetic hand that eases from an open-palm (PAPER) pose into a
// closed fist (ROCK) pose over time, so the real classifier/prediction/
// commitment pipeline has genuine signal to work with during automated
// smoke tests, without needing network access or a real camera feed.

const WRIST = { x: 0.5, y: 0.85, z: 0 };
const FINGER_X = { index: 0.42, middle: 0.48, ring: 0.54, pinky: 0.6 };
// [mcp, pip, dip, tip] -- full 4-joint layout so every one of the 21
// landmarks a real HandLandmarker returns is populated (the skeleton
// overlay draws edges through the dip joints too).
const FINGER_INDICES = { index: [5, 6, 7, 8], middle: [9, 10, 11, 12], ring: [13, 14, 15, 16], pinky: [17, 18, 19, 20] };

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function fingerPoints(fx, t) {
  const open = { pip: { x: fx, y: 0.55 }, tip: { x: fx, y: 0.35 } };
  const closed = { pip: { x: fx, y: 0.68 }, tip: { x: fx, y: 0.74 } };
  const pip = { x: lerp(open.pip.x, closed.pip.x, t), y: lerp(open.pip.y, closed.pip.y, t), z: 0 };
  const tip = { x: lerp(open.tip.x, closed.tip.x, t), y: lerp(open.tip.y, closed.tip.y, t), z: 0 };
  const dip = { x: lerp(pip.x, tip.x, 0.5), y: lerp(pip.y, tip.y, 0.5), z: 0 };
  return { mcp: { x: fx, y: 0.75, z: 0 }, pip, dip, tip };
}

function buildLandmarks(t) {
  const lm = new Array(21);
  lm[0] = WRIST;
  lm[1] = { x: 0.4, y: 0.8, z: 0 };
  lm[2] = { x: 0.36, y: 0.74, z: 0 };
  lm[3] = { x: 0.33, y: 0.68, z: 0 };
  lm[4] = { x: 0.3, y: 0.62, z: 0 };
  for (const [name, [mcpI, pipI, dipI, tipI]] of Object.entries(FINGER_INDICES)) {
    const p = fingerPoints(FINGER_X[name], t);
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
    const elapsed = (timestampMs - this.startTime) % 6000;
    let t;
    if (elapsed < 1500) t = 0;
    else if (elapsed < 3000) t = (elapsed - 1500) / 1500;
    else t = 1;
    return { landmarks: [buildLandmarks(t)], handedness: [[{ categoryName: "Right" }]] };
  }
  close() {}
}

export class FilesetResolver {
  static async forVisionTasks() {
    return {};
  }
}

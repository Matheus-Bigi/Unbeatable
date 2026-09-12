import { sub, angleBetween, clamp01 } from "./landmarkUtils.js?v=3";

// [mcp, pip, tip] indices per MediaPipe hand landmark layout.
const FINGERS = {
  index: [5, 6, 8],
  middle: [9, 10, 12],
  ring: [13, 14, 16],
  pinky: [17, 18, 20],
};

const MIN_CURL_ANGLE = 1.0; // ~57deg, fully curled
const MAX_CURL_ANGLE = 2.9; // ~166deg, fully extended

function fingerExtension(landmarks, [mcp, pip, tip]) {
  const toMcp = sub(landmarks[mcp], landmarks[pip]);
  const toTip = sub(landmarks[tip], landmarks[pip]);
  const angle = angleBetween(toMcp, toTip);
  return clamp01((angle - MIN_CURL_ANGLE) / (MAX_CURL_ANGLE - MIN_CURL_ANGLE));
}

// Canonical extension patterns for [index, middle, ring, pinky].
const PATTERNS = {
  rock: [0, 0, 0, 0],
  paper: [1, 1, 1, 1],
  scissors: [1, 1, 0, 0],
};

const CONFIDENT_THRESHOLD = 0.55;
// Softmax temperature over squared distance-to-pattern. Low enough that a
// clean match to one pattern approaches ~1.0 confidence (a plain
// inverse-distance normalization across all three patterns mathematically
// caps out well below that, since the patterns aren't equidistant from each
// other -- that cap silently made high commit thresholds unreachable).
const TEMPERATURE = 0.2;

/**
 * Classifies a single frame of hand landmarks into ROCK/PAPER/SCISSORS with
 * continuous per-class probabilities derived from finger-curl geometry only
 * (no lookahead, no history) -- this is the causal, single-frame signal that
 * feeds the (also causal) prediction engine.
 */
export function classifyFrame(landmarks) {
  const extension = {};
  for (const [name, indices] of Object.entries(FINGERS)) {
    extension[name] = fingerExtension(landmarks, indices);
  }
  const vector = [extension.index, extension.middle, extension.ring, extension.pinky];

  const score = {};
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    const sqDist = pattern.reduce((sum, p, i) => sum + (p - vector[i]) ** 2, 0);
    score[name] = Math.exp(-sqDist / TEMPERATURE);
  }
  const total = score.rock + score.paper + score.scissors;
  const probs = {
    rock: score.rock / total,
    paper: score.paper / total,
    scissors: score.scissors / total,
  };

  const [topLabel, topProb] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  const label = topProb >= CONFIDENT_THRESHOLD ? topLabel : "uncertain";

  return { probs, label, confidence: topProb, extension };
}

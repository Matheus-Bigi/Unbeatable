const VISION_VERSION = "1.0.1";
const VISION_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let cachedModulePromise = null;
function loadVisionModule() {
  if (!cachedModulePromise) {
    cachedModulePromise = import(/* @vite-ignore */ `${VISION_CDN}/vision_bundle.mjs`);
  }
  return cachedModulePromise;
}

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.lastVideoTime = -1;
  }

  async init() {
    const { HandLandmarker, FilesetResolver } = await loadVisionModule();
    const filesetResolver = await FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    this.landmarker = await HandLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /**
   * Returns { landmarks, handedness, timestampMs } or null if no hand / no
   * new frame / the video isn't decoding yet. A single frame failing (video
   * not ready, a transient WASM/GPU hiccup) must never throw out of here --
   * this runs inside a continuous per-frame loop for the whole match, so an
   * uncaught error on one frame would otherwise silently kill that loop and
   * freeze the round with no visible error.
   */
  detect(videoEl, timestampMs) {
    if (!this.landmarker || videoEl.readyState < 2 || videoEl.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = videoEl.currentTime;
    try {
      const result = this.landmarker.detectForVideo(videoEl, timestampMs);
      if (!result.landmarks || result.landmarks.length === 0) return null;
      return {
        landmarks: result.landmarks[0],
        handedness: result.handedness?.[0]?.[0]?.categoryName ?? "Unknown",
        timestampMs,
      };
    } catch (err) {
      console.warn("[UNBEATABLE] hand detection failed for this frame, skipping:", err);
      return null;
    }
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
  }
}

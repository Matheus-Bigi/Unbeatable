# UNBEATABLE

A camera-based Rock-Paper-Scissors game where the Machine tries to read your hand's motion and throw its counter-move before you finish your gesture. This is the MVP: a single, tuned-hard-but-beatable difficulty, running entirely in the browser — no app install needed. Quick Play, Pass & Play (local multiplayer), and a local leaderboard are all in.

## How it works

- **Camera**: your device's front camera, via `getUserMedia`.
- **Hand tracking**: [MediaPipe Tasks Vision — HandLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker), loaded from a CDN, running on-device.
- **Prediction**: a continuous, causal (no-future-frames) estimate of ROCK/PAPER/SCISSORS probability from finger-curl geometry, smoothed over time and weighted by how settled your hand currently is. Once a class is confidently ahead for a few consecutive frames, the Machine locks in and throws its counter — often before your gesture is fully formed.
- Everything runs locally in the browser; no video leaves the device.

See `src/` for the module breakdown (`camera.js`, `handTracker.js`, `gestureClassifier.js`, `motionAnalyzer.js`, `predictionEngine.js`, `commitmentEngine.js`, `gameEngine.js`, `machineAI.js`).

## Testing on your iPad

Camera access requires a secure context (HTTPS), so the simplest way to test on a real device is GitHub Pages:

1. In this repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. (One-time.)
2. **Settings → Environments → `github-pages` → Deployment branches** — if it's restricted to your default branch, add this branch (`claude/unbeatable-game-feasibility-5olmhy`) to the allowed list, or set it to "No restriction". (Also one-time; GitHub locks the Pages environment to the default branch out of the box.)
3. Push (already done from this session) triggers the `Deploy to GitHub Pages` workflow. Once it finishes, your site is at `https://<your-username>.github.io/<repo-name>/`.
4. Open that URL in **Safari on your iPad** and allow camera access when prompted.

Alternative for faster local iteration on a Mac: `npx serve .` and open `https://localhost:<port>` — or any static HTTPS host works, since there's no build step at all.

## What to expect from this MVP

- One difficulty, tuned aggressive (see `src/difficultyConfig.js` — `commitThreshold`, `commitFrames`, `armBeforeGoMs` are the main knobs). Rock gets its own stricter bar (`commitThresholdByClass`/`commitFramesByClass`) since a relaxed fist is many people's resting hand shape, so it's the class most likely to false-trigger early; paper/scissors require deliberately shaping the fingers so they're trusted at the base threshold. A short `lateGraceMs` extension is granted once if the player's gesture still looks unsettled right at the delivery deadline.
- The commit window (`armBeforeGoMs`) opens exactly at the "1" countdown mark, not after "GO" — real throws normally start around "1", so a fast reaction reported anywhere from "1" onward is a normal read, not an anomaly. The round banner only flags a reaction as "⚡ TOO EARLY" if it genuinely locked in before "1" (a false read from a resting pose), and "⏱ RAN LATE" for a graced-late delivery.
- If nothing clears the confidence bar before the delivery deadline, the Machine no longer falls back to a blind random guess — it counters whichever gesture was most common among the frames it already saw (same causal, already-observed data, just a softer bar than the strict commit gate). A blind guess is now the last resort, only when the hand never settled into anything readable.
- SCISSORS vs PAPER discrimination was improved: the classifier now weights ring/pinky curl (the only dimension that actually distinguishes the two) more heavily, and expects a realistic partial curl there rather than full-fist closure.
- A live probability bar for ROCK/PAPER/SCISSORS during play, and a hand-landmark skeleton overlay — both intentionally left visible so you can see *why* the Machine reacted when it did, while we tune it. These can be hidden once the timing feels right.
- The Machine's win rate comes entirely from real (imperfect) gesture recognition — nothing is rigged, so you should win sometimes.
- The Machine gets its own equal-size window next to your camera feed (like a video call), so it reads as an opponent rather than a small icon next to your own picture. Its move only appears in that window at the same instant your own gesture is judged — never revealed early, since that would just let you counter what you see. A "thinking" pulse plays beforehand as a non-committal hint.
- After the camera check (hand/distance/lighting), a short gesture calibration confirms the classifier recognizes your ROCK, PAPER, and SCISSORS at least once before you play — hold each pose until it checks off. This is a confidence check, not a hard gate: SKIP is always available if your gestures keep misreading, so it never locks you out of playing.
- Not yet built: multiple difficulty levels, richer Machine avatar art, haptics. See the plan this was built from for the intended follow-up phases.

## Reporting back for tuning

The commitment engine's thresholds are a first pass, not final — please note anything like: predictions that felt wrong/early, times it should have caught your move and didn't, or the reaction-time numbers feeling off, so `difficultyConfig.js` can be adjusted.

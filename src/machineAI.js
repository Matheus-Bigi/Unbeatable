const COUNTERS = { rock: "paper", paper: "scissors", scissors: "rock" };
const MOVES = ["rock", "paper", "scissors"];

export function counterMove(move) {
  return COUNTERS[move];
}

/** Picks the Machine's move from a locked prediction, or a legal guess if none locked in time. */
export function chooseMachineMove(committed) {
  if (committed) return { move: counterMove(committed.label), fromPrediction: true };
  return { move: MOVES[Math.floor(Math.random() * MOVES.length)], fromPrediction: false };
}

/** Standard RPS resolution. Returns "player" | "machine" | "draw". */
export function resolveRound(playerMove, machineMove) {
  if (playerMove === machineMove) return "draw";
  if (COUNTERS[playerMove] === machineMove) return "machine";
  return "player";
}

export const MACHINE_LINES = {
  machineWin: ["Too slow.", "I saw that.", "Not even close.", "Again?"],
  playerWin: ["Okay... nice one.", "Lucky.", "I'll give you that."],
  draw: ["Huh. Same time.", "Draw. Again."],
  lateChange: ["I saw that.", "Too late."],
};

export function pickLine(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

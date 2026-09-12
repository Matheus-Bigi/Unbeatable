const KEY_PREFIX = "unbeatable:player:";

function emptyStats() {
  return {
    matches: 0,
    roundWins: 0,
    roundLosses: 0,
    draws: 0,
    reactionSumMs: 0,
    reactionCount: 0,
    fastestMs: null,
    currentStreak: 0,
    bestStreak: 0,
  };
}

export function loadStats(name) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + name);
    return raw ? { ...emptyStats(), ...JSON.parse(raw) } : emptyStats();
  } catch {
    return emptyStats();
  }
}

export function saveStats(name, stats) {
  try {
    localStorage.setItem(KEY_PREFIX + name, JSON.stringify(stats));
  } catch {
    // localStorage unavailable (private mode, quota) -- stats just won't persist.
  }
}

export function recordRound(name, { outcome, reactionMs }) {
  const stats = loadStats(name);
  if (outcome === "player") {
    stats.roundWins++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else if (outcome === "machine") {
    stats.roundLosses++;
    stats.currentStreak = 0;
  } else {
    stats.draws++;
  }
  if (typeof reactionMs === "number") {
    stats.reactionSumMs += reactionMs;
    stats.reactionCount++;
    stats.fastestMs = stats.fastestMs === null ? reactionMs : Math.min(stats.fastestMs, reactionMs);
  }
  saveStats(name, stats);
  return stats;
}

export function recordMatch(name) {
  const stats = loadStats(name);
  stats.matches++;
  saveStats(name, stats);
  return stats;
}

export function averageReactionMs(stats) {
  return stats.reactionCount ? stats.reactionSumMs / stats.reactionCount : null;
}

export function listAllPlayers() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) {
        out.push({ name: key.slice(KEY_PREFIX.length), stats: loadStats(key.slice(KEY_PREFIX.length)) });
      }
    }
  } catch {
    // localStorage unavailable -- leaderboard is just empty.
  }
  return out;
}

const fs = require("fs");
const path = require("path");
const { env } = require("../config/env");

function getInitialState() {
  return {
    days: {},
    penalties: {},
  };
}

function ensureStateDirectory() {
  const dir = path.dirname(env.PENALTY_STATE_FILE);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadPenaltyState() {
  ensureStateDirectory();

  if (!fs.existsSync(env.PENALTY_STATE_FILE)) {
    return getInitialState();
  }

  try {
    return JSON.parse(fs.readFileSync(env.PENALTY_STATE_FILE, "utf8"));
  } catch (error) {
    console.error("Cannot read penalties.json:", error.message);
    return getInitialState();
  }
}

function savePenaltyState(state) {
  ensureStateDirectory();

  fs.writeFileSync(
    env.PENALTY_STATE_FILE,
    JSON.stringify(state, null, 2),
    "utf8",
  );
}

function getTodayState(state, dateKey) {
  if (!state.days[dateKey]) {
    state.days[dateKey] = {
      threadId: null,
      submittedDiscordIds: [],
    };
  }

  return state.days[dateKey];
}

function getPenaltyKey(dateKey, discordId) {
  return `${dateKey}:${discordId}`;
}

function markUserSubmitted(dateKey, discordId, threadId = null) {
  const state = loadPenaltyState();
  const todayState = getTodayState(state, dateKey);

  if (!todayState.submittedDiscordIds.includes(discordId)) {
    todayState.submittedDiscordIds.push(discordId);
  }

  if (threadId && !todayState.threadId) {
    todayState.threadId = threadId;
  }

  savePenaltyState(state);
}

module.exports = {
  loadPenaltyState,
  savePenaltyState,
  getTodayState,
  getPenaltyKey,
  markUserSubmitted,
};

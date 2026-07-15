const fs = require("fs");
const path = require("path");
const { env } = require("../config/env");

function initialState() {
  return {
    processedSourceMessageIds: [],
    inFlightSourceMessageIds: [],
    drafts: [],
  };
}

function ensureDir() {
  const dir = path.dirname(env.JIRA_DRAFT_STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadJiraDraftState() {
  ensureDir();

  if (!fs.existsSync(env.JIRA_DRAFT_STATE_FILE)) {
    return initialState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(env.JIRA_DRAFT_STATE_FILE, "utf8"));
    return {
      processedSourceMessageIds: parsed.processedSourceMessageIds || [],
      inFlightSourceMessageIds: parsed.inFlightSourceMessageIds || [],
      drafts: parsed.drafts || [],
    };
  } catch (error) {
    console.error("Cannot read jira-task-drafts.json:", error.message);
    return initialState();
  }
}

function claimSourceMessage(messageId) {
  const state = loadJiraDraftState();

  if (
    state.processedSourceMessageIds.includes(messageId) ||
    state.inFlightSourceMessageIds.includes(messageId)
  ) {
    return false;
  }

  state.inFlightSourceMessageIds.push(messageId);
  saveJiraDraftState(state);
  return true;
}

function releaseSourceMessageClaim(messageId) {
  const state = loadJiraDraftState();
  state.inFlightSourceMessageIds = state.inFlightSourceMessageIds.filter(
    (id) => id !== messageId,
  );
  saveJiraDraftState(state);
}

function markSourceMessageProcessed(messageId) {
  const state = loadJiraDraftState();

  if (!state.processedSourceMessageIds.includes(messageId)) {
    state.processedSourceMessageIds.push(messageId);
  }

  state.inFlightSourceMessageIds = state.inFlightSourceMessageIds.filter(
    (id) => id !== messageId,
  );
  saveJiraDraftState(state);
}

function saveJiraDraftState(state) {
  ensureDir();
  fs.writeFileSync(
    env.JIRA_DRAFT_STATE_FILE,
    JSON.stringify(state, null, 2),
    "utf8",
  );
}

function getDraftById(state, draftId) {
  return state.drafts.find((draft) => draft.draftId === draftId) || null;
}

function updateDraftById(draftId, updater) {
  const state = loadJiraDraftState();
  const draft = getDraftById(state, draftId);

  if (!draft) return null;

  updater(draft);
  draft.updatedAt = new Date().toISOString();

  saveJiraDraftState(state);
  return draft;
}

function findLatestPendingDraftByNumber(channelId, draftNumber) {
  const state = loadJiraDraftState();

  const matches = state.drafts
    .filter(
      (draft) =>
        draft.channelId === channelId &&
        draft.draftNumber === draftNumber &&
        draft.status === "pending_review",
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return matches[0] || null;
}

module.exports = {
  loadJiraDraftState,
  saveJiraDraftState,
  getDraftById,
  updateDraftById,
  findLatestPendingDraftByNumber,
  claimSourceMessage,
  releaseSourceMessageClaim,
  markSourceMessageProcessed,
};

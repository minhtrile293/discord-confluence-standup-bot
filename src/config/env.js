require("dotenv").config({ override: true });
const path = require("path");

function toNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanEnvString(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\s+#.*$/, "")
    .trim();
}

const env = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_DAILY_CHANNEL_ID: process.env.DISCORD_DAILY_CHANNEL_ID,
  DISCORD_MEETING_NOTES_CHANNEL_ID:
    process.env.DISCORD_MEETING_NOTES_CHANNEL_ID,

  CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
  CONFLUENCE_PAGE_ID: process.env.CONFLUENCE_PAGE_ID,
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL,
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,

  OPENAI_API_KEY: cleanEnvString(
    process.env.OPENAI_API_KEY || process.env.GITHUB_TOKEN,
  ),
  OPENAI_BASE_URL: cleanEnvString(
    process.env.OPENAI_BASE_URL ||
      "https://models.inference.ai.azure.com",
  ),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",

  GEMINI_API_KEY: cleanEnvString(
    process.env.GEMINI_API_KEY ||
      process.env.GEMINI_API_KEY_C ||
      process.env.GEMINI_API_KEY_A,
  ),
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash",

  JIRA_BASE_URL: process.env.JIRA_BASE_URL,
  JIRA_EMAIL: process.env.JIRA_EMAIL,
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
  JIRA_BOARD_ID: toNumber(process.env.JIRA_BOARD_ID),
  JIRA_TARGET_SPRINT_ID: toNumber(process.env.JIRA_TARGET_SPRINT_ID),
  JIRA_TASK_ISSUE_TYPE_NAME: process.env.JIRA_TASK_ISSUE_TYPE_NAME || "Task",
  JIRA_SUBTASK_ISSUE_TYPE_NAME:
    process.env.JIRA_SUBTASK_ISSUE_TYPE_NAME || "Sub-task",
  JIRA_STORY_POINT_FIELD: process.env.JIRA_STORY_POINT_FIELD,
  JIRA_TASK_ISSUE_TYPE_ID: process.env.JIRA_TASK_ISSUE_TYPE_ID,
  JIRA_SUBTASK_ISSUE_TYPE_ID: process.env.JIRA_SUBTASK_ISSUE_TYPE_ID,

  TIMEZONE: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",

  PAYMENT_QR_FILE_PATH: process.env.PAYMENT_QR_FILE_PATH || "./assets/qr.png",
  FINE_AMOUNT: Number(process.env.DAILY_FINE_AMOUNT || "10000"),

  PENALTY_STATE_FILE: path.resolve(
    process.cwd(),
    process.env.PENALTY_STATE_FILE || "./data/penalties.json",
  ),

  JIRA_DRAFT_STATE_FILE: path.resolve(
    process.cwd(),
    process.env.JIRA_DRAFT_STATE_FILE || "./data/jira-task-drafts.json",
  ),

  MAX_TASKS_PER_MEETING_NOTE: toNumber(
    process.env.MAX_TASKS_PER_MEETING_NOTE,
    30,
  ),
  LLM_TASK_BATCH_SIZE: toNumber(process.env.LLM_TASK_BATCH_SIZE, 10),
};

function validateEnv() {
  const required = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_DAILY_CHANNEL_ID",

    "CONFLUENCE_BASE_URL",
    "CONFLUENCE_PAGE_ID",
    "CONFLUENCE_EMAIL",
    "CONFLUENCE_API_TOKEN",

    "DISCORD_MEETING_NOTES_CHANNEL_ID",
    "GEMINI_API_KEY",

    "JIRA_BASE_URL",
    "JIRA_EMAIL",
    "JIRA_API_TOKEN",
    "JIRA_PROJECT_KEY",
    "JIRA_BOARD_ID",
    "JIRA_TARGET_SPRINT_ID",
    "JIRA_STORY_POINT_FIELD",
  ];

  const missing = required.filter((key) => {
    const value = env[key];
    return value === undefined || value === null || value === "";
  });

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  if (!Number.isFinite(env.FINE_AMOUNT) || env.FINE_AMOUNT <= 0) {
    throw new Error("DAILY_FINE_AMOUNT must be a positive number.");
  }
}

module.exports = { env, validateEnv };

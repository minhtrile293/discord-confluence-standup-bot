require("dotenv").config();

const path = require("path");

const env = {
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  DISCORD_DAILY_CHANNEL_ID: process.env.DISCORD_DAILY_CHANNEL_ID,

  CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
  CONFLUENCE_PAGE_ID: process.env.CONFLUENCE_PAGE_ID,
  CONFLUENCE_EMAIL: process.env.CONFLUENCE_EMAIL,
  CONFLUENCE_API_TOKEN: process.env.CONFLUENCE_API_TOKEN,

  TIMEZONE: process.env.TIMEZONE || "Asia/Ho_Chi_Minh",

  PAYMENT_QR_FILE_PATH: process.env.PAYMENT_QR_FILE_PATH || "./assets/qr.png",

  FINE_AMOUNT: Number(process.env.DAILY_FINE_AMOUNT || "10000"),

  PENALTY_STATE_FILE: path.resolve(
    process.cwd(),
    process.env.PENALTY_STATE_FILE || "./data/penalties.json",
  ),
};

function validateEnv() {
  const required = [
    "DISCORD_BOT_TOKEN",
    "DISCORD_DAILY_CHANNEL_ID",
    "CONFLUENCE_BASE_URL",
    "CONFLUENCE_PAGE_ID",
    "CONFLUENCE_EMAIL",
    "CONFLUENCE_API_TOKEN",
  ];

  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  if (!Number.isFinite(env.FINE_AMOUNT) || env.FINE_AMOUNT <= 0) {
    throw new Error("DAILY_FINE_AMOUNT must be a positive number.");
  }
}

module.exports = {
  env,
  validateEnv,
};

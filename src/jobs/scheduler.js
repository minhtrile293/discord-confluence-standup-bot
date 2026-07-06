const cron = require("node-cron");
const { env } = require("../config/env");
const {
  sendDailyReminder,
  checkMissingDailyAtNoon,
  escalateUnpaidPenaltiesAtMidnight,
} = require("../services/penaltyService");

function setupScheduler(client) {
  const DAILY_STANDUP_CRON = "0 7 * * *";
  const NOON_CHECK_CRON = "0 12 * * *";
  const MIDNIGHT_ESCALATION_CRON = "0 0 * * *";

  cron.schedule(DAILY_STANDUP_CRON, () => sendDailyReminder(client), {
    timezone: env.TIMEZONE,
  });

  cron.schedule(NOON_CHECK_CRON, () => checkMissingDailyAtNoon(client), {
    timezone: env.TIMEZONE,
  });

  cron.schedule(
    MIDNIGHT_ESCALATION_CRON,
    () => escalateUnpaidPenaltiesAtMidnight(client),
    {
      timezone: env.TIMEZONE,
    },
  );

  console.log(
    `Daily reminder scheduled: ${DAILY_STANDUP_CRON}, timezone: ${env.TIMEZONE}`,
  );

  console.log(
    `Noon missing-daily check scheduled: ${NOON_CHECK_CRON}, timezone: ${env.TIMEZONE}`,
  );

  console.log(
    `Midnight fine escalation scheduled: ${MIDNIGHT_ESCALATION_CRON}, timezone: ${env.TIMEZONE}`,
  );
}

module.exports = {
  setupScheduler,
};

const {
  sendDailyReminder,
  checkMissingDailyAtNoon,
  escalateUnpaidPenaltiesAtMidnight,
} = require("../services/penaltyService");
const { handleStandupReply } = require("../services/standupService");

function registerMessageCreateEvent(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content === "!daily-test") {
      await sendDailyReminder(client);
      return;
    }

    if (message.content === "!daily-check") {
      await checkMissingDailyAtNoon(client);
      await message.react("✅");
      return;
    }

    if (message.content === "!fine-check") {
      await escalateUnpaidPenaltiesAtMidnight(client);
      await message.react("✅");
      return;
    }

    await handleStandupReply(message);
  });
}

module.exports = {
  registerMessageCreateEvent,
};

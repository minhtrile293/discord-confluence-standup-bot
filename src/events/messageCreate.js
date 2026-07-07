const {
  sendDailyReminder,
  checkMissingDailyAtNoon,
  escalateUnpaidPenaltiesAtMidnight,
} = require("../services/penaltyService");
const { handleStandupReply } = require("../services/standupService");
const {
  isMeetingNoteCandidate,
} = require("../services/meetingNoteTaskService");
const {
  handleMeetingNoteMessage,
  handleJiraEditCommand,
} = require("../services/jiraTaskDraftService");

function registerMessageCreateEvent(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    try {
      if (message.content === "!daily-test") {
        await sendDailyReminder(client);
        await message.react("✅");
        return;
      }

      if (message.content === "!daily-check") {
        const result = await checkMissingDailyAtNoon(client);
        await message.react("✅");

        if (result?.success === false) {
          await message.reply(
            "❌ Bot không đọc được Confluence nên chưa check phạt để tránh phạt nhầm.",
          );
          return;
        }

        if (result?.allSubmitted) {
          await message.reply(
            `✅ Tất cả thành viên đã cập nhật daily-standup ngày **${result.dateInfo.displayDate}**.`,
          );
          return;
        }

        const missingList = result.missingMembers
          .map((member) => `<@${member.discordId}>`)
          .join(", ");

        await message.reply({
          content: `⚠️ Đã check daily-standup ngày **${result.dateInfo.displayDate}**.

Các thành viên chưa cập nhật:
${missingList}

Bot đã gửi tin nhắn vi phạm trong thread daily.`,
          allowedMentions: {
            users: result.missingMembers.map((member) => member.discordId),
          },
        });
        return;
      }

      if (message.content === "!fine-check") {
        await escalateUnpaidPenaltiesAtMidnight(client);
        await message.react("✅");
        return;
      }

      const handledJiraEdit = await handleJiraEditCommand(message);

      if (handledJiraEdit) {
        return;
      }

      if (isMeetingNoteCandidate(message)) {
        await handleMeetingNoteMessage(message);
        return;
      }

      await handleStandupReply(message);
    } catch (error) {
      console.error("messageCreate error:", error);
      await message.reply("❌ Bot bị lỗi khi xử lý message. Check log PM2.");
    }
  });
}

module.exports = { registerMessageCreateEvent };

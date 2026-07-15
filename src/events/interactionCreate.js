const {
  handleJiraButtonInteraction,
} = require("../services/jiraTaskDraftService");

function registerInteractionCreateEvent(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      const handled = await handleJiraButtonInteraction(interaction);

      if (handled) return;
    } catch (error) {
      console.error("interactionCreate error:", error);

      const alreadyHandled =
        interaction.replied ||
        interaction.deferred ||
        error?.code === 10062 ||
        error?.code === 40060;

      if (alreadyHandled) {
        return;
      }

      try {
        await interaction.reply({
          content: "❌ Bot xử lý interaction bị lỗi. Check log terminal/PM2.",
          ephemeral: true,
        });
      } catch (replyError) {
        console.error("Cannot reply to failed interaction:", replyError.message);
      }
    }
  });
}

module.exports = { registerInteractionCreateEvent };

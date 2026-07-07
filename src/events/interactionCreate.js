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

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Bot xử lý interaction bị lỗi. Check log PM2.",
          ephemeral: true,
        });
      }
    }
  });
}

module.exports = { registerInteractionCreateEvent };

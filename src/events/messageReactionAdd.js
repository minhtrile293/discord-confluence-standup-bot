const { handlePenaltyReaction } = require("../services/penaltyService");

function registerMessageReactionAddEvent(client) {
  client.on("messageReactionAdd", async (reaction, user) => {
    await handlePenaltyReaction(reaction, user);
  });
}

module.exports = {
  registerMessageReactionAddEvent,
};

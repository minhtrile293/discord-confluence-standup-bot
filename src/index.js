const { env, validateEnv } = require("./config/env");
const { client } = require("./clients/discordClient");
const { setupScheduler } = require("./jobs/scheduler");
const { registerMessageCreateEvent } = require("./events/messageCreate");
const {
  registerMessageReactionAddEvent,
} = require("./events/messageReactionAdd");
const {
  registerInteractionCreateEvent,
} = require("./events/interactionCreate");
const { logLlmStartupConfig } = require("./services/llmService");

async function startBot(botClient = client) {
  validateEnv();

  if (!env.CHATBOT_ENABLED) {
    botClient.once("ready", () => {
      botClient.user.setPresence({ status: "invisible" });
      console.log(
        `Chatbot is disabled by environment. Connected as ${botClient.user.tag} with invisible status.`,
      );
    });

    await botClient.login(env.DISCORD_BOT_TOKEN);
    return;
  }

  logLlmStartupConfig();

  registerMessageCreateEvent(botClient);
  registerMessageReactionAddEvent(botClient);
  registerInteractionCreateEvent(botClient);

  botClient.once("ready", () => {
    console.log(`Logged in as ${botClient.user.tag}`);
    setupScheduler(botClient);
  });

  await botClient.login(env.DISCORD_BOT_TOKEN);
}

if (require.main === module) {
  startBot().catch((error) => {
    console.error("Cannot start chatbot:", error);
    process.exitCode = 1;
  });
}

module.exports = { startBot };

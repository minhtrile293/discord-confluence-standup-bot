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

  if (!env.DSU_ENABLED && !env.JIRA_ENABLED) {
    botClient.once("ready", () => {
      botClient.user.setPresence({ status: "invisible" });
      console.log(
        `DSU and Jira are both disabled by environment. Connected as ${botClient.user.tag} with invisible status.`,
      );
    });

    await botClient.login(env.DISCORD_BOT_TOKEN);
    return;
  }

  if (env.JIRA_ENABLED) {
    logLlmStartupConfig();
    registerInteractionCreateEvent(botClient);
  }

  if (env.DSU_ENABLED) {
    registerMessageReactionAddEvent(botClient);
  }

  registerMessageCreateEvent(botClient);

  botClient.once("ready", () => {
    console.log(
      `Logged in as ${botClient.user.tag} (DSU: ${env.DSU_ENABLED ? "on" : "off"}, Jira: ${env.JIRA_ENABLED ? "on" : "off"})`,
    );

    if (env.DSU_ENABLED) {
      setupScheduler(botClient);
    }
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

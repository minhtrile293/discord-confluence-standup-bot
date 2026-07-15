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

validateEnv();
logLlmStartupConfig();

registerMessageCreateEvent(client);
registerMessageReactionAddEvent(client);
registerInteractionCreateEvent(client);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  setupScheduler(client);
});

client.login(env.DISCORD_BOT_TOKEN);

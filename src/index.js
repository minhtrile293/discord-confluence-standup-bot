const { env, validateEnv } = require("./config/env");
const { client } = require("./clients/discordClient");
const { setupScheduler } = require("./jobs/scheduler");
const { registerMessageCreateEvent } = require("./events/messageCreate");
const {
  registerMessageReactionAddEvent,
} = require("./events/messageReactionAdd");

validateEnv();

registerMessageCreateEvent(client);
registerMessageReactionAddEvent(client);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  setupScheduler(client);
});

client.login(env.DISCORD_BOT_TOKEN);

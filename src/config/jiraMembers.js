const JIRA_MEMBERS_BY_DISCORD_ID = {
  "1148282290783395873": {
    displayName: "Trí Lê Minh",
    aliases: ["Lê Trí", "Le Tri", "@Lê Trí", "@Le Tri"],
    jiraAccountId: "712020:277b2ce3-3e3b-4cd2-84bc-dd94106d9593",
  },

  "756520490113302650": {
    displayName: "Minh Luân",
    aliases: ["Minh Luân", "Minh Luan", "Luân", "Luan", "@Luân", "@Luan"],
    jiraAccountId: "712020:dfdd5e79-6ea0-4832-93d4-91afe451fe4b",
  },

  "794539061351677952": {
    displayName: "Gia Âu",
    aliases: [
      "Gia Âu",
      "Gia Au",
      "Âu",
      "Au",
      "@Gia Âu",
      "@Gia Au",
      "@Âu",
      "@Au",
    ],
    jiraAccountId: "712020:2b18ac31-bd38-45a0-9d0f-b413fa183725",
  },

  "871672239861403660": {
    displayName: "Đỗ Văn Hà",
    aliases: ["Hà", "Ha", "@Đỗ Hà", "@Do Ha", "@Hà", "@Ha"],
    jiraAccountId: "712020:e75855e3-d717-4372-a1db-6e221f284569",
  },

  "974881436408643604": {
    displayName: "Đỗ Nguyễn Minh Trí",
    aliases: ["Đỗ Trí", "Do Tri", "@Đỗ Trí", "@Do Tri"],
    jiraAccountId: "712020:15c55e4d-a281-494f-9fa9-99d423125a97",
  },
};

function getJiraMemberByDiscordId(discordId) {
  return JIRA_MEMBERS_BY_DISCORD_ID[String(discordId)] || null;
}

function getLlmMemberDirectory() {
  return Object.entries(JIRA_MEMBERS_BY_DISCORD_ID).map(
    ([discordId, member]) => ({
      discordId,
      displayName: member.displayName,
      aliases: member.aliases || [],
    }),
  );
}

module.exports = {
  JIRA_MEMBERS_BY_DISCORD_ID,
  getJiraMemberByDiscordId,
  getLlmMemberDirectory,
};

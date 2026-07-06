const TEAM_MEMBERS = [
  {
    discordId: "794539061351677952",
    displayName: "Gia Âu Huỳnh",
    confluenceAccountId: "712020:2b18ac31-bd38-45a0-9d0f-b413fa183725",
  },
  {
    discordId: "DISCORD_USER_ID_MINH_LUAN",
    displayName: "Nguyễn Minh Luân",
    confluenceAccountId: "712020:dfdd5e79-6ea0-4832-93d4-91afe451fe4b",
  },
  {
    discordId: "871672239861403660",
    displayName: "Đỗ Văn Hà",
    confluenceAccountId: "712020:e75855e3-d717-4372-a1db-6e221f284569",
  },
  {
    discordId: "1148282290783395873",
    displayName: "Trí Lê Minh",
    confluenceAccountId: "712020:277b2ce3-3e3b-4cd2-84bc-dd94106d9593",
  },
  {
    discordId: "974881436408643604",
    displayName: "Đỗ Nguyễn Minh Trí",
    confluenceAccountId: "712020:15c55e4d-a281-494f-9fa9-99d423125a97",
  },
];

const USER_MAP = Object.fromEntries(
  TEAM_MEMBERS.map((member) => [member.discordId, member]),
);

module.exports = {
  TEAM_MEMBERS,
  USER_MAP,
};

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

let cachedAliasIndex = null;

function normalizeForAliasMatch(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getSortedAliasIndex() {
  if (cachedAliasIndex) return cachedAliasIndex;

  const entries = [];

  for (const [discordId, member] of Object.entries(JIRA_MEMBERS_BY_DISCORD_ID)) {
    for (const alias of member.aliases || []) {
      const trimmedAlias = String(alias).trim();
      if (!trimmedAlias) continue;

      entries.push({
        discordId,
        alias: trimmedAlias,
        normalizedAlias: normalizeForAliasMatch(
          trimmedAlias.replace(/^@/, ""),
        ),
        hasAtPrefix: trimmedAlias.startsWith("@"),
      });
    }
  }

  cachedAliasIndex = entries.sort(
    (left, right) => right.normalizedAlias.length - left.normalizedAlias.length,
  );

  return cachedAliasIndex;
}

function normalizeDiscordMention(text) {
  const match = String(text || "").match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function matchAliasCandidate(candidate, aliasIndex = getSortedAliasIndex()) {
  const normalizedCandidate = normalizeForAliasMatch(
    String(candidate || "").replace(/^@/, ""),
  );

  if (!normalizedCandidate) return null;

  for (const entry of aliasIndex) {
    if (normalizedCandidate === entry.normalizedAlias) {
      return entry.discordId;
    }
  }

  return null;
}

function extractAssigneeCandidates(text) {
  const candidates = [];
  const line = String(text || "");

  for (const match of line.matchAll(/\(([^)]+)\)/g)) {
    candidates.push(match[1].trim());
  }

  for (const match of line.matchAll(/@([^\s@][^@\[\]\n]*?)(?=\s*[\[\d]|$)/gu)) {
    candidates.push(match[1].trim());
  }

  const arrowMatches = [...line.matchAll(/→\s*([^→\n]+?)(?=\s*(?:→|\[|\d{1,2}\/|$))/g)];
  for (const match of arrowMatches) {
    candidates.push(match[1].trim());
  }

  return candidates;
}

function matchAliasInText(text, aliasIndex = getSortedAliasIndex()) {
  const normalizedText = normalizeForAliasMatch(text);

  for (const entry of aliasIndex) {
    const patterns = entry.hasAtPrefix
      ? [`@${entry.normalizedAlias}`]
      : [`@${entry.normalizedAlias}`, entry.normalizedAlias];

    for (const pattern of [...new Set(patterns)]) {
      if (!pattern) continue;

      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(
        `(?:^|[\\s(,→\\[])${escaped}(?:[\\s\\[\\])→,.]|$)`,
      );

      if (regex.test(normalizedText)) {
        return entry.discordId;
      }
    }
  }

  return null;
}

function resolveAssigneeDiscordIdFromText(text) {
  const mentionId = normalizeDiscordMention(text);
  if (mentionId) return mentionId;

  const aliasIndex = getSortedAliasIndex();

  for (const candidate of extractAssigneeCandidates(text)) {
    const discordId = matchAliasCandidate(candidate, aliasIndex);
    if (discordId) return discordId;
  }

  return matchAliasInText(text, aliasIndex);
}

function stripAssigneeMarkersFromLine(line) {
  let result = String(line || "");
  result = result.replace(/<@!?\d+>/g, "");

  for (const entry of getSortedAliasIndex()) {
    const variants = entry.hasAtPrefix
      ? [entry.alias]
      : [entry.alias, `@${entry.alias}`];

    for (const variant of variants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(
        new RegExp(`\\(\\s*${escaped}\\s*\\)`, "giu"),
        " ",
      );
      result = result.replace(
        new RegExp(`(?:^|[\\s(,→\\[])@?${escaped}(?=[\\s\\[\\])→,.]|$)`, "giu"),
        " ",
      );
    }
  }

  return result;
}

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
  resolveAssigneeDiscordIdFromText,
  stripAssigneeMarkersFromLine,
};

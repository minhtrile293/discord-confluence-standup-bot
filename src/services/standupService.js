const cheerio = require("cheerio");
const { USER_MAP, TEAM_MEMBERS } = require("../config/teamMembers");
const { escapeHtml, escapeRegex, toConfluenceCell } = require("../utils/html");
const { getStandupTemplate } = require("../messages/templates");
const { getDateInfo } = require("../utils/date");
const {
  getConfluencePage,
  updateConfluencePage,
} = require("./confluenceService");
const { markUserSubmitted } = require("../storage/penaltyStore");

function extractSection(content, sectionName, nextSectionNames) {
  const nextPattern = nextSectionNames.map((name) => `${name}\\s*:`).join("|");

  const regex = new RegExp(
    `${sectionName}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextPattern})|$)`,
    "i",
  );

  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

function parseStandupMessage(content) {
  const priorities = extractSection(content, "Priorities", [
    "Progress",
    "Problems?",
  ]);

  const progress = extractSection(content, "Progress", ["Problems?"]);

  const problems = extractSection(content, "Problems?", []);

  if (!priorities && !progress && !problems) {
    return null;
  }

  return {
    priorities: priorities || "N/A",
    progress: progress || "N/A",
    problems: problems || "N/A",
  };
}

function getUserInfoFromDiscordMessage(message) {
  const mappedUser = USER_MAP[message.author.id];

  if (mappedUser) {
    return mappedUser;
  }

  return {
    discordId: message.author.id,
    displayName: message.member?.displayName || message.author.username,
    confluenceAccountId: null,
  };
}

function buildDailySectionHtml(dateInfo) {
  return `
<h2>📅 ${escapeHtml(dateInfo.weekday)} <span style="color: rgb(0,184,217);">&lt;${escapeHtml(dateInfo.displayDate)}&gt;</span></h2>
<table data-table-width="760" data-layout="default">
  <colgroup>
    <col />
    <col style="width: 170.0px;" />
    <col style="width: 170.0px;" />
    <col style="width: 170.0px;" />
    <col style="width: 170.0px;" />
  </colgroup>
  <tbody>
    <tr>
      <th class="numberingColumn" />
      <th><p><strong>Name</strong></p></th>
      <th><p><strong>Priorities</strong> 🧐</p></th>
      <th><p><strong>Progress</strong> 😊</p></th>
      <th><p><strong>Problems</strong> 😐</p></th>
    </tr>
  </tbody>
</table>
`;
}

function findDailyTableRange(storageValue, dateInfo) {
  const rawDate = escapeRegex(dateInfo.rawDateToken);
  const encodedDate = escapeRegex(dateInfo.encodedDateToken);

  const headingRegex = new RegExp(
    `<h2\\b[^>]*>[\\s\\S]*?(?:${rawDate}|${encodedDate})[\\s\\S]*?<\\/h2>`,
    "i",
  );

  const headingMatch = headingRegex.exec(storageValue);

  if (!headingMatch) {
    return null;
  }

  const headingEndIndex = headingMatch.index + headingMatch[0].length;
  const nextHeadingIndex = storageValue.indexOf("<h2", headingEndIndex);
  const tableStartIndex = storageValue.indexOf("<table", headingEndIndex);

  if (tableStartIndex === -1) {
    return null;
  }

  if (nextHeadingIndex !== -1 && nextHeadingIndex < tableStartIndex) {
    return null;
  }

  const tableEndTag = "</table>";
  const tableEndIndex = storageValue.indexOf(tableEndTag, tableStartIndex);

  if (tableEndIndex === -1) {
    return null;
  }

  return {
    tableStartIndex,
    tableEndIndex: tableEndIndex + tableEndTag.length,
  };
}

function ensureDailySection(storageValue, dateInfo) {
  const range = findDailyTableRange(storageValue, dateInfo);

  if (range) {
    return storageValue;
  }

  return `${storageValue}\n${buildDailySectionHtml(dateInfo)}`;
}

function nameCellHasConfluenceAccountId($, nameCell, confluenceAccountId) {
  if (!confluenceAccountId) {
    return false;
  }

  const html = nameCell.html() || "";

  return (
    html.includes(`ri:account-id="${confluenceAccountId}"`) ||
    html.includes(`ri\\:account-id="${confluenceAccountId}"`)
  );
}

function isNameCellEmpty($, nameCell) {
  const text = nameCell.text().trim();
  const html = nameCell.html() || "";

  const hasConfluenceUserMention =
    html.includes("<ri:user") ||
    html.includes("<ri\\:user") ||
    html.includes("ri:account-id") ||
    html.includes("ri\\:account-id");

  return text === "" && !hasConfluenceUserMention;
}

function buildNameCellHtml(userInfo) {
  if (userInfo.confluenceAccountId) {
    return `<p><ac:link><ri:user ri:account-id="${escapeHtml(userInfo.confluenceAccountId)}" /></ac:link> </p>`;
  }

  return `<p>${escapeHtml(userInfo.displayName)}</p>`;
}

function buildStandupRowHtml(rowNumber, userInfo, standup) {
  return `
<tr>
  <td class="numberingColumn">${rowNumber}</td>
  <td>${buildNameCellHtml(userInfo)}</td>
  <td><p>${toConfluenceCell(standup.priorities)}</p></td>
  <td><p>${toConfluenceCell(standup.progress)}</p></td>
  <td><p>${toConfluenceCell(standup.problems)}</p></td>
</tr>
`;
}

function updateRowCells($, rowEl, userInfo, standup, shouldUpdateNameCell) {
  const cells = rowEl.find("td");

  if (shouldUpdateNameCell) {
    cells.eq(1).html(buildNameCellHtml(userInfo));
  }

  cells.eq(2).html(`<p>${toConfluenceCell(standup.priorities)}</p>`);
  cells.eq(3).html(`<p>${toConfluenceCell(standup.progress)}</p>`);
  cells.eq(4).html(`<p>${toConfluenceCell(standup.problems)}</p>`);
}

function isDailyContentFilled($, rowEl) {
  const cells = rowEl.find("td");

  const priorities = cells.eq(2).text().trim();
  const progress = cells.eq(3).text().trim();
  const problems = cells.eq(4).text().trim();

  return Boolean(priorities || progress || problems);
}

function upsertStandupRowInTable(tableHtml, userInfo, standup) {
  const $ = cheerio.load(
    tableHtml,
    {
      xmlMode: true,
      decodeEntities: false,
    },
    false,
  );

  const table = $("table").first();

  if (!table.length) {
    throw new Error("Cannot parse today's table.");
  }

  const tbody = table.find("tbody").first();

  if (!tbody.length) {
    throw new Error("Cannot find tbody in today's table.");
  }

  const rows = tbody.find("tr").toArray();

  let existingRow = null;
  let firstEmptyRow = null;
  let lastNumber = 0;

  rows.forEach((row, index) => {
    if (index === 0) return;

    const rowEl = $(row);
    const cells = rowEl.find("td");

    if (cells.length < 5) return;

    const numberText = cells.eq(0).text().trim();
    const number = Number(numberText);

    if (!Number.isNaN(number)) {
      lastNumber = Math.max(lastNumber, number);
    }

    const nameCell = cells.eq(1);
    const nameText = nameCell.text().trim();

    const isSameConfluenceUser = nameCellHasConfluenceAccountId(
      $,
      nameCell,
      userInfo.confluenceAccountId,
    );

    const isSamePlainTextUser =
      nameText === userInfo.displayName ||
      nameText.includes(userInfo.displayName);

    if (isSameConfluenceUser || isSamePlainTextUser) {
      existingRow = rowEl;
      return;
    }

    if (!firstEmptyRow && isNameCellEmpty($, nameCell)) {
      firstEmptyRow = rowEl;
    }
  });

  if (existingRow) {
    updateRowCells($, existingRow, userInfo, standup, false);
  } else if (firstEmptyRow) {
    updateRowCells($, firstEmptyRow, userInfo, standup, true);
  } else {
    const nextNumber = lastNumber + 1;
    tbody.append(buildStandupRowHtml(nextNumber, userInfo, standup));
  }

  return $.xml(table);
}

function upsertStandupRowInStorage(storageValue, dateInfo, userInfo, standup) {
  const storageWithDailySection = ensureDailySection(storageValue, dateInfo);
  const range = findDailyTableRange(storageWithDailySection, dateInfo);

  if (!range) {
    throw new Error(
      `Cannot find daily standup table for ${dateInfo.rawDateToken}.`,
    );
  }

  const tableHtml = storageWithDailySection.slice(
    range.tableStartIndex,
    range.tableEndIndex,
  );

  const updatedTableHtml = upsertStandupRowInTable(
    tableHtml,
    userInfo,
    standup,
  );

  return (
    storageWithDailySection.slice(0, range.tableStartIndex) +
    updatedTableHtml +
    storageWithDailySection.slice(range.tableEndIndex)
  );
}

function getSubmittedDiscordIdsFromStorage(storageValue, dateInfo) {
  const range = findDailyTableRange(storageValue, dateInfo);

  if (!range) {
    return [];
  }

  const tableHtml = storageValue.slice(
    range.tableStartIndex,
    range.tableEndIndex,
  );

  const $ = cheerio.load(
    tableHtml,
    {
      xmlMode: true,
      decodeEntities: false,
    },
    false,
  );

  const submittedIds = [];

  $("tbody tr").each((index, row) => {
    if (index === 0) return;

    const rowEl = $(row);
    const cells = rowEl.find("td");

    if (cells.length < 5) return;
    if (!isDailyContentFilled($, rowEl)) return;

    const nameCell = cells.eq(1);
    const nameText = nameCell.text().trim();

    for (const member of TEAM_MEMBERS) {
      const isSameConfluenceUser = nameCellHasConfluenceAccountId(
        $,
        nameCell,
        member.confluenceAccountId,
      );

      const isSamePlainTextUser =
        nameText === member.displayName ||
        nameText.includes(member.displayName);

      if (isSameConfluenceUser || isSamePlainTextUser) {
        submittedIds.push(member.discordId);
      }
    }
  });

  return [...new Set(submittedIds)];
}

async function handleStandupReply(message) {
  const channel = message.channel;
  const dateInfo = getDateInfo();

  if (!channel.isThread()) return;
  if (channel.parentId !== process.env.DISCORD_DAILY_CHANNEL_ID) return;
  if (channel.name !== dateInfo.threadName) return;

  const standup = parseStandupMessage(message.content);

  if (!standup) {
    await message.reply(
      `⚠️ Format chưa đúng. Vui lòng copy đúng format này:

\`\`\`text
${getStandupTemplate()}
\`\`\``,
    );
    return;
  }

  const userInfo = getUserInfoFromDiscordMessage(message);

  try {
    const page = await getConfluencePage();
    const currentStorage = page.body.storage.value;

    const newStorage = upsertStandupRowInStorage(
      currentStorage,
      dateInfo,
      userInfo,
      standup,
    );

    await updateConfluencePage(
      page,
      newStorage,
      `Update daily standup for ${userInfo.displayName} - ${dateInfo.displayDate}`,
    );

    markUserSubmitted(dateInfo.key, message.author.id, channel.id);

    await message.react("✅");
  } catch (error) {
    console.error(error.response?.data || error.message);

    await message.reply(
      "❌ Bot chưa update được Confluence. Check terminal log giúp mình.",
    );
  }
}

module.exports = {
  parseStandupMessage,
  handleStandupReply,
  getSubmittedDiscordIdsFromStorage,
};

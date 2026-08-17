const fs = require("fs");
const path = require("path");

const { env } = require("../config/env");
const { TEAM_MEMBERS } = require("../config/teamMembers");
const { getDateInfo } = require("../utils/date");
const { formatMoney } = require("../utils/money");
const {
  buildDailyReminderMessage,
  buildThreadTemplateMessage,
  buildPenaltyMessage,
} = require("../messages/templates");
const {
  loadPenaltyState,
  savePenaltyState,
  getTodayState,
  getPenaltyKey,
} = require("../storage/penaltyStore");
const { getConfluencePage } = require("./confluenceService");
const { getSubmittedDiscordIdsFromStorage } = require("./standupService");

function getQrFilePath() {
  if (!env.PAYMENT_QR_FILE_PATH) {
    return null;
  }

  const qrPath = path.isAbsolute(env.PAYMENT_QR_FILE_PATH)
    ? env.PAYMENT_QR_FILE_PATH
    : path.resolve(process.cwd(), env.PAYMENT_QR_FILE_PATH);

  if (!fs.existsSync(qrPath)) {
    console.warn(`QR file not found: ${qrPath}`);
    return null;
  }

  return qrPath;
}

async function fetchThreadById(client, threadId) {
  if (!threadId) return null;

  try {
    const thread = await client.channels.fetch(threadId);

    if (thread?.isThread()) {
      if (thread.archived) {
        await thread.setArchived(false);
      }

      return thread;
    }

    return null;
  } catch (error) {
    console.error("Cannot fetch thread:", error.message);
    return null;
  }
}

async function findActiveDailyThread(channel, threadName) {
  const activeThreads = await channel.threads.fetchActive();

  const thread = activeThreads.threads.find((item) => item.name === threadName);

  return thread || null;
}

async function getOrCreateDailyThread(client, dateInfo) {
  const state = loadPenaltyState();
  const todayState = getTodayState(state, dateInfo.key);

  let thread = await fetchThreadById(client, todayState.threadId);

  if (thread) {
    return thread;
  }

  const channel = await client.channels.fetch(env.DISCORD_DAILY_CHANNEL_ID);

  thread = await findActiveDailyThread(channel, dateInfo.threadName);

  if (thread) {
    todayState.threadId = thread.id;
    savePenaltyState(state);
    return thread;
  }

  const message = await channel.send({
    content: buildDailyReminderMessage(dateInfo),
    allowedMentions: {
      parse: ["everyone"],
    },
  });

  thread = await message.startThread({
    name: dateInfo.threadName,
    autoArchiveDuration: 1440,
  });

  await thread.send({
    content: buildThreadTemplateMessage(),
  });

  todayState.threadId = thread.id;
  savePenaltyState(state);

  return thread;
}

async function sendDailyReminder(client) {
  const dateInfo = getDateInfo();
  await getOrCreateDailyThread(client, dateInfo);
}

async function sendPenaltyMessage(
  thread,
  member,
  amount,
  dateInfo,
  isEscalation = false,
) {
  const payload = {
    content: buildPenaltyMessage(member, amount, dateInfo, isEscalation),
    allowedMentions: {
      users: [member.discordId],
    },
  };

  const qrPath = getQrFilePath();

  if (qrPath) {
    payload.files = [qrPath];
  }

  const message = await thread.send(payload);

  try {
    await message.react("❤️");
  } catch (error) {
    console.error("Cannot react to penalty message:", error.message);
  }

  return message;
}

function createOrUpdatePenaltyRecord(state, dateInfo, member, message, amount) {
  const penaltyKey = getPenaltyKey(dateInfo.key, member.discordId);

  if (!state.penalties[penaltyKey]) {
    state.penalties[penaltyKey] = {
      dateKey: dateInfo.key,
      displayDate: dateInfo.displayDate,
      discordId: member.discordId,
      displayName: member.displayName,
      amount,
      status: "unpaid",
      createdAt: new Date().toISOString(),
      paidAt: null,
      threadId: message.channel.id,
      messageIds: [],
      escalationCount: 0,
      lastEscalatedAt: null,
    };
  }

  state.penalties[penaltyKey].amount = amount;
  state.penalties[penaltyKey].threadId = message.channel.id;

  if (!state.penalties[penaltyKey].messageIds.includes(message.id)) {
    state.penalties[penaltyKey].messageIds.push(message.id);
  }

  return state.penalties[penaltyKey];
}

/**
 * Nguồn chính để biết ai đã cập nhật daily là Confluence.
 *
 * Lý do:
 * - penalties.json chỉ là local state để lưu thread/phạt.
 * - Nếu user xoá hoặc sửa daily trên Confluence, bot phải đọc lại Confluence thật.
 * - Tránh lỗi: đã xoá update trên Confluence nhưng bot vẫn tưởng đã cập nhật.
 *
 * Nếu không đọc được Confluence thì return null để tránh phạt nhầm cả team.
 */
async function getSubmittedMembersFromConfluence(dateInfo) {
  try {
    const page = await getConfluencePage();

    return getSubmittedDiscordIdsFromStorage(page.body.storage.value, dateInfo);
  } catch (error) {
    console.error(
      "Cannot read submitted members from Confluence:",
      error.response?.data || error.message,
    );

    return null;
  }
}

async function checkMissingDailyAtNoon(client) {
  const dateInfo = getDateInfo();
  const state = loadPenaltyState();
  const todayState = getTodayState(state, dateInfo.key);

  const submittedDiscordIds = await getSubmittedMembersFromConfluence(dateInfo);

  /**
   * Fail-safe:
   * Nếu bot không đọc được Confluence thì không phạt ai.
   */
  if (!submittedDiscordIds) {
    savePenaltyState(state);

    return {
      success: false,
      reason: "cannot_read_confluence",
      allSubmitted: false,
      missingMembers: [],
      dateInfo,
    };
  }

  /**
   * Ghi đè lại submittedDiscordIds bằng dữ liệu thật từ Confluence.
   * Đây là điểm sửa quan trọng.
   */
  todayState.submittedDiscordIds = submittedDiscordIds;

  const missingMembers = TEAM_MEMBERS.filter(
    (member) => !submittedDiscordIds.includes(member.discordId),
  );

  if (missingMembers.length === 0) {
    console.log(
      `[${dateInfo.displayDate}] Everyone has updated daily standup.`,
    );

    savePenaltyState(state);

    return {
      success: true,
      allSubmitted: true,
      missingMembers: [],
      dateInfo,
    };
  }

  const thread = await getOrCreateDailyThread(client, dateInfo);

  for (const member of missingMembers) {
    const penaltyKey = getPenaltyKey(dateInfo.key, member.discordId);
    const existingPenalty = state.penalties[penaltyKey];

    /**
     * Nếu hôm nay đã tạo penalty cho người này rồi thì không gửi trùng.
     */
    if (existingPenalty) {
      continue;
    }

    const penaltyMessage = await sendPenaltyMessage(
      thread,
      member,
      env.FINE_AMOUNT,
      dateInfo,
      false,
    );

    createOrUpdatePenaltyRecord(
      state,
      dateInfo,
      member,
      penaltyMessage,
      env.FINE_AMOUNT,
    );
  }

  savePenaltyState(state);

  return {
    success: true,
    allSubmitted: false,
    missingMembers,
    dateInfo,
  };
}

async function escalateUnpaidPenaltiesAtMidnight(client) {
  const state = loadPenaltyState();

  const unpaidPenalties = Object.entries(state.penalties).filter(
    ([, penalty]) => penalty.status === "unpaid",
  );

  if (unpaidPenalties.length === 0) {
    console.log("No unpaid penalties to escalate.");

    return {
      success: true,
      escalatedPenalties: [],
    };
  }

  const escalatedPenalties = [];

  for (const [penaltyKey, penalty] of unpaidPenalties) {
    const member = TEAM_MEMBERS.find(
      (item) => item.discordId === penalty.discordId,
    );

    if (!member) {
      console.error(`Cannot find team member for penalty ${penaltyKey}`);
      continue;
    }

    const thread = await fetchThreadById(client, penalty.threadId);

    if (!thread) {
      console.error(`Cannot find thread for penalty ${penaltyKey}`);
      continue;
    }

    const dateInfo = {
      key: penalty.dateKey,
      displayDate: penalty.displayDate,
      threadName: thread.name,
    };

    penalty.amount += env.FINE_AMOUNT;
    penalty.escalationCount += 1;
    penalty.lastEscalatedAt = new Date().toISOString();

    const penaltyMessage = await sendPenaltyMessage(
      thread,
      member,
      penalty.amount,
      dateInfo,
      true,
    );

    if (!penalty.messageIds.includes(penaltyMessage.id)) {
      penalty.messageIds.push(penaltyMessage.id);
    }

    escalatedPenalties.push({
      penaltyKey,
      member,
      amount: penalty.amount,
    });
  }

  savePenaltyState(state);

  return {
    success: true,
    escalatedPenalties,
  };
}

async function handlePenaltyReaction(reaction, user) {
  if (user.bot) return;

  try {
    if (reaction.partial) {
      await reaction.fetch();
    }

    if (reaction.message.partial) {
      await reaction.message.fetch();
    }
  } catch (error) {
    console.error("Cannot fetch partial reaction/message:", error.message);
    return;
  }

  const emojiName = reaction.emoji.name;

  if (emojiName !== "❤️" && emojiName !== "❤") {
    return;
  }

  const state = loadPenaltyState();
  let matchedPenalty = null;
  let matchedPenaltyKey = null;

  for (const [penaltyKey, penalty] of Object.entries(state.penalties)) {
    if (
      penalty.status === "unpaid" &&
      penalty.discordId === user.id &&
      penalty.messageIds.includes(reaction.message.id)
    ) {
      matchedPenalty = penalty;
      matchedPenaltyKey = penaltyKey;
      break;
    }
  }

  if (!matchedPenalty) {
    return;
  }

  matchedPenalty.status = "paid";
  matchedPenalty.paidAt = new Date().toISOString();

  savePenaltyState(state);

  await reaction.message.reply({
    content: `✅ Đã ghi nhận <@${user.id}> đã đóng phạt daily-standup ngày **${matchedPenalty.displayDate}**.

**Tổng tiền đã ghi nhận:** ${formatMoney(matchedPenalty.amount)}`,
    allowedMentions: {
      users: [user.id],
    },
  });

  console.log(`Penalty paid: ${matchedPenaltyKey}`);
}

module.exports = {
  sendDailyReminder,
  checkMissingDailyAtNoon,
  escalateUnpaidPenaltiesAtMidnight,
  handlePenaltyReaction,
};

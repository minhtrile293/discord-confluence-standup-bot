const axios = require("axios");
const { env } = require("../config/env");
const {
  resolveAssigneeDiscordIdFromText,
  stripAssigneeMarkersFromLine,
} = require("../config/jiraMembers");
const { getDateInfo } = require("../utils/date");

const MAX_MEETING_NOTE_ATTACHMENT_BYTES = 256 * 1024;

function normalizeMention(text) {
  return resolveAssigneeDiscordIdFromText(text);
}

function parseStoryPoint(text) {
  const match = String(text || "").match(/\[(\d+(?:\.\d+)?)\s*sp\]/i);
  return match ? Number(match[1]) : null;
}

function parseDueDate(text) {
  const slashMatch = String(text || "").match(
    /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  );
  const dotMatch = String(text || "").match(
    /(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/,
  );
  const match = slashMatch || dotMatch;

  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);

  let year;

  if (match[3]) {
    year = Number(match[3]);
    if (year < 100) year += 2000;
  } else {
    year = Number(getDateInfo().key.slice(0, 4));
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");

  return `${year}-${mm}-${dd}`;
}

function cleanTaskTitle(line) {
  return stripAssigneeMarkersFromLine(line)
    .replace(/\[\d+(?:\.\d+)?\s*sp\]/gi, "")
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, "")
    .replace(/\d{1,2}\.\d{1,2}(?:\.\d{2,4})?/g, "")
    .replace(/→/g, " ")
    .replace(/^-+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractActionText(content) {
  const lines = String(content || "").split(/\r?\n/);

  const headerIndex = lines.findIndex((line) =>
    line.trim().toLowerCase().startsWith("việc cần làm"),
  );

  if (headerIndex === -1) {
    return content;
  }

  return lines.slice(headerIndex + 1).join("\n");
}

function hasParentTaskLine(content) {
  return String(content || "")
    .split(/\r?\n/)
    .some((line) => line.trim().startsWith("- "));
}

function hasActionHeader(content) {
  return String(content || "")
    .toLowerCase()
    .includes("việc cần làm");
}

function isTextAttachment(attachment) {
  const fileName = String(attachment.name || "").toLowerCase();
  const contentType = String(attachment.contentType || "").toLowerCase();

  return (
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md") ||
    contentType.includes("text/plain") ||
    contentType.includes("text/markdown")
  );
}

function getTextAttachments(message) {
  return Array.from(message.attachments.values()).filter(isTextAttachment);
}

async function readTextAttachment(attachment) {
  if (attachment.size > MAX_MEETING_NOTE_ATTACHMENT_BYTES) {
    throw new Error(
      `File ${attachment.name} quá lớn. Giới hạn hiện tại là ${
        MAX_MEETING_NOTE_ATTACHMENT_BYTES / 1024
      }KB.`,
    );
  }

  const response = await axios.get(attachment.url, {
    responseType: "text",
    timeout: 15000,
    maxContentLength: MAX_MEETING_NOTE_ATTACHMENT_BYTES,
    transformResponse: [(data) => data],
  });

  return String(response.data || "").replace(/^\uFEFF/, "");
}

async function getMeetingNoteContent(message) {
  const parts = [];
  const messageContent = String(message.content || "").trim();
  const textAttachments = getTextAttachments(message);

  if (messageContent) {
    parts.push(messageContent);
  }

  for (const attachment of textAttachments) {
    const attachmentText = await readTextAttachment(attachment);

    if (attachmentText.trim()) {
      parts.push(
        `\n\n--- Nội dung file: ${attachment.name} ---\n${attachmentText}`,
      );
    }
  }

  return parts.join("\n\n");
}

function parseMeetingNoteTasksFromContent(content) {
  const actionText = extractActionText(content);
  const lines = String(actionText || "").split(/\r?\n/);

  const rawTasks = [];
  let currentTask = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    const isParentTask = trimmed.startsWith("- ");
    const isSubtask = trimmed.startsWith("+ ");

    if (isParentTask) {
      if (currentTask) {
        rawTasks.push(currentTask);
      }

      const assigneeDiscordId = normalizeMention(trimmed);
      const storyPoint = parseStoryPoint(trimmed);
      const dueDate = parseDueDate(trimmed);
      const rawTitle = cleanTaskTitle(trimmed);

      currentTask = {
        rawTitle,
        assigneeDiscordId,
        storyPoint,
        dueDate,
        rawSubtasks: [],
        rawLine: trimmed,
      };

      continue;
    }

    if (isSubtask && currentTask) {
      currentTask.rawSubtasks.push(trimmed.replace(/^\+\s*/, "").trim());
    }
  }

  if (currentTask) {
    rawTasks.push(currentTask);
  }

  return rawTasks.slice(0, env.MAX_TASKS_PER_MEETING_NOTE);
}

async function parseMeetingNoteTasks(message) {
  const content = await getMeetingNoteContent(message);
  return parseMeetingNoteTasksFromContent(content);
}

function isMeetingNotesChannel(message) {
  return message.channelId === env.DISCORD_MEETING_NOTES_CHANNEL_ID;
}

function isMeetingNoteCandidate(message) {
  if (!isMeetingNotesChannel(message)) return false;
  if (message.author.bot) return false;

  const content = message.content || "";
  const textAttachments = getTextAttachments(message);

  return (
    hasActionHeader(content) ||
    hasParentTaskLine(content) ||
    textAttachments.length > 0
  );
}

module.exports = {
  parseMeetingNoteTasks,
  isMeetingNoteCandidate,
};

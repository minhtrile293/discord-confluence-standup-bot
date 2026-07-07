const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { env } = require("../config/env");
const { getJiraMemberByDiscordId } = require("../config/jiraMembers");
const { parseMeetingNoteTasks } = require("./meetingNoteTaskService");
const {
  generateJiraTasksWithLLM,
  reviseJiraTaskWithLLM,
} = require("./llmService");
const { createJiraTaskWithSubtasks } = require("./jiraService");
const {
  loadJiraDraftState,
  saveJiraDraftState,
  getDraftById,
  updateDraftById,
  findLatestPendingDraftByNumber,
} = require("../storage/jiraTaskDraftStore");
const {
  buildDraftPreviewPayload,
  buildBulkConfirmPayload,
} = require("../messages/jiraTaskPreviewTemplates");

function makeDraftId(sourceMessageId, draftNumber) {
  return `jira_${sourceMessageId}_${draftNumber}`;
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function buildTaskFromRawAndGenerated(rawTask, generatedTask) {
  return {
    title: generatedTask.title || rawTask.rawTitle,
    assigneeDiscordId:
      generatedTask.assigneeDiscordId || rawTask.assigneeDiscordId,
    storyPoint: rawTask.storyPoint,
    dueDate: rawTask.dueDate,
    description: generatedTask.description || "N/A",
    acceptanceCriteria: generatedTask.acceptanceCriteria || [],
    definitionOfDone: generatedTask.definitionOfDone || [],
    subtasks:
      generatedTask.subtasks?.length > 0
        ? generatedTask.subtasks
        : rawTask.rawSubtasks || [],
    rawTitle: rawTask.rawTitle,
    rawSubtasks: rawTask.rawSubtasks || [],
  };
}

function validateDraftBeforeConfirm(draft) {
  const task = draft.task;

  if (!task.assigneeDiscordId) {
    return "Task này chưa tag assignee Discord.";
  }

  const member = getJiraMemberByDiscordId(task.assigneeDiscordId);

  if (!member) {
    return `Chưa map Discord ID ${task.assigneeDiscordId} sang Jira accountId trong src/config/jiraMembers.js.`;
  }

  if (!task.storyPoint && task.storyPoint !== 0) {
    return "Task này chưa có story point.";
  }

  if (!task.dueDate) {
    return "Task này chưa có deadline.";
  }

  if (!task.title) {
    return "Task này chưa có title.";
  }

  return null;
}

function parseSimpleDueDate(value) {
  const trimmed = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);

  let year;

  if (match[3]) {
    year = Number(match[3]);
    if (year < 100) year += 2000;
  } else {
    year = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: env.TIMEZONE,
        year: "numeric",
      }).format(new Date()),
    );
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");

  return `${year}-${mm}-${dd}`;
}

async function updateDraftPreviewMessage(message, updatedDraft) {
  if (!updatedDraft?.previewMessageId) {
    return;
  }

  try {
    const previewMessage = await message.channel.messages.fetch(
      updatedDraft.previewMessageId,
    );

    await previewMessage.edit(buildDraftPreviewPayload(updatedDraft));
  } catch (error) {
    console.error("Cannot update draft preview:", error.message);
  }
}

function listToText(items = []) {
  return (items || []).map((item) => `- ${item}`).join("\n");
}

function serializeTaskForFullEdit(task) {
  return `Title: ${task.title || ""}

Assignee: ${task.assigneeDiscordId ? `<@${task.assigneeDiscordId}>` : ""}

Story Point: ${task.storyPoint ?? ""}

Due Date: ${task.dueDate || ""}

Description:
${task.description || ""}

Acceptance Criteria:
${listToText(task.acceptanceCriteria)}

Definition of Done:
${listToText(task.definitionOfDone)}

Subtasks:
${listToText(task.subtasks)}
`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text, sectionName, nextSectionNames = []) {
  const escapedSection = escapeRegex(sectionName);
  const nextPattern = nextSectionNames.map(escapeRegex).join("|");

  const regex = nextPattern
    ? new RegExp(
        `${escapedSection}:\\s*([\\s\\S]*?)(?=\\n(?:${nextPattern}):|$)`,
        "i",
      )
    : new RegExp(`${escapedSection}:\\s*([\\s\\S]*)`, "i");

  const match = text.match(regex);

  return match ? match[1].trim() : "";
}

function parseListBlock(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*+]\s*/, "").trim())
    .filter(Boolean);
}

function parseFullDraftText(text, existingTask) {
  const titleMatch = text.match(/^Title:\s*(.+)$/im);
  const assigneeMatch = text.match(/^Assignee:\s*<@!?(\d+)>/im);
  const storyPointMatch = text.match(/^Story Point:\s*(\d+(?:\.\d+)?)/im);
  const dueDateMatch = text.match(/^Due Date:\s*(.+)$/im);

  const description = extractSection(text, "Description", [
    "Acceptance Criteria",
    "Definition of Done",
    "Subtasks",
  ]);

  const acceptanceCriteriaText = extractSection(text, "Acceptance Criteria", [
    "Definition of Done",
    "Subtasks",
  ]);

  const definitionOfDoneText = extractSection(text, "Definition of Done", [
    "Subtasks",
  ]);

  const subtasksText = extractSection(text, "Subtasks", []);

  let dueDate = existingTask.dueDate;

  if (dueDateMatch) {
    dueDate =
      parseSimpleDueDate(dueDateMatch[1].trim()) || dueDateMatch[1].trim();
  }

  return {
    ...existingTask,
    title: titleMatch ? titleMatch[1].trim() : existingTask.title,
    assigneeDiscordId: assigneeMatch
      ? assigneeMatch[1]
      : existingTask.assigneeDiscordId,
    storyPoint: storyPointMatch
      ? Number(storyPointMatch[1])
      : existingTask.storyPoint,
    dueDate,
    description: description || existingTask.description,
    acceptanceCriteria: parseListBlock(acceptanceCriteriaText),
    definitionOfDone: parseListBlock(definitionOfDoneText),
    subtasks: parseListBlock(subtasksText),
  };
}

async function sendOrUpdatePreviewMessage(channel, draft) {
  const payload = buildDraftPreviewPayload(draft);

  if (draft.previewMessageId) {
    try {
      const existingMessage = await channel.messages.fetch(
        draft.previewMessageId,
      );
      await existingMessage.edit(payload);
      return existingMessage;
    } catch (error) {
      console.error("Cannot update preview message:", error.message);
    }
  }

  return channel.send(payload);
}

async function handleMeetingNoteMessage(message) {
  const state = loadJiraDraftState();

  if (state.processedSourceMessageIds.includes(message.id)) {
    await message.reply(
      "⚠️ Meeting note này đã được bot tạo draft trước đó rồi.",
    );
    return;
  }

  const rawTasks = await parseMeetingNoteTasks(message);

  if (rawTasks.length === 0) {
    await message.reply(
      "⚠️ Không tìm thấy task nào. Mỗi task cha cần bắt đầu bằng `- `.",
    );
    return;
  }

  await message.reply(
    `Đã nhận ${rawTasks.length} task. Mình đang gửi qua AI để tạo Jira draft...`,
  );

  let generatedTasks = [];

  try {
    const batches = chunkArray(rawTasks, env.LLM_TASK_BATCH_SIZE || 8);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];

      await message.channel.send(
        `Đang xử lý AI batch ${batchIndex + 1}/${batches.length} (${batch.length} task)...`,
      );

      const batchGeneratedTasks = await generateJiraTasksWithLLM(batch);
      const offset = batchIndex * (env.LLM_TASK_BATCH_SIZE || 8);

      generatedTasks.push(
        ...batchGeneratedTasks.map((task) => ({
          ...task,
          taskIndex: offset + task.taskIndex,
        })),
      );
    }
  } catch (error) {
    console.error("LLM error:", error);
    await message.reply("❌ AI lỗi, chưa tạo được Jira draft. Check log PM2.");
    return;
  }

  const latestState = loadJiraDraftState();
  const now = new Date().toISOString();
  const drafts = [];

  for (let i = 0; i < rawTasks.length; i += 1) {
    const rawTask = rawTasks[i];
    const generatedTask =
      generatedTasks.find((task) => task.taskIndex === i + 1) ||
      generatedTasks[i];

    const draftNumber = i + 1;

    const draft = {
      draftId: makeDraftId(message.id, draftNumber),
      draftNumber,
      status: "pending_review",
      sourceMessageId: message.id,
      channelId: message.channelId,
      previewMessageId: null,
      createdAt: now,
      updatedAt: now,
      createdByDiscordId: message.author.id,
      jiraIssueKey: null,
      jiraIssueUrl: null,
      jiraSubtaskKeys: [],
      task: buildTaskFromRawAndGenerated(rawTask, generatedTask || {}),
    };

    drafts.push(draft);
  }

  latestState.processedSourceMessageIds.push(message.id);
  latestState.drafts.push(...drafts);
  saveJiraDraftState(latestState);

  for (const draft of drafts) {
    const previewMessage = await sendOrUpdatePreviewMessage(
      message.channel,
      draft,
    );

    updateDraftById(draft.draftId, (savedDraft) => {
      savedDraft.previewMessageId = previewMessage.id;
    });
  }

  const savedStateAfterPreview = loadJiraDraftState();
  const savedDraftsForThisMessage = savedStateAfterPreview.drafts.filter(
    (draft) => draft.sourceMessageId === message.id,
  );

  const bulkPayload = buildBulkConfirmPayload(
    message.id,
    savedDraftsForThisMessage,
  );

  if (bulkPayload) {
    await message.channel.send(bulkPayload);
  }
}

async function confirmDraft(interaction, draftId) {
  const state = loadJiraDraftState();
  const draft = getDraftById(state, draftId);

  if (!draft) {
    await interaction.reply({
      content: "❌ Không tìm thấy draft này.",
      ephemeral: true,
    });
    return;
  }

  if (draft.status === "created") {
    await interaction.reply({
      content: `⚠️ Draft này đã được tạo Jira rồi: ${draft.jiraIssueUrl}`,
      ephemeral: true,
    });
    return;
  }

  const validationError = validateDraftBeforeConfirm(draft);

  if (validationError) {
    await interaction.reply({
      content: `❌ Chưa thể tạo Jira task: ${validationError}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await createJiraTaskWithSubtasks(draft.task);

    const updatedDraft = updateDraftById(draftId, (savedDraft) => {
      savedDraft.status = "created";
      savedDraft.jiraIssueKey = result.parentIssue.key;
      savedDraft.jiraIssueUrl = result.browseUrl;
      savedDraft.jiraSubtaskKeys = result.subtasks.map((item) => item.key);
    });

    await interaction.editReply(
      `✅ Đã tạo Jira task: **${result.parentIssue.key}**\n${result.browseUrl}`,
    );

    try {
      await interaction.message.edit(buildDraftPreviewPayload(updatedDraft));
    } catch (error) {
      console.error("Cannot update confirmed preview:", error.message);
    }
  } catch (error) {
    console.error("Jira create error:", error.response?.data || error.message);

    updateDraftById(draftId, (savedDraft) => {
      savedDraft.status = "error";
      savedDraft.lastError = JSON.stringify(
        error.response?.data || error.message,
      );
    });

    await interaction.editReply(
      "❌ Tạo Jira task thất bại. Check `pm2 logs daily-standup-bot` để xem lỗi.",
    );
  }
}

async function skipDraft(interaction, draftId) {
  const updatedDraft = updateDraftById(draftId, (draft) => {
    draft.status = "skipped";
  });

  if (!updatedDraft) {
    await interaction.reply({
      content: "❌ Không tìm thấy draft này.",
      ephemeral: true,
    });
    return;
  }

  await interaction.update(buildDraftPreviewPayload(updatedDraft));
}

async function showAiEditHelp(interaction, draftId) {
  const state = loadJiraDraftState();
  const draft = getDraftById(state, draftId);

  if (!draft) {
    await interaction.reply({
      content: "❌ Không tìm thấy draft này.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `Bạn có thể sửa draft #${draft.draftNumber} bằng 2 cách:

**1. Sửa trực tiếp toàn bộ draft, không gọi AI**
Bấm nút **Edit Draft** trên preview.

**2. Sửa bằng AI**
Chỉ dùng khi cần AI viết lại nội dung dài:

\`\`\`text
!jira-ai-edit ${draft.draftNumber} viết lại AC rõ hơn, thêm điều kiện PR phải bị block nếu CI fail
\`\`\`

Hoặc:

\`\`\`text
!jira-ai-edit ${draft.draftNumber} viết lại description ngắn gọn hơn và bổ sung Definition of Done
\`\`\`

Nếu chỉ sửa assignee, story point, deadline hoặc title, hãy dùng **Edit Draft** để sửa trực tiếp.`,
    ephemeral: true,
  });
}

async function showFullEditModal(interaction, draftId) {
  const state = loadJiraDraftState();
  const draft = getDraftById(state, draftId);

  if (!draft) {
    await interaction.reply({
      content: "❌ Không tìm thấy draft này.",
      ephemeral: true,
    });
    return;
  }

  if (draft.status !== "pending_review") {
    await interaction.reply({
      content: "⚠️ Chỉ có thể sửa draft đang ở trạng thái pending_review.",
      ephemeral: true,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`jira_edit_full_submit:${draftId}`)
    .setTitle(`Edit Jira Draft #${draft.draftNumber}`);

  const fullDraftInput = new TextInputBuilder()
    .setCustomId("full_draft_text")
    .setLabel("Sửa trực tiếp toàn bộ draft")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(serializeTaskForFullEdit(draft.task).slice(0, 4000));

  modal.addComponents(new ActionRowBuilder().addComponents(fullDraftInput));

  await interaction.showModal(modal);
}

async function handleFullEditModalSubmit(interaction) {
  if (!interaction.isModalSubmit()) return false;

  const [action, draftId] = interaction.customId.split(":");

  if (action !== "jira_edit_full_submit" || !draftId) {
    return false;
  }

  const state = loadJiraDraftState();
  const draft = getDraftById(state, draftId);

  if (!draft) {
    await interaction.reply({
      content: "❌ Không tìm thấy draft này.",
      ephemeral: true,
    });
    return true;
  }

  const fullDraftText = interaction.fields.getTextInputValue("full_draft_text");

  const parsedTask = parseFullDraftText(fullDraftText, draft.task);

  const updatedDraft = updateDraftById(draftId, (savedDraft) => {
    savedDraft.task = parsedTask;
  });

  try {
    const previewMessage = await interaction.channel.messages.fetch(
      updatedDraft.previewMessageId,
    );
    await previewMessage.edit(buildDraftPreviewPayload(updatedDraft));
  } catch (error) {
    console.error("Cannot update preview after modal submit:", error.message);
  }

  await interaction.reply({
    content: `✅ Đã cập nhật trực tiếp Jira draft #${updatedDraft.draftNumber}. Không gọi AI.`,
    ephemeral: true,
  });

  return true;
}

async function bulkConfirmDrafts(interaction) {
  if (!interaction.isStringSelectMenu()) return false;

  const [action] = interaction.customId.split(":");

  if (action !== "jira_bulk_confirm") {
    return false;
  }

  const selectedDraftIds = interaction.values || [];

  if (selectedDraftIds.length === 0) {
    await interaction.reply({
      content: "⚠️ Bạn chưa chọn draft nào.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply();

  const results = [];

  for (const draftId of selectedDraftIds) {
    const state = loadJiraDraftState();
    const draft = getDraftById(state, draftId);

    if (!draft) {
      results.push(`❌ ${draftId}: không tìm thấy draft.`);
      continue;
    }

    if (draft.status !== "pending_review") {
      results.push(
        `⚠️ Draft #${draft.draftNumber}: bỏ qua vì status hiện tại là ${draft.status}.`,
      );
      continue;
    }

    const validationError = validateDraftBeforeConfirm(draft);

    if (validationError) {
      results.push(`❌ Draft #${draft.draftNumber}: ${validationError}`);
      continue;
    }

    try {
      const result = await createJiraTaskWithSubtasks(draft.task);

      const updatedDraft = updateDraftById(draftId, (savedDraft) => {
        savedDraft.status = "created";
        savedDraft.jiraIssueKey = result.parentIssue.key;
        savedDraft.jiraIssueUrl = result.browseUrl;
        savedDraft.jiraSubtaskKeys = result.subtasks.map((item) => item.key);
      });

      results.push(
        `✅ Draft #${draft.draftNumber} → ${result.parentIssue.key}: ${result.browseUrl}`,
      );

      if (updatedDraft.previewMessageId) {
        try {
          const previewMessage = await interaction.channel.messages.fetch(
            updatedDraft.previewMessageId,
          );
          await previewMessage.edit(buildDraftPreviewPayload(updatedDraft));
        } catch (error) {
          console.error(
            "Cannot update preview after bulk confirm:",
            error.message,
          );
        }
      }
    } catch (error) {
      console.error(
        `Bulk Jira create error for ${draftId}:`,
        error.response?.data || error.message,
      );

      results.push(
        `❌ Draft #${draft.draftNumber}: tạo Jira thất bại, check PM2 logs.`,
      );
    }
  }

  await interaction.editReply({
    content: `**Bulk Confirm Result**\n\n${results.join("\n")}`.slice(0, 1900),
  });

  return true;
}

async function handleJiraButtonInteraction(interaction) {
  if (interaction.isModalSubmit()) {
    return handleFullEditModalSubmit(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    return bulkConfirmDrafts(interaction);
  }

  if (!interaction.isButton()) return false;

  const [action, draftId] = interaction.customId.split(":");

  if (!action?.startsWith("jira_") || !draftId) {
    return false;
  }

  if (action === "jira_confirm") {
    await confirmDraft(interaction, draftId);
    return true;
  }

  if (action === "jira_edit_full") {
    await showFullEditModal(interaction, draftId);
    return true;
  }

  if (action === "jira_skip") {
    await skipDraft(interaction, draftId);
    return true;
  }

  if (action === "jira_ai_edit_help") {
    await showAiEditHelp(interaction, draftId);
    return true;
  }

  return false;
}

async function handleJiraEditCommand(message) {
  const content = message.content.trim();

  const aiMatch = content.match(/^!jira-ai-edit\s+(\d+)\s+([\s\S]+)/i);

  if (aiMatch) {
    const draftNumber = Number(aiMatch[1]);
    const editInstruction = aiMatch[2].trim();

    const draft = findLatestPendingDraftByNumber(
      message.channelId,
      draftNumber,
    );

    if (!draft) {
      await message.reply(
        `❌ Không tìm thấy pending draft #${draftNumber} trong channel này.`,
      );
      return true;
    }

    await message.reply(`Đang sửa Jira draft #${draftNumber} bằng AI...`);

    let revisedTask;

    try {
      revisedTask = await reviseJiraTaskWithLLM(draft.task, editInstruction);
    } catch (error) {
      console.error("LLM edit error:", error);
      await message.reply("❌ AI lỗi khi sửa draft. Check log PM2.");
      return true;
    }

    const updatedDraft = updateDraftById(draft.draftId, (savedDraft) => {
      savedDraft.task = {
        ...savedDraft.task,
        ...revisedTask,
        storyPoint:
          revisedTask.storyPoint !== null &&
          revisedTask.storyPoint !== undefined
            ? revisedTask.storyPoint
            : savedDraft.task.storyPoint,
        dueDate:
          revisedTask.dueDate !== null && revisedTask.dueDate !== undefined
            ? revisedTask.dueDate
            : savedDraft.task.dueDate,
      };
    });

    await updateDraftPreviewMessage(message, updatedDraft);

    await message.reply(`✅ Đã cập nhật Jira draft #${draftNumber} bằng AI.`);
    return true;
  }

  if (content.startsWith("!jira-edit")) {
    await message.reply(
      "⚠️ `!jira-edit` không tự gọi AI nữa. Bấm **Edit Draft** để sửa trực tiếp toàn bộ draft, hoặc dùng `!jira-ai-edit` nếu muốn sửa bằng AI.",
    );
    return true;
  }

  return false;
}

module.exports = {
  handleMeetingNoteMessage,
  handleJiraButtonInteraction,
  handleJiraEditCommand,
};

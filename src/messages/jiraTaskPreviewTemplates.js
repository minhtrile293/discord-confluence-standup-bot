const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

function formatList(items = []) {
  if (!items.length) return "N/A";
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function truncate(value, max = 1000) {
  const text = String(value || "");

  if (text.length <= max) return text;

  return `${text.slice(0, max - 20)}...`;
}

function buildDraftEmbed(draft) {
  const task = draft.task;

  const statusLabel =
    {
      pending_review: "Pending Review",
      created: "Created",
      skipped: "Skipped",
      error: "Error",
    }[draft.status] || draft.status;

  const embed = new EmbedBuilder()
    .setTitle(`📝 Jira Task Draft #${draft.draftNumber}`)
    .setDescription(`**Status:** ${statusLabel}`)
    .addFields(
      {
        name: "Title",
        value: truncate(task.title || "N/A", 1000),
      },
      {
        name: "Assignee",
        value: task.assigneeDiscordId
          ? `<@${task.assigneeDiscordId}>`
          : "⚠️ Chưa tag assignee",
        inline: true,
      },
      {
        name: "Story Point",
        value:
          task.storyPoint !== undefined && task.storyPoint !== null
            ? String(task.storyPoint)
            : "⚠️ Chưa có",
        inline: true,
      },
      {
        name: "Due Date",
        value: task.dueDate || "⚠️ Chưa có",
        inline: true,
      },
      {
        name: "Description",
        value: truncate(task.description || "N/A", 1000),
      },
      {
        name: "Acceptance Criteria",
        value: truncate(formatList(task.acceptanceCriteria), 1000),
      },
      {
        name: "Definition of Done",
        value: truncate(formatList(task.definitionOfDone), 1000),
      },
      {
        name: "Subtasks",
        value: truncate(formatList(task.subtasks), 1000),
      },
    )
    .setFooter({
      text: `Draft ID: ${draft.draftId}`,
    });

  if (draft.jiraIssueKey) {
    embed.addFields({
      name: "Jira",
      value: draft.jiraIssueUrl || draft.jiraIssueKey,
    });
  }

  return embed;
}

function buildDraftButtons(draft) {
  const disabled = draft.status !== "pending_review";

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jira_confirm:${draft.draftId}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`jira_edit_full:${draft.draftId}`)
      .setLabel("Edit Draft")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`jira_ai_edit_help:${draft.draftId}`)
      .setLabel("AI Edit")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`jira_skip:${draft.draftId}`)
      .setLabel("Skip")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function taskAssigneeArray(draft) {
  return draft.task?.assigneeDiscordId ? [draft.task.assigneeDiscordId] : [];
}

function buildDraftPreviewPayload(draft) {
  return {
    embeds: [buildDraftEmbed(draft)],
    components: [buildDraftButtons(draft)],
    allowedMentions: {
      users: taskAssigneeArray(draft),
    },
  };
}

function buildBulkConfirmPayload(sourceMessageId, drafts) {
  const pendingDrafts = drafts
    .filter((draft) => draft.status === "pending_review")
    .slice(0, 25);

  if (pendingDrafts.length === 0) {
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`jira_bulk_confirm:${sourceMessageId}`)
    .setPlaceholder("Chọn các draft đã đạt chuẩn để tạo Jira ngay")
    .setMinValues(1)
    .setMaxValues(pendingDrafts.length)
    .addOptions(
      pendingDrafts.map((draft) => {
        const title = draft.task.title || `Draft #${draft.draftNumber}`;

        return {
          label: `#${draft.draftNumber} - ${title}`.slice(0, 100),
          value: draft.draftId,
          description: `SP: ${draft.task.storyPoint ?? "?"} | Due: ${
            draft.task.dueDate || "?"
          }`.slice(0, 100),
        };
      }),
    );

  return {
    content:
      "✅ **Bulk Confirm Jira Drafts**\nChọn các draft đã đạt chuẩn trong menu bên dưới. Bot sẽ tạo Jira ngay cho các draft được chọn.",
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

module.exports = {
  buildDraftPreviewPayload,
  buildBulkConfirmPayload,
};

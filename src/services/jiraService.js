const axios = require("axios");
const { env } = require("../config/env");
const { buildJiraDescriptionADF } = require("../utils/jiraAdf");
const { getJiraMemberByDiscordId } = require("../config/jiraMembers");

function getJiraAuthHeader() {
  const token = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString(
    "base64"
  );

  return `Basic ${token}`;
}

function jiraClient() {
  return axios.create({
    baseURL: env.JIRA_BASE_URL,
    headers: {
      Authorization: getJiraAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
}

function getParentIssueType() {
  if (env.JIRA_TASK_ISSUE_TYPE_ID) {
    return {
      id: String(env.JIRA_TASK_ISSUE_TYPE_ID),
    };
  }

  return {
    name: env.JIRA_TASK_ISSUE_TYPE_NAME,
  };
}

function getSubtaskIssueType() {
  if (env.JIRA_SUBTASK_ISSUE_TYPE_ID) {
    return {
      id: String(env.JIRA_SUBTASK_ISSUE_TYPE_ID),
    };
  }

  return {
    name: env.JIRA_SUBTASK_ISSUE_TYPE_NAME,
  };
}

async function createIssue(fields) {
  const client = jiraClient();

  const response = await client.post("/rest/api/3/issue", {
    fields,
  });

  return response.data;
}

async function moveIssuesToSprint(issueKeys) {
  const client = jiraClient();

  await client.post(`/rest/agile/1.0/sprint/${env.JIRA_TARGET_SPRINT_ID}/issue`, {
    issues: issueKeys,
  });
}

async function createParentTask(task) {
  const member = getJiraMemberByDiscordId(task.assigneeDiscordId);

  if (!member) {
    throw new Error(
      `Missing Jira accountId for Discord user ${task.assigneeDiscordId}`
    );
  }

  const fields = {
    project: {
      key: env.JIRA_PROJECT_KEY,
    },
    summary: task.title,
    description: buildJiraDescriptionADF(task),
    issuetype: getParentIssueType(),
    assignee: {
      id: member.jiraAccountId,
    },
    duedate: task.dueDate,
  };

  fields[env.JIRA_STORY_POINT_FIELD] = task.storyPoint;

  return createIssue(fields);
}

async function createSubtask(parentIssueKey, task, subtaskTitle) {
  const member = getJiraMemberByDiscordId(task.assigneeDiscordId);

  const fields = {
    project: {
      key: env.JIRA_PROJECT_KEY,
    },
    summary: subtaskTitle,
    issuetype: getSubtaskIssueType(),
    parent: {
      key: parentIssueKey,
    },
  };

  if (member) {
    fields.assignee = {
      id: member.jiraAccountId,
    };
  }

  if (task.dueDate) {
    fields.duedate = task.dueDate;
  }

  return createIssue(fields);
}

async function createJiraTaskWithSubtasks(task) {
  const parentIssue = await createParentTask(task);

  const subtaskResults = [];

  for (const subtaskTitle of task.subtasks || []) {
    const subtask = await createSubtask(parentIssue.key, task, subtaskTitle);
    subtaskResults.push(subtask);
  }

  await moveIssuesToSprint([parentIssue.key]);

  return {
    parentIssue,
    subtasks: subtaskResults,
    browseUrl: `${env.JIRA_BASE_URL}/browse/${parentIssue.key}`,
  };
}

module.exports = {
  createJiraTaskWithSubtasks,
};
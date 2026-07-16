const OpenAI = require("openai");
const { env } = require("../config/env");
const { getLlmMemberDirectory } = require("../config/jiraMembers");
const {
  maskSecret,
  logLlmInfo,
  logLlmSuccess,
  logLlmError,
} = require("../utils/llmLogger");

let cachedGeminiClient = null;
let cachedOpenAiClient = null;

// Mỗi provider: gọi 1 lần + retry tối đa 1 lần (SDK), rồi mới fallback provider khác.
const LLM_MAX_RETRIES = 1;

const GEMINI_REQUEST_OPTIONS = {
  maxRetries: LLM_MAX_RETRIES,
};

function logLlmStartupConfig() {
  logLlmInfo("Startup LLM config", {
    primary: {
      provider: "github-models/openai-compatible",
      model: env.OPENAI_MODEL,
      baseURL: env.OPENAI_BASE_URL,
      apiKeyConfigured: Boolean(env.OPENAI_API_KEY),
      apiKey: env.OPENAI_API_KEY ? maskSecret(env.OPENAI_API_KEY) : null,
    },
    fallback: {
      provider: "gemini",
      model: env.GEMINI_MODEL,
      apiKeyConfigured: Boolean(env.GEMINI_API_KEY),
      apiKey: env.GEMINI_API_KEY ? maskSecret(env.GEMINI_API_KEY) : null,
    },
    sdkMaxRetriesPerProvider: LLM_MAX_RETRIES,
    batchSize: env.LLM_TASK_BATCH_SIZE,
    maxTasksPerMeetingNote: env.MAX_TASKS_PER_MEETING_NOTE,
    order: ["github-models (gpt-4o-mini)", "gemini"],
  });

  if (!env.OPENAI_API_KEY) {
    console.warn(
      "[LLM][WARN] OPENAI_API_KEY / GITHUB_TOKEN is empty. GPT primary will be skipped until you set it.",
    );
  }
}

async function getGeminiClient() {
  if (cachedGeminiClient) return cachedGeminiClient;

  const { GoogleGenAI } = await import("@google/genai");
  cachedGeminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return cachedGeminiClient;
}

function getOpenAiClient() {
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY (GitHub PAT) is not configured for GitHub Models.",
    );
  }

  if (cachedOpenAiClient) return cachedOpenAiClient;

  cachedOpenAiClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    maxRetries: LLM_MAX_RETRIES,
  });

  return cachedOpenAiClient;
}

function buildRawTaskPayload(rawTasks) {
  return rawTasks.map((task, index) => ({
    taskIndex: index + 1,
    rawLine: task.rawLine,
    rawTitle: task.rawTitle,
    initialSubtasks: task.rawSubtasks || [],
    storyPoint: task.storyPoint,
    dueDate: task.dueDate,
    assigneeDiscordIdFromMention: task.assigneeDiscordId,
  }));
}

const JiraTasksResponseSchema = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          taskIndex: {
            type: "integer",
          },
          title: {
            type: "string",
          },
          assigneeDiscordId: {
            type: "string",
            description:
              "Exact Discord ID selected from memberDirectory. Return empty string if uncertain.",
          },
          description: {
            type: "string",
          },
          acceptanceCriteria: {
            type: "array",
            items: { type: "string" },
          },
          definitionOfDone: {
            type: "array",
            items: { type: "string" },
          },
          subtasks: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: [
          "taskIndex",
          "title",
          "assigneeDiscordId",
          "description",
          "acceptanceCriteria",
          "definitionOfDone",
          "subtasks",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
};

const RevisedJiraTaskSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
    },
    description: {
      type: "string",
    },
    acceptanceCriteria: {
      type: "array",
      items: { type: "string" },
    },
    definitionOfDone: {
      type: "array",
      items: { type: "string" },
    },
    subtasks: {
      type: "array",
      items: { type: "string" },
    },
    storyPoint: {
      type: "number",
    },
    dueDate: {
      type: "string",
      description:
        "Date in YYYY-MM-DD format. Return empty string if unchanged.",
    },
  },
  required: [
    "title",
    "description",
    "acceptanceCriteria",
    "definitionOfDone",
    "subtasks",
    "storyPoint",
    "dueDate",
  ],
  additionalProperties: false,
};

function safeJsonParse(text, providerLabel) {
  try {
    return JSON.parse(text);
  } catch (error) {
    logLlmError(`${providerLabel} returned invalid JSON`, error, {
      rawOutput: text,
    });
    throw new Error(`${providerLabel} returned invalid JSON.`);
  }
}

function normalizeGeneratedTask(task, fallbackIndex) {
  return {
    taskIndex: Number(task.taskIndex || fallbackIndex),
    title: String(task.title || "").trim(),
    assigneeDiscordId: String(task.assigneeDiscordId || "").trim() || null,
    description: String(task.description || "").trim(),
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria)
      ? task.acceptanceCriteria.map(String).filter(Boolean)
      : [],
    definitionOfDone: Array.isArray(task.definitionOfDone)
      ? task.definitionOfDone.map(String).filter(Boolean)
      : [],
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map(String).filter(Boolean)
      : [],
  };
}

function normalizeRevisedTask(task, existingTask) {
  return {
    title: String(task.title || existingTask.title || "").trim(),
    description: String(
      task.description || existingTask.description || "",
    ).trim(),
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria)
      ? task.acceptanceCriteria.map(String).filter(Boolean)
      : existingTask.acceptanceCriteria || [],
    definitionOfDone: Array.isArray(task.definitionOfDone)
      ? task.definitionOfDone.map(String).filter(Boolean)
      : existingTask.definitionOfDone || [],
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.map(String).filter(Boolean)
      : existingTask.subtasks || [],
    storyPoint:
      task.storyPoint !== undefined && task.storyPoint !== null
        ? Number(task.storyPoint)
        : null,
    dueDate:
      task.dueDate !== undefined && task.dueDate !== null && task.dueDate !== ""
        ? String(task.dueDate)
        : null,
  };
}

function buildGenerateTasksPrompt(rawTasks) {
  const memberDirectory = getLlmMemberDirectory();

  return `Bạn là Business Analyst/Scrum assistant cho một dự án phần mềm.

Nhiệm vụ:
- Biến danh sách việc cần làm sau meeting thành Jira-ready tasks.
- Trả về tiếng Việt.
- Giữ đúng số lượng task cha đầu vào.
- Không tự đổi storyPoint hoặc dueDate.
- Không thêm task cha mới.
- Được quyền viết lại title rõ hơn.
- Title KHÔNG được chứa tên người assignee ở cuối.
- Được quyền viết Description, Acceptance Criteria, Definition of Done.
- Được quyền giữ subtask người dùng đã nhập và bổ sung subtask hợp lý nếu task còn thiếu.

Quy tắc xác định assigneeDiscordId:
- Nếu raw task đã có assigneeDiscordIdFromMention thì BẮT BUỘC dùng đúng ID đó, không đổi.
- Chỉ tự suy luận từ tên khi assigneeDiscordIdFromMention đang null/rỗng.
- Nếu raw task chỉ ghi tên như "Luân", "@Hà", "Lê Trí", "le tri", "LUAN" thì hãy so với memberDirectory.
- Hãy so khớp mềm: không phân biệt hoa thường, có dấu/không dấu, có @/không @, tên đầy đủ/tên ngắn.
- Phân biệt rõ "@Lê Trí" (Trí Lê Minh) và "@Đỗ Trí"/"@Do Tri" (Đỗ Nguyễn Minh Trí).
- Chỉ được trả assigneeDiscordId nằm trong memberDirectory.
- Nếu không chắc chắn, trả chuỗi rỗng "".

memberDirectory:
${JSON.stringify(memberDirectory, null, 2)}

Raw tasks:
${JSON.stringify(buildRawTaskPayload(rawTasks), null, 2)}`;
}

function buildReviseTaskPrompt(existingTask, editInstruction) {
  return `Bạn là assistant chỉnh sửa Jira task draft.

Hãy cập nhật task theo yêu cầu người dùng.
- Trả về tiếng Việt.
- Giữ nội dung rõ ràng, ngắn gọn, thực tế.
- Chỉ đổi storyPoint nếu người dùng yêu cầu rõ.
- Chỉ đổi dueDate nếu người dùng yêu cầu rõ.
- Nếu không đổi dueDate thì trả chuỗi rỗng "".

Task hiện tại:
${JSON.stringify(existingTask, null, 2)}

Yêu cầu chỉnh sửa:
${editInstruction}`;
}

async function generateWithOpenAI(rawTasks, prompt) {
  const client = getOpenAiClient();

  logLlmInfo("generateJiraTasks OpenAI request", {
    provider: "github-models",
    baseURL: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    taskCount: rawTasks.length,
    promptChars: prompt.length,
    promptPreview: prompt.slice(0, 500),
  });

  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You return only valid JSON that matches the provided schema. No markdown.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "jira_tasks_response",
        strict: true,
        schema: JiraTasksResponseSchema,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  logLlmInfo("generateJiraTasks OpenAI raw response", {
    model: env.OPENAI_MODEL,
    outputChars: content.length,
    outputPreview: content.slice(0, 800),
  });

  const parsed = safeJsonParse(content, "OpenAI");

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error("OpenAI response missing tasks array.");
  }

  return parsed.tasks.map((task, index) =>
    normalizeGeneratedTask(task, index + 1),
  );
}

async function reviseWithOpenAI(existingTask, editInstruction, prompt) {
  const client = getOpenAiClient();

  logLlmInfo("reviseJiraTask OpenAI request", {
    provider: "github-models",
    baseURL: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
    editInstruction,
    promptChars: prompt.length,
    existingTitle: existingTask?.title,
  });

  const completion = await client.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You return only valid JSON that matches the provided schema. No markdown.",
      },
      { role: "user", content: prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "revised_jira_task",
        strict: true,
        schema: RevisedJiraTaskSchema,
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  logLlmInfo("reviseJiraTask OpenAI raw response", {
    model: env.OPENAI_MODEL,
    outputChars: content.length,
    outputPreview: content.slice(0, 800),
  });

  const parsed = safeJsonParse(content, "OpenAI");
  return normalizeRevisedTask(parsed, existingTask);
}

async function generateWithGemini(rawTasks, prompt) {
  const client = await getGeminiClient();

  logLlmInfo("generateJiraTasks Gemini request", {
    model: env.GEMINI_MODEL,
    taskCount: rawTasks.length,
    promptChars: prompt.length,
    promptPreview: prompt.slice(0, 500),
  });

  const interaction = await client.interactions.create(
    {
      model: env.GEMINI_MODEL,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: JiraTasksResponseSchema,
      },
    },
    GEMINI_REQUEST_OPTIONS,
  );

  const outputText = interaction.output_text;

  logLlmInfo("generateJiraTasks Gemini raw response", {
    model: env.GEMINI_MODEL,
    outputChars: outputText ? String(outputText).length : 0,
    outputPreview: String(outputText || "").slice(0, 800),
  });

  const parsed = safeJsonParse(outputText, "Gemini");

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error("Gemini response missing tasks array.");
  }

  return parsed.tasks.map((task, index) =>
    normalizeGeneratedTask(task, index + 1),
  );
}

async function reviseWithGemini(existingTask, editInstruction, prompt) {
  const client = await getGeminiClient();

  logLlmInfo("reviseJiraTask Gemini request", {
    model: env.GEMINI_MODEL,
    editInstruction,
    promptChars: prompt.length,
    existingTitle: existingTask?.title,
  });

  const interaction = await client.interactions.create(
    {
      model: env.GEMINI_MODEL,
      input: prompt,
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RevisedJiraTaskSchema,
      },
    },
    GEMINI_REQUEST_OPTIONS,
  );

  const outputText = interaction.output_text;

  logLlmInfo("reviseJiraTask Gemini raw response", {
    model: env.GEMINI_MODEL,
    outputChars: outputText ? String(outputText).length : 0,
    outputPreview: String(outputText || "").slice(0, 800),
  });

  const parsed = safeJsonParse(outputText, "Gemini");
  return normalizeRevisedTask(parsed, existingTask);
}

async function withProviderFallback(operationName, openAiFn, geminiFn, context = {}) {
  const errors = [];

  logLlmInfo(`${operationName} start`, {
    order: ["openai", "gemini"],
    sdkMaxRetriesPerProvider: LLM_MAX_RETRIES,
    ...context,
  });

  if (env.OPENAI_API_KEY) {
    const startedAt = Date.now();
    try {
      logLlmInfo(`${operationName} trying OpenAI`, {
        model: env.OPENAI_MODEL,
        ...context,
      });
      const result = await openAiFn();
      logLlmSuccess(`${operationName} succeeded with OpenAI`, {
        model: env.OPENAI_MODEL,
        durationMs: Date.now() - startedAt,
        ...context,
      });
      return result;
    } catch (error) {
      logLlmError(`${operationName} failed on OpenAI`, error, {
        model: env.OPENAI_MODEL,
        durationMs: Date.now() - startedAt,
        ...context,
      });
      errors.push(`OpenAI: ${error?.message || String(error)}`);
    }
  } else {
    logLlmInfo(`${operationName} skipping OpenAI (no OPENAI_API_KEY)`, context);
  }

  const geminiStartedAt = Date.now();
  try {
    logLlmInfo(`${operationName} trying Gemini fallback`, {
      model: env.GEMINI_MODEL,
      ...context,
    });
    const result = await geminiFn();
    logLlmSuccess(`${operationName} succeeded with Gemini`, {
      model: env.GEMINI_MODEL,
      durationMs: Date.now() - geminiStartedAt,
      ...context,
    });
    return result;
  } catch (error) {
    logLlmError(`${operationName} failed on Gemini`, error, {
      model: env.GEMINI_MODEL,
      durationMs: Date.now() - geminiStartedAt,
      ...context,
    });
    errors.push(`Gemini: ${error?.message || String(error)}`);
  }

  const finalError = new Error(
    `${operationName} failed on OpenAI then Gemini. ${errors.join(" | ")}`,
  );
  logLlmError(`${operationName} exhausted all providers`, finalError, {
    ...context,
  });
  throw finalError;
}

async function generateJiraTasksWithLLM(rawTasks) {
  const prompt = buildGenerateTasksPrompt(rawTasks);

  return withProviderFallback(
    "generateJiraTasks",
    () => generateWithOpenAI(rawTasks, prompt),
    () => generateWithGemini(rawTasks, prompt),
    {
      taskCount: rawTasks.length,
      titles: rawTasks.map((task) => task.rawTitle),
    },
  );
}

async function reviseJiraTaskWithLLM(existingTask, editInstruction) {
  const prompt = buildReviseTaskPrompt(existingTask, editInstruction);

  return withProviderFallback(
    "reviseJiraTask",
    () => reviseWithOpenAI(existingTask, editInstruction, prompt),
    () => reviseWithGemini(existingTask, editInstruction, prompt),
    {
      existingTitle: existingTask?.title,
      editInstruction,
    },
  );
}

module.exports = {
  generateJiraTasksWithLLM,
  reviseJiraTaskWithLLM,
  logLlmStartupConfig,
};

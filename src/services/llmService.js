const { env } = require("../config/env");
const { getLlmMemberDirectory } = require("../config/jiraMembers");

let cachedClient = null;

async function getGeminiClient() {
  if (cachedClient) return cachedClient;

  const { GoogleGenAI } = await import("@google/genai");

  cachedClient = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
  });

  return cachedClient;
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
      },
    },
  },
  required: ["tasks"],
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
};

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini raw output:", text);
    throw new Error("Gemini returned invalid JSON.");
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

async function generateJiraTasksWithLLM(rawTasks) {
  const client = await getGeminiClient();
  const memberDirectory = getLlmMemberDirectory();

  const prompt = `Bạn là Business Analyst/Scrum assistant cho một dự án phần mềm.

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
- Nếu raw task đã có assigneeDiscordIdFromMention thì ưu tiên dùng ID đó.
- Nếu raw task chỉ ghi tên như "Luân", "@Hà", "Lê Trí", "le tri", "LUAN" thì hãy so với memberDirectory.
- Hãy so khớp mềm: không phân biệt hoa thường, có dấu/không dấu, có @/không @, tên đầy đủ/tên ngắn.
- Chỉ được trả assigneeDiscordId nằm trong memberDirectory.
- Nếu không chắc chắn, trả chuỗi rỗng "".

memberDirectory:
${JSON.stringify(memberDirectory, null, 2)}

Raw tasks:
${JSON.stringify(buildRawTaskPayload(rawTasks), null, 2)}`;

  const interaction = await client.interactions.create({
    model: env.GEMINI_MODEL,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: JiraTasksResponseSchema,
    },
  });

  const parsed = safeJsonParse(interaction.output_text);

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    throw new Error("Gemini response missing tasks array.");
  }

  return parsed.tasks.map((task, index) =>
    normalizeGeneratedTask(task, index + 1),
  );
}

async function reviseJiraTaskWithLLM(existingTask, editInstruction) {
  const client = await getGeminiClient();

  const prompt = `Bạn là assistant chỉnh sửa Jira task draft.

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

  const interaction = await client.interactions.create({
    model: env.GEMINI_MODEL,
    input: prompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: RevisedJiraTaskSchema,
    },
  });

  const parsed = safeJsonParse(interaction.output_text);

  return normalizeRevisedTask(parsed, existingTask);
}

module.exports = {
  generateJiraTasksWithLLM,
  reviseJiraTaskWithLLM,
};

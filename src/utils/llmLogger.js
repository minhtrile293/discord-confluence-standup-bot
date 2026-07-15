function maskSecret(value) {
  const text = String(value || "");
  if (text.length <= 10) return "***";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function safeJson(value, space = 2) {
  try {
    return JSON.stringify(
      value,
      (_key, nestedValue) => {
        if (typeof nestedValue === "bigint") return nestedValue.toString();
        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack,
            ...nestedValue,
          };
        }
        return nestedValue;
      },
      space,
    );
  } catch (error) {
    return `[Unserializable: ${error.message}]`;
  }
}

function extractLlmErrorDetails(error) {
  if (!error) {
    return { message: "Unknown empty error" };
  }

  if (typeof error !== "object") {
    return { message: String(error) };
  }

  const details = {
    name: error.name,
    message: error.message,
    code: error.code || error.error?.code || error.status || null,
    status: error.status || error.statusCode || error.error?.status || null,
    statusText: error.statusText || null,
    type: error.type || error.error?.type || null,
    requestUrl:
      error.url ||
      error.request?.url ||
      error.config?.url ||
      error.error?.url ||
      null,
  };

  if (error.error && typeof error.error === "object") {
    details.providerError = error.error;
  }

  if (error.response) {
    details.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
      headers: error.response.headers,
    };
  }

  if (error.cause) {
    details.cause = extractLlmErrorDetails(error.cause);
  }

  // Keep raw-ish object for Google GenAI / SDK quirks.
  details.raw = error;

  return details;
}

function logLlmInfo(title, payload) {
  console.log(`\n[LLM][INFO] ${title}`);
  if (payload !== undefined) {
    console.log(safeJson(payload));
  }
}

function logLlmSuccess(title, payload) {
  console.log(`\n[LLM][OK] ${title}`);
  if (payload !== undefined) {
    console.log(safeJson(payload));
  }
}

function logLlmError(title, error, extra = undefined) {
  const details = extractLlmErrorDetails(error);

  console.error(`\n[LLM][ERROR] ${title}`);
  if (extra !== undefined) {
    console.error("[LLM][ERROR] context:");
    console.error(safeJson(extra));
  }
  console.error("[LLM][ERROR] details:");
  console.error(safeJson(details));

  if (error?.stack) {
    console.error("[LLM][ERROR] stack:");
    console.error(error.stack);
  }
}

module.exports = {
  maskSecret,
  safeJson,
  extractLlmErrorDetails,
  logLlmInfo,
  logLlmSuccess,
  logLlmError,
};

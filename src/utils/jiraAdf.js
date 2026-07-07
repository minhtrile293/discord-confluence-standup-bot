function textNode(text) {
  return {
    type: "text",
    text: String(text || ""),
  };
}

function paragraph(text) {
  return {
    type: "paragraph",
    content: [textNode(text)],
  };
}

function heading(text, level = 3) {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(text)],
  };
}

function bulletList(items = []) {
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

function buildJiraDescriptionADF(task) {
  const content = [];

  content.push(heading("Description", 3));
  content.push(paragraph(task.description || "N/A"));

  content.push(heading("Acceptance Criteria", 3));
  content.push(
    task.acceptanceCriteria?.length
      ? bulletList(task.acceptanceCriteria)
      : paragraph("N/A"),
  );

  content.push(heading("Definition of Done", 3));
  content.push(
    task.definitionOfDone?.length
      ? bulletList(task.definitionOfDone)
      : paragraph("N/A"),
  );

  return {
    type: "doc",
    version: 1,
    content,
  };
}

module.exports = { buildJiraDescriptionADF };

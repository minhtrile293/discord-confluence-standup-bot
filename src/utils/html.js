function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toConfluenceCell(value = "") {
  const safe = escapeHtml(value.trim() || "N/A");
  return safe.replace(/\n/g, "<br />");
}

module.exports = {
  escapeHtml,
  escapeRegex,
  toConfluenceCell,
};

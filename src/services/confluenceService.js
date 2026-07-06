const axios = require("axios");
const { env } = require("../config/env");

function getConfluenceAuthHeader() {
  const token = Buffer.from(
    `${env.CONFLUENCE_EMAIL}:${env.CONFLUENCE_API_TOKEN}`
  ).toString("base64");

  return `Basic ${token}`;
}

async function getConfluencePage() {
  const url = `${env.CONFLUENCE_BASE_URL}/wiki/api/v2/pages/${env.CONFLUENCE_PAGE_ID}?body-format=storage`;

  const response = await axios.get(url, {
    headers: {
      Authorization: getConfluenceAuthHeader(),
      Accept: "application/json",
    },
  });

  return response.data;
}

async function updateConfluencePage(page, newStorageValue, message) {
  const url = `${env.CONFLUENCE_BASE_URL}/wiki/api/v2/pages/${env.CONFLUENCE_PAGE_ID}`;

  const payload = {
    id: String(page.id),
    status: "current",
    title: page.title,
    body: {
      representation: "storage",
      value: newStorageValue,
    },
    version: {
      number: page.version.number + 1,
      message,
    },
  };

  const response = await axios.put(url, payload, {
    headers: {
      Authorization: getConfluenceAuthHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

module.exports = {
  getConfluencePage,
  updateConfluencePage,
};
const { env } = require("../config/env");

function getDateInfo(inputDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: env.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(inputDate);

  const data = {};

  for (const part of parts) {
    data[part.type] = part.value;
  }

  const key = `${data.year}-${data.month}-${data.day}`;
  const displayDate = `${Number(data.day)}/${Number(data.month)}/${data.year}`;

  return {
    key,
    weekday: data.weekday,
    displayDate,
    rawDateToken: `<${displayDate}>`,
    encodedDateToken: `&lt;${displayDate}&gt;`,
    threadName: `daily-standup-${key}`,
  };
}

module.exports = {
  getDateInfo,
};

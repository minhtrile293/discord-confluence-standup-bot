const { env } = require("../config/env");
const { formatMoney } = require("../utils/money");

function getStandupTemplate() {
  return `Priorities:
- 

Progress:
- 

Problems:
N/A`;
}

function buildDailyReminderMessage(dateInfo) {
  return `# 📅 Daily Standup - ${dateInfo.displayDate}

@everyone

Hi team, please update your progress today before **12:00 PM**.

Please reply in this thread using the format below. Copy this template and fill it in:


Notes:
- If you have no blocker, write \`N/A\` in \`Problems\`.
- Keep your update short and clear.
- Reply only in this thread, not directly in the channel.`;
}

function buildThreadTemplateMessage() {
  return `Please copy and reply with this format:

\`\`\`text
${getStandupTemplate()}
\`\`\``;
}

function buildPenaltyMessage(member, amount, dateInfo, isEscalation = false) {
  if (isEscalation) {
    return `⏰ **NHẮC PHẠT DAILY STANDUP**

<@${member.discordId}> bạn vẫn chưa react ❤️ xác nhận đã chuyển khoản phạt daily-standup ngày **${dateInfo.displayDate}**.

**Tổng tiền phạt hiện tại:** ${formatMoney(amount)}

Vui lòng chuyển khoản theo QR bên dưới. Sau khi chuyển xong, react ❤️ vào **tin nhắn này** để bot ghi nhận đã thanh toán.

Nếu đến **00:00 ngày tiếp theo** vẫn chưa react ❤️, bot sẽ tiếp tục tag và cộng thêm **${formatMoney(env.FINE_AMOUNT)}**.`;
  }

  return `⚠️ **VI PHẠM DAILY STANDUP**

<@${member.discordId}> bạn chưa cập nhật daily-standup trước **12:00 PM** ngày **${dateInfo.displayDate}**.

**Mức phạt hiện tại:** ${formatMoney(amount)}

Vui lòng chuyển khoản theo QR bên dưới. Sau khi chuyển xong, react ❤️ vào **tin nhắn này** để bot ghi nhận đã thanh toán.

Nếu đến **00:00 ngày tiếp theo** vẫn chưa react ❤️, bot sẽ tag lại và cộng thêm **${formatMoney(env.FINE_AMOUNT)}**.`;
}

module.exports = {
  getStandupTemplate,
  buildDailyReminderMessage,
  buildThreadTemplateMessage,
  buildPenaltyMessage,
};

function formatMoney(amount) {
  return `${amount.toLocaleString("vi-VN")}đ`;
}

module.exports = {
  formatMoney,
};

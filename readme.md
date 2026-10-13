curl -u "lmtri23@clc.fitus.edu.vn:YOUR_JIRA_API_TOKEN" --url "https://minhtri26072005.atlassian.net/rest/agile/1.0/board/1/sprint" --header "Accept: application/json"

Get Jira board id:
https://minhtri26072005.atlassian.net/rest/agile/1.0/board

Get Jira sprint id:
https://minhtri26072005.atlassian.net/rest/agile/1.0/board/`board-id`/sprint

Chuyển quyền ssh:
sudo su - leminhtri293

Lệnh pm2:
pm2 status
pm2 stop daily-standup-bot

nano .env

pm2 restart daily-standup-bot

## Bật/tắt từng tính năng

Thêm hai biến sau vào file `.env` (mỗi biến độc lập):

```env
DSU_ENABLED=true
JIRA_ENABLED=true
```

- `DSU_ENABLED`: bật/tắt daily standup, gồm lịch nhắc/check/phạt, reaction đóng phạt, các lệnh `!daily-test`, `!daily-check`, `!fine-check` và xử lý tin nhắn standup.
- `JIRA_ENABLED`: bật/tắt tạo task Jira từ meeting note (đọc note, lệnh sửa task, nút bấm của bản nháp, gọi LLM).
- Cả hai cùng `false`: bot online ở trạng thái invisible và không xử lý gì.
- Nếu không khai báo, mỗi biến mặc định lấy theo `CHATBOT_ENABLED` (cũ), và mặc định cuối cùng là `true`.
- Chỉ những biến môi trường của tính năng đang bật mới bị bắt buộc (ví dụ tắt DSU thì không cần `CONFLUENCE_*`).

Sau khi thay đổi, khởi động lại bot:

```sh
pm2 restart daily-standup-bot
```

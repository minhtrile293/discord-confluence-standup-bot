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

## Bật/tắt nhắc phạt Confluence

Thêm biến sau vào file `.env`:

```env
CONFLUENCE_PENALTY_REMINDER_ENABLED=true
```

- `true`: bật kiểm tra thiếu daily lúc 12:00 và nhắc/tăng phạt lúc 00:00.
- `false`: tắt hai tác vụ nhắc phạt trên. Nhắc daily lúc 07:00 và cập nhật Confluence vẫn hoạt động.

Sau khi thay đổi, khởi động lại bot:

```sh
pm2 restart daily-standup-bot
```

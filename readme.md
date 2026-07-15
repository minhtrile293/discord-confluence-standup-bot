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
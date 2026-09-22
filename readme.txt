验证码看板使用说明
==================

本项目是 Cloudflare Worker 上的验证码收集后台，域名 note.zhl2010.ccwu.cc。

【收集】访问 https://note.zhl2010.ccwu.cc/?collect=验证码 即可存入并记录时间。

【登录】/admin 跳转登录页。账号 zhl2010，密码 note_zhl2010，可查看与删除。

【分页】每页 50 条，支持上一页/下一页、跳页，每 30 秒自动刷新。

【部署】源码在 src/worker.js，改完执行 npx wrangler deploy 即可发布。
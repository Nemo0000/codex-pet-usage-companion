# Codex Community Post Draft

This file is a draft for a future community post. It is not a record of a published post, and it intentionally avoids claiming download, Star, or user numbers that have not been verified.

## English

### Codex Pet & Usage Companion: a small Windows tray companion

I built an independent open-source Windows tray app for two everyday Codex tasks:

- viewing ChatGPT-backed usage windows and reset countdowns;
- browsing Petdex community pets and trying to install and select them in the official desktop app.

The current v0.5.0 release adds configurable automatic refresh (manual, 1, 5, or 15 minutes), low-usage warnings below 20%, best-effort Windows notifications, stale-data protection, and English/Simplified Chinese UI.

The project is local-first: it uses the local `codex app-server`, does not read browser cookies, does not store access tokens, and does not upload usage data.

Download and source: https://github.com/Nemo0000/codex-pet-usage-companion

I would appreciate feedback from Windows Codex users, especially around App Server compatibility, usage-window interpretation, Petdex package support, and the visible official Pets UI flow.

## 简体中文

### Codex 宠物与额度助手：一个轻量 Windows 托盘工具

我做了一个独立开源的 Windows 托盘应用，主要解决两个日常问题：

- 查看 ChatGPT-backed Codex 额度和重置倒计时；
- 浏览 Petdex 社区宠物，并尝试安装和切换官方桌面端宠物。

当前 v0.5.0 支持手动、1 分钟、5 分钟和 15 分钟自动刷新，低于 20% 的额度提醒，尽力发送 Windows 系统通知，以及中英文界面。

项目采用本地优先设计：通过本地 `codex app-server` 读取额度，不读取浏览器 Cookie、不保存访问令牌、不上传用量数据。

项目地址：https://github.com/Nemo0000/codex-pet-usage-companion

欢迎 Windows Codex 用户反馈 App Server 兼容性、额度窗口解释、Petdex 宠物包支持和官方 Pets 页面自动操作体验。

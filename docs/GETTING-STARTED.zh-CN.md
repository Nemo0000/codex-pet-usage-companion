# 开始使用

本教程介绍 Codex 宠物与额度助手的两个主要流程：查看额度和切换社区宠物。

## 1. 安装并连接账户

1. 从 [GitHub Releases](https://github.com/Nemo0000/codex-pet-usage-companion/releases) 下载最新 Windows x64 安装包。
2. 为当前 Windows 用户安装并启动应用。
3. 在 PowerShell 中确认以下命令可用：

   ```powershell
   codex --version
   codex app-server --help
   ```

4. 如果面板提示需要连接，点击“使用 ChatGPT 登录”，完成官方浏览器登录流程。

应用通过本地 Codex App Server 读取数据，不读取浏览器 Cookie，也不保存访问令牌。

## 2. 查看额度

- 主面板显示可用额度窗口、剩余百分比和重置倒计时。
- 打开“设置 > 行为”，可以选择手动、1 分钟、5 分钟或 15 分钟自动刷新。
- 开启“低额度提醒”后，额度低于 20% 会显示面板警告，并尝试发送 Windows 通知。
- 刷新失败时，应用会保留上一次数据，并标记数据可能已过期，不会伪造为 0%。

## 3. 切换社区宠物

1. 点击主页的“更换宠物”。
2. 在 Petdex 社区图库中搜索或按分类筛选。
3. 点击“仅安装”，将宠物包写入 `.codex/pets/<pet-id>`。
4. 点击“安装并使用”，应用还会尝试启动官方桌面端、打开“设置 > Pets”，并点击可见的“Select”按钮。

如果官方界面发生变化或无法自动操作，宠物包仍会保留，应用会提示你手动到官方 Pets 页面选择。

## 4. 反馈和贡献

提交 [Issue](https://github.com/Nemo0000/codex-pet-usage-companion/issues) 时，请提供应用版本、Windows 版本、Codex CLI 版本、预期行为和脱敏后的错误信息。欢迎提交聚焦的 Bug 修复、测试、文档和翻译 PR。

提交前请阅读[贡献指南](../CONTRIBUTING.md)。

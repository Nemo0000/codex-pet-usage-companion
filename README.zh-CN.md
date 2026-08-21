# Codex 宠物与额度助手

<p align="center">
  <strong>在一个轻量 Windows 托盘面板中更换 Codex 宠物并查看额度。</strong><br />
  <sub>本地优先 · 注重隐私 · 支持简体中文和 English</sub>
</p>

<p align="center">
  <a href="https://github.com/Nemo0000/codex-pet-usage-companion/releases"><img alt="最新版本" src="https://img.shields.io/github/v/release/Nemo0000/codex-pet-usage-companion?display_name=tag&sort=semver"></a>
  <a href="https://github.com/Nemo0000/codex-pet-usage-companion/releases"><img alt="下载量" src="https://img.shields.io/github/downloads/Nemo0000/codex-pet-usage-companion/total"></a>
  <a href="https://github.com/Nemo0000/codex-pet-usage-companion/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/Nemo0000/codex-pet-usage-companion"></a>
  <a href="https://github.com/Nemo0000/codex-pet-usage-companion/actions/workflows/ci.yml"><img alt="持续集成" src="https://github.com/Nemo0000/codex-pet-usage-companion/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="MIT 许可证" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
</p>

<p align="center">
  <a href="https://github.com/Nemo0000/codex-pet-usage-companion/releases"><strong>下载最新 Windows 安装包</strong></a>
  · <a href="README.md">English</a>
  · <a href="docs/GETTING-STARTED.zh-CN.md">开始使用</a>
</p>

Codex 宠物与额度助手是一个独立的 Windows 托盘应用，提供两个核心功能：浏览并安装社区宠物，以及查看 ChatGPT-backed Codex 额度和重置时间。

> 本项目是独立开源项目，不是 OpenAI 官方产品。

## 核心功能

- 查看当前额度窗口的剩余百分比和重置倒计时。
- 手动或按 1、5、15 分钟自动刷新额度。
- 额度低于 20% 时显示面板提醒，并尝试发送 Windows 系统通知。
- 从主页打开 Petdex 社区图库，搜索、安装和卸载宠物。
- 支持“仅安装”和“安装并使用”两种宠物流程。
- 在 Windows 上尝试自动启动官方桌面端并进入 Settings > Pets。
- 支持浅色、深色、跟随系统、紧凑模式、开机启动和始终置顶。
- 支持简体中文和 English。

## 截图

### 额度查看

![额度查看面板](docs/screenshots/usage-home-en.png)

### 宠物社区图库

![Petdex 宠物图库](docs/screenshots/petdex-gallery-real-en.png)

## 快速开始

1. 从 [GitHub Releases](https://github.com/Nemo0000/codex-pet-usage-companion/releases) 下载 Windows x64 安装包。
2. 安装并启动应用，应用会驻留在系统托盘中。
3. 如果没有额度数据，点击“重新连接”并完成官方浏览器登录流程。
4. 点击主页“更换宠物”进入 Petdex 社区图库。
5. 选择“仅安装”或“安装并使用”。

## 隐私边界

应用只通过本地 `codex app-server` 读取额度，不读取浏览器 Cookie，不保存访问令牌，也不上传用量数据。宠物包只写入 `.codex/pets/<pet-id>`，不会修改官方客户端文件。

## 文档与反馈

- [简体中文使用教程](docs/GETTING-STARTED.zh-CN.md)
- [English getting started](docs/GETTING-STARTED.md)
- [提交 Bug 或建议](https://github.com/Nemo0000/codex-pet-usage-companion/issues)
- [贡献代码和文档](CONTRIBUTING.md)

## 许可证

本项目使用 [MIT License](LICENSE)。

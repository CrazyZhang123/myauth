# 🔐 zjjauth - OAuth 凭据管理工具

<div align="center">

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/CrazyZhang123/myauth?style=social)](https://github.com/CrazyZhang123/myauth)

基于 OAuth 2.0 + PKCE 的 Codex 凭据管理工具，支持多账号快速切换

</div>

---

## ✨ 功能特性

- 🔐 OAuth 2.0 + PKCE 安全认证
- 🔄 多账号快速切换
- 📋 交互式菜单界面
- 🎨 美观的终端界面
- 💾 自动备份
- 🌐 代理支持

## 🚀 快速开始

### 方式一：npx（推荐）

```bash
npx zjjauth
```

### 方式二：从源码安装

```bash
git clone https://github.com/CrazyZhang123/myauth.git
cd myauth
npm install
npm link
zjjauth
```

### 配置代理（可选）

```powershell
# Windows
$env:HTTPS_PROXY = "http://127.0.0.1:7890"

# Linux/macOS
export HTTPS_PROXY=http://127.0.0.1:7890
```

---

## 📖 使用指南

### 交互式菜单（推荐）

```bash
zjjauth
```

进入主菜单：

```
🔐 zjjauth - OAuth 凭据管理工具

👤 当前账号: user@example.com (plus)

📋 菜单
[1] 登录/添加账号
[2] 切换当前凭据（快速切换）
[3] 查看所有凭据
[4] 配置管理
[0] 退出

请选择操作 (0-4):
```

### 命令行模式

```bash
zjjauth whoami          # 配置管理
zjjauth login           # OAuth 登录
zjjauth ls              # 查看凭据
zjjauth use 1           # 切换到第 1 个凭据
zjjauth switch          # 快速切换
zjjauth delete 1        # 删除凭据
```

---

## 📁 目录结构

```
~/.zjjauth/                              # OAuth 凭据目录
  ├── codex-plus-user@example.com.json
  ├── codex-team-myspace-user@example.com.json
  ├── config.json                        # 工具配置
  ├── cache.json                         # 凭据缓存
  └── state.json                         # 当前状态

~/.codex/
  └── auth.json                          # 目标配置文件
```

---

## 📄 配置文件

### config.json
```json
{
  "fromDir": "~\\.zjjauth",
  "targetFile": "~\\.codex\\auth.json"
}
```

### OAuth 凭据文件
```json
{
  "id_token": "eyJhbGc...",
  "access_token": "ya29.a0...",
  "refresh_token": "...",
  "account_id": "12345",
  "email": "user@example.com",
  "type": "codex",
  "plan": "plus",
  "team_space": "",
  "last_refresh": "2026-01-31T12:00:00+08:00",
  "expired": "2026-02-10T12:00:00+08:00"
}
```

---

## ❓ 常见问题

### Q: OAuth 登录失败 "unsupported_country_region_territory"
**A**: 需要设置 HTTPS 代理
```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

### Q: 端口 1455 被占用
**A**: 必须使用固定端口 1455，请关闭占用该端口的程序
```powershell
netstat -ano | findstr :1455
taskkill /PID <PID> /F
```

### Q: 如何卸载？
```bash
npm uninstall -g zjjauth
rm -rf ~/.zjjauth
```

---

## 🔒 安全说明

- ✅ 自动备份（时间戳命名）
- ✅ 原子写入（临时文件 + rename）
- ✅ 所有输出不包含 token
- ✅ 固定端口 1455，仅监听 127.0.0.1
- ✅ PKCE + state 防护

---

## 📄 许可证

MIT License

---

<div align="center">

Made with ❤️ by [CrazyZhang123](https://github.com/CrazyZhang123)

如果这个项目对你有帮助，请给个 Star ⭐️

[![Star History Chart](https://api.star-history.com/svg?repos=CrazyZhang123/myauth&type=Date)](https://star-history.com/#CrazyZhang123/myauth&Date)

</div>

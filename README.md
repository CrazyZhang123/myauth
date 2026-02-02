# 🔐 myauth - OAuth 凭据管理工具

<div align="center">

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/CrazyZhang123/myauth?style=social)](https://github.com/CrazyZhang123/myauth)

基于 OAuth 2.0 + PKCE 的 Codex 凭据管理工具，支持多账号快速切换

[功能特性](#-功能特性) • [快速开始](#-快速开始) • [使用指南](#-使用指南) • [命令说明](#-命令说明)

</div>

---

## ✨ 功能特性

- 🔐 **OAuth 2.0 + PKCE** - 安全的认证流程
- 📋 **交互式菜单** - 友好的用户界面，支持新手快速上手
- 🔄 **快速切换** - 一键切换多个账号
- 🗑️ **凭据管理** - 添加、删除、查看凭据
- 🎨 **美观界面** - 颜色高亮 + Emoji 图标
- 💾 **自动备份** - 切换凭据时自动备份
- 🌐 **代理支持** - 支持 HTTPS 代理（中国大陆必需）
- 📦 **多计划支持** - 支持 Plus 和 Team 订阅

## 📦 系统要求

- **Node.js** >= 18.0.0
- **操作系统**: Windows / macOS / Linux
- **网络**: 需要访问 OpenAI API（建议使用代理）

## 🚀 快速开始

### 方式一：从 GitHub 直接安装（推荐）

```bash
# 全局安装
npm install -g CrazyZhang123/myauth

# 运行
myauth
```

### 方式二：从源码安装

```bash
git clone https://github.com/CrazyZhang123/myauth.git
cd myauth
npm install
npm link
```

### 配置代理（可选）

如果你的网络无法直接访问 OpenAI API，需要设置代理：

```powershell
# Windows PowerShell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"

# Linux/macOS
export HTTPS_PROXY=http://127.0.0.1:7890
```

### 启动主菜单

```bash
myauth
```

就这么简单！🎉

---

## 📖 使用指南

### 方式一：交互式菜单（推荐新手）

运行 `myauth` 进入主菜单：

```
🔐 myauth - OAuth 凭据管理工具

👤 当前账号: user@example.com (plus)

📋 菜单
[1] 🔑 登录/添加账号
[2] 🔄 切换当前凭据（快速切换）
[3] 📝 查看所有凭据
[4] ⚙️  配置管理
[0] 👋 退出

请选择操作 (0-4):
```

### 方式二：命令行模式（推荐老手）

```bash
# 首次配置
myauth whoami

# OAuth 登录
myauth login

# 查看凭据
myauth ls

# 切换凭据
myauth use 1

# 快速切换
myauth switch

# 删除凭据
myauth delete 1
```

---

## 📝 命令说明

### 🏠 主菜单

```bash
myauth              # 显示主菜单
myauth menu         # 显示主菜单（同上）
```

**功能**: 交互式主菜单，适合新手使用

---

### 🔄 快速切换

```bash
myauth switch       # 快速切换凭据
myauth s            # 简写
```

**功能**: 显示所有账号并快速切换

**示例**:
```
🔄 快速切换凭据

👤 当前账号: user1@example.com (plus)

📋 可用凭据:
  [1] ✓ user1@example.com (plus) ← 当前
  [2]   user2@example.com (team - mycompany)

💡 输入数字切换凭据，或按 q 返回
请选择: 2
```

---

### 🔑 OAuth 登录

```bash
myauth login
```

**流程**:
1. 选择订阅计划（Plus/Team）
2. 输入 Team 空间名称（可选）
3. 浏览器授权
4. 自动保存凭据

**文件命名规则**:
- Plus: `codex-plus-{email}.json`
- Team (无空间): `codex-team-{email}.json`
- Team (有空间): `codex-team-{space}-{email}.json`

---

### 📝 查看凭据

```bash
myauth ls              # 列出所有凭据（自动刷新）
myauth ls --csv out.csv # 导出为 CSV
```

**功能**: 
- 自动扫描最新凭据
- 交互式删除（从菜单调用时）
- 支持 CSV 导出

**输出示例**:
```
📊 可用凭据源总数: 2

INDEX | PLAN  | SPACE          | EMAIL                          | TYPE
------|-------|----------------|--------------------------------|----------
1     | plus  | -              | user1@example.com              | codex
2     | team  | mycompany      | user2@example.com              | codex
```

---

### 🔄 切换凭据

```bash
myauth use 1              # 切换到第 1 个凭据（默认备份）
myauth use 1 --no-backup  # 切换凭据（不备份）
```

**更新字段**:
- `tokens.id_token`
- `tokens.access_token`
- `tokens.account_id`
- `last_refresh`

**不更新字段**（仅用于展示）:
- `email`
- `type`
- `plan`
- `team_space`

---

### 🗑️ 删除凭据

```bash
myauth delete 1     # 删除第 1 个凭据
myauth rm 1         # 简写
```

**功能**:
- 删除指定凭据文件
- 如果删除的是当前账号，自动清除状态
- 自动刷新缓存

---

### ⚙️ 配置管理

```bash
myauth whoami
```

**功能**:
- 首次运行：交互式配置
- 已配置：显示当前配置和生效账号，可选择修改

**配置项**:
- `fromDir`: 凭据源目录（默认 `~/.myauth`）
- `targetFile`: 目标配置文件（默认 `~/.codex/auth.json`）

---

## 📁 目录结构

```
~/.myauth/                              # OAuth 凭据目录
  ├── codex-plus-user@example.com.json
  ├── codex-team-myspace-user@example.com.json
  └── ...

~/.codex/                               # Codex 配置目录
  └── auth.json                         # 目标配置文件

~/.myauth/                              # myauth 配置目录
  ├── config.json                       # 工具配置
  ├── cache.json                        # 凭据缓存
  └── state.json                        # 当前状态
```

---

## 📄 配置文件格式

### config.json
```json
{
  "fromDir": "~\\.myauth",
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

### 目标配置文件（auth.json）
```json
{
  "tokens": {
    "id_token": "...",
    "access_token": "...",
    "account_id": "..."
  },
  "last_refresh": "...",
  "other_config": {
    "keep_this": "不会被覆盖"
  }
}
```

---

## ❓ 常见问题

### Q: OAuth 登录失败 "unsupported_country_region_territory"
**A**: 需要设置 HTTPS 代理（某些地区可能无法直接访问 OpenAI API）
```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

### Q: 端口 1455 被占用
**A**: 必须使用固定端口 1455（OpenAI 预先注册），请关闭占用该端口的程序
```powershell
# 查找占用端口的进程
netstat -ano | findstr :1455

# 结束进程
taskkill /PID <PID> /F
```

### Q: 如何修改配置？
**A**: 运行 `myauth whoami`，选择修改配置

### Q: 如何导出凭据列表？
**A**: 运行 `myauth ls --csv output.csv`

### Q: 配置文件保存在哪里？
**A**: 所有配置保存在 `~/.myauth/` 目录

### Q: 如何卸载？
```bash
# 如果是全局安装
npm uninstall -g myauth

# 删除配置（可选）
rm -rf ~/.myauth
```

---

## 🔒 安全说明

- ✅ 默认自动备份（时间戳命名）
- ✅ 原子写入（临时文件 + rename）
- ✅ 所有输出不包含 token
- ✅ CSV 导出不包含 token
- ✅ 固定端口 1455，仅监听 127.0.0.1
- ✅ PKCE + state 防护
- ⚠️ Windows 用户请确保凭据目录受到适当保护

---

## 🛠️ 技术栈

- **Node.js** >= 18
- **commander** - CLI 框架
- **fast-glob** - 文件扫描
- **https-proxy-agent** - HTTPS 代理支持
- **chalk** - 终端颜色

---

## 📸 截图

### 主菜单
```
🔐 myauth - OAuth 凭据管理工具

👤 当前账号: user@example.com (plus)

📋 菜单
[1] 🔑 登录/添加账号
[2] 🔄 切换当前凭据（快速切换）
[3] 📝 查看所有凭据
[4] ⚙️  配置管理
[0] 👋 退出
```

### 快速切换
```
🔄 快速切换凭据

👤 当前账号: user1@example.com (plus)

📋 可用凭据:
  [1] ✓ user1@example.com (plus) ← 当前
  [2]   user2@example.com (team - mycompany)

💡 输入数字切换凭据，或按 q 返回
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

## 🌟 Star History

如果这个项目对你有帮助，请给个 Star ⭐️

[![Star History Chart](https://api.star-history.com/svg?repos=CrazyZhang123/myauth&type=Date)](https://star-history.com/#CrazyZhang123/myauth&Date)

---

<div align="center">

**[⬆ 回到顶部](#-myauth---oauth-凭据管理工具)**

Made with ❤️ by [CrazyZhang123](https://github.com/CrazyZhang123)

</div>

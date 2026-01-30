# myauth - 凭据切换 CLI 工具

基于 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 项目的凭据管理工具，用于在多个 CLI 凭据之间快速切换。


## 预备条件

### 1. 获取 Codex OAuth 凭证

使用 [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) 获取 Codex 的 OAuth 凭证：

```bash
# 克隆 CLIProxyAPI 项目
git clone https://github.com/router-for-me/CLIProxyAPI.git
cd CLIProxyAPI

# 按照项目说明获取 OAuth 凭证
# 凭证会保存到 ~/.cli-proxy-api/ 目录
```

### 2. 系统要求

- **Node.js** >= 18
- **Windows** 操作系统
- **Git** 版本控制工具

### 3. 目录结构

工具会使用以下目录：

```
C:\Users\{user}\.cli-proxy-api\        # CLI 凭证源目录（由 CLIProxyAPI 创建）
C:\Users\{user}\.codex\auth.json       # Codex 目标配置文件
~\.myauth\                              # myauth 配置目录（自动创建）
  ├── config.json                       # 工具配置
  ├── cache.json                        # 凭据缓存
  └── state.json                        # 当前状态
```

## 安装

```bash
git clone https://github.com/CrazyZhang123/myauth.git
cd myauth
npm install
npm link
```

## 快速开始

### 1. 首次配置

```bash
myauth whoami
```

按提示输入配置信息：

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **fromDir** | CLI 凭证源目录 | `C:\Users\ZJJ\.cli-proxy-api` |
| **targetFile** | Codex 目标配置文件 | `C:\Users\ZJJ\.codex\auth.json` |
| **recursive** | 是否递归扫描子目录 | `n` |

**获取用户名**：
```bash
# Windows
echo %USERNAME%

# Linux/macOS
echo $USER
```

### 2. 查看可用凭据

```bash
myauth ls
```

输出示例：
```
可用凭据源总数: 3

INDEX | EMAIL                          | TYPE
------|--------------------------------|----------
1     | user1@example.com              | codex
2     | user2@example.com              | codex
3     | user3@example.com              | codex
```

### 3. 切换凭据

```bash
myauth use --index 1
```

### 4. 查看帮助

```bash
myauth --help
myauth ls --help
myauth use --help
```

## 命令说明

### whoami - 配置工具

```bash
myauth whoami
```

首次运行进入配置，已配置则显示当前状态。

### ls - 列出凭据

```bash
myauth ls              # 列出所有 codex 类型凭据
myauth ls --refresh    # 强制重新扫描
myauth ls --csv out.csv # 导出为 CSV
```

### use - 切换凭据

```bash
myauth use --index 1              # 切换凭据（默认备份）
myauth use --index 1 --no-backup  # 切换凭据（不备份）
```

## 特性

- ✅ **合并更新**：只替换目标 JSON 中对应字段，不覆盖其他配置
- ✅ **类型过滤**：只读取和显示 `type` 为 `codex` 的凭据
- ✅ **安全策略**：自动备份、原子写入、零 Token 泄露
- ✅ **简单索引**：使用 1, 2, 3... 数字编号，易于记忆

## 字段映射规则

### 允许写入的字段

| 源字段 | 目标路径 |
|--------|----------|
| `id_token` | `tokens.id_token` |
| `access_token` | `tokens.access_token` |
| `account_id` | `tokens.account_id` |
| `last_refresh` | `last_refresh` |

### 禁止写入的字段

- `email` - 仅用于展示
- `type` - 仅用于过滤
- `expired` - 仅用于识别

### 合并规则

- ✅ 只更新源 JSON 中存在的字段
- ✅ 源缺失的字段不会覆盖目标
- ✅ 目标 JSON 中的其他字段完全保留

## 数据格式

### 源 JSON（CLI 凭据）

位置：`C:\Users\{user}\.cli-proxy-api\*.json`

```json
{
  "id_token": "eyJhbGc...",
  "access_token": "ya29.a0...",
  "account_id": "12345",
  "last_refresh": "2026-01-30T21:26:00+08:00",
  "email": "user@example.com",
  "type": "codex",
  "expired": "2026-02-09T21:25:59+08:00"
}
```

### 目标 JSON（Codex 配置）

位置：`C:\Users\{user}\.codex\auth.json`

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

## 常见问题

### Q: 如何修改配置？

```bash
myauth whoami
# 询问时选择 Y 进入修改模式
```

### Q: 如何刷新凭据列表？

```bash
myauth ls --refresh
```

### Q: 如何导出凭据列表？

```bash
myauth ls --csv output.csv
# 文件保存在当前目录，或指定完整路径
```

### Q: 为什么只显示部分凭据？

工具只显示 `type` 为 `codex` 的凭据，其他类型会被过滤。

### Q: 配置文件保存在哪里？

所有配置保存在 `~/.myauth/` 目录：
- `config.json` - 工具配置
- `cache.json` - 凭据缓存
- `state.json` - 当前状态

### Q: 如何卸载？

```bash
npm unlink -g myauth
rm -rf ~/.myauth  # 删除配置（可选）
```

## 安全说明

- ✅ 默认自动备份（时间戳命名）
- ✅ 原子写入（临时文件 + rename）
- ✅ 所有输出不包含 token
- ✅ CSV 导出不包含 token

## 技术栈

- Node.js >= 18
- commander - CLI 框架
- fast-glob - 文件扫描

## 相关项目

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) - 本项目基于此项目

## 许可证

MIT

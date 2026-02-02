# myauth - OAuth 凭据管理工具

基于 OAuth 2.0 + PKCE 的 Codex 凭据管理工具，用于在多个账号之间快速切换。

## 特性

- ✅ OAuth 2.0 + PKCE 安全认证
- ✅ 支持 Plus 和 Team 订阅计划
- ✅ 多账号管理与快速切换
- ✅ 自动备份与原子写入
- ✅ HTTPS 代理支持
- ✅ 零 Token 泄露

## 系统要求

- **Node.js** >= 18
- **操作系统**: Windows / macOS / Linux
- **代理工具**（中国大陆用户必需）: Clash / V2Ray 等

## 安装

```bash
git clone https://github.com/CrazyZhang123/myauth.git
cd myauth
npm install
npm link
```

## 快速开始

### 方式一：交互式菜单（推荐新手）

```bash
myauth
```

显示主菜单，按数字选择操作：
```
=== myauth - OAuth 凭据管理工具 ===

当前账号: user1@example.com (Plus)

--- 菜单选项 ---
[1] 登录新账号
[2] 快速切换凭据
[3] 查看所有凭据
[4] 查看当前账号
[5] 刷新凭据列表
[6] 配置管理
[0] 退出

请选择操作 (0-6):
```

### 方式二：命令行模式（推荐老手）

#### 1. 设置代理（中国大陆用户必需）

```powershell
# Windows PowerShell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"

# Linux/macOS
export HTTPS_PROXY=http://127.0.0.1:7890
```

#### 2. 首次配置

```bash
myauth whoami
```

按提示输入配置信息（支持 `~` 路径符号）：

```
欢迎使用 myauth！首次使用需要配置。

默认凭据目录: ~/.myauth
默认目标文件: ~/.codex/auth.json

请输入凭据源目录路径 (默认: ~/.myauth): [回车使用默认]
请输入目标 JSON 文件路径 (默认: ~/.codex/auth.json): [回车使用默认]

✓ 配置已保存

正在扫描凭据源...
✓ 发现 0 个可用凭据源
```

#### 3. OAuth 登录

```bash
myauth login
```

按提示完成登录：

1. 选择订阅计划（Plus/Team）
2. 输入 Team 空间名称（可选）
3. 浏览器授权
4. 完成登录

#### 4. 查看凭据

```bash
myauth ls
```

输出示例：
```
可用凭据源总数: 2

INDEX | PLAN  | SPACE          | EMAIL                          | TYPE
------|-------|----------------|--------------------------------|----------
1     | plus  | -              | user1@example.com              | codex
2     | team  | mycompany      | user2@example.com              | codex
```

#### 5. 切换凭据

```bash
myauth use 1              # 切换到第 1 个凭据
myauth switch             # 或使用快速切换菜单
```

#### 6. 查看当前账号

```bash
myauth whoami
```

## 命令说明

### 交互式命令

#### myauth / myauth menu - 主菜单

```bash
myauth              # 显示主菜单
myauth menu         # 显示主菜单（同上）
```

**功能**: 交互式主菜单，适合新手使用

#### myauth switch - 快速切换

```bash
myauth switch       # 快速切换凭据
myauth s            # 简写
```

**功能**: 快速切换凭据菜单，显示所有账号并选择切换

### 命令行模式

#### whoami - 配置管理

```bash
myauth whoami
```

**功能**:
- 首次运行：交互式配置
- 已配置：显示当前配置和生效账号，可选择修改

#### login - OAuth 登录

```bash
myauth login
```

**流程**:
1. 选择订阅计划（Plus/Team）
2. 输入 Team 空间名称（可选）
3. 浏览器授权
4. 保存凭据文件

**文件命名规则**:
- Plus: `codex-plus-{email}.json`
- Team (无空间): `codex-team-{email}.json`
- Team (有空间): `codex-team-{space}-{email}.json`

#### ls - 列出凭据

```bash
myauth ls              # 列出所有凭据
myauth ls --refresh    # 强制重新扫描
myauth ls --csv out.csv # 导出为 CSV
```

#### use - 切换凭据

```bash
myauth use 1              # 切换到第 1 个凭据（默认备份）
myauth use 1 --no-backup  # 切换凭据（不备份）
```

**更新字段**:
- `tokens.id_token`
- `tokens.access_token`
- `tokens.account_id`
- `last_refresh`

## 目录结构

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

## 配置文件格式

### config.json
```json
{
  "fromDir": "C:\\Users\\ZJJ\\.myauth",
  "targetFile": "C:\\Users\\ZJJ\\.codex\\auth.json"
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

## 常见问题

### Q: OAuth 登录失败 "unsupported_country_region_territory"
**A**: 需要设置 HTTPS 代理
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

### Q: 如何刷新凭据列表？
**A**: 运行 `myauth ls --refresh`

### Q: 如何导出凭据列表？
**A**: 运行 `myauth ls --csv output.csv`

### Q: 配置文件保存在哪里？
**A**: 所有配置保存在 `~/.myauth/` 目录

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
- ✅ 固定端口 1455，仅监听 127.0.0.1
- ✅ PKCE + state 防护
- ⚠️ Windows 用户请确保凭据目录受到适当保护

## 技术栈

- Node.js >= 18
- commander - CLI 框架
- fast-glob - 文件扫描
- https-proxy-agent - HTTPS 代理支持

## 许可证

MIT

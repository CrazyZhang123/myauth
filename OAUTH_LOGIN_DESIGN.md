# OAuth 登录功能设计文档

## 1. 设计概述

### 1.1 OAuth 流程

本实现严格遵循 **OAuth 2.0 Authorization Code + PKCE** 标准流程：

```
┌─────────┐                                           ┌──────────────┐
│  用户   │                                           │ OpenAI OAuth │
│ (CLI)   │                                           │    Server    │
└────┬────┘                                           └──────┬───────┘
     │                                                        │
     │ 1. 运行 myauth login                                  │
     │────────────────────────────────────────────────>      │
     │                                                        │
     │ 2. 生成 PKCE (verifier + challenge)                   │
     │    生成 state (CSRF 防护)                             │
     │                                                        │
     │ 3. 启动本地回调服务器 (127.0.0.1:port)               │
     │                                                        │
     │ 4. 生成授权 URL (包含 challenge + state)              │
     │                                                        │
     │ 5. 打开浏览器访问授权 URL                             │
     │────────────────────────────────────────────────>      │
     │                                                        │
     │                                    6. 用户登录并授权  │
     │                                                        │
     │ 7. 重定向回调 (带 code + state)                       │
     │<────────────────────────────────────────────────      │
     │                                                        │
     │ 8. 验证 state (必须匹配)                              │
     │                                                        │
     │ 9. 用 code + verifier 交换 tokens                     │
     │────────────────────────────────────────────────>      │
     │                                                        │
     │ 10. 返回 id_token, access_token, refresh_token        │
     │<────────────────────────────────────────────────      │
     │                                                        │
     │ 11. 解析 id_token 获取用户信息                        │
     │                                                        │
     │ 12. 保存凭据到 JSON 文件                              │
     │                                                        │
     │ 13. 更新本地缓存                                      │
     │                                                        │
     │ 14. 输出成功摘要                                      │
     └───────────────────────────────────────────────────────┘
```

### 1.2 关键安全特性

#### PKCE (Proof Key for Code Exchange)
- **目的**: 防止授权码拦截攻击
- **实现**:
  1. 生成 96 字节随机 `code_verifier`
  2. 计算 `code_challenge = BASE64URL(SHA256(code_verifier))`
  3. 授权请求发送 `code_challenge`
  4. Token 交换发送 `code_verifier`
  5. 服务器验证 `SHA256(code_verifier) == code_challenge`

#### State 参数
- **目的**: 防止 CSRF 攻击
- **实现**:
  1. 生成 32 字节随机 hex 字符串
  2. 授权请求发送 `state`
  3. 回调时验证 `state` 必须完全匹配
  4. 不匹配则拒绝并报错

#### 本地回调
- **监听地址**: 仅 `127.0.0.1`（不监听 `0.0.0.0`）
- **端口策略**: 从 53682 开始递增查找可用端口
- **超时机制**: 5 分钟无响应自动超时

---

## 2. 回调策略

### 2.1 端口选择

```javascript
// 从 53682 开始递增查找可用端口
startPort = 53682
maxAttempts = 10

for (port = startPort; attempts < maxAttempts; port++) {
  if (isPortAvailable(port)) {
    return port;
  }
  attempts++;
}

throw new Error('无法找到可用端口');
```

**优点**:
- 避免常用端口冲突
- 自动重试提高成功率
- 用户无需手动配置

### 2.2 回调处理

```javascript
// 回调端点: http://127.0.0.1:<port>/callback

// 1. 提取参数
const code = query.get('code');
const state = query.get('state');
const error = query.get('error');

// 2. 错误处理
if (error) {
  显示错误页面
  拒绝 Promise
  return;
}

// 3. 参数验证
if (!code || !state) {
  显示错误页面
  拒绝 Promise
  return;
}

// 4. State 验证 (CSRF 防护)
if (state !== expectedState) {
  显示错误页面
  拒绝 Promise
  return;
}

// 5. 成功
显示成功页面
解析 Promise(code)
```

### 2.3 用户体验

- **成功页面**: 友好的 HTML 页面，10 秒自动关闭
- **错误页面**: 清晰的错误信息，手动关闭
- **终端提示**: 实时显示进度，清晰的状态反馈

---

## 3. 错误处理

### 3.1 错误分类

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 端口占用 | 自动重试 10 次 | "无法找到可用端口 (尝试了 53682-53691)" |
| 浏览器打开失败 | 打印 URL | "⚠ 无法自动打开浏览器，请手动访问以下 URL" |
| 授权超时 | 5 分钟超时 | "等待授权超时 (5 分钟)" |
| State 不匹配 | 立即拒绝 | "State 验证失败，可能存在安全风险" |
| Token 交换失败 | 显示服务器错误 | "Token 交换失败: {error_description}" |
| JWT 解析失败 | 显示解析错误 | "无法从 ID Token 中提取邮箱" |
| 文件保存失败 | 显示 IO 错误 | "保存失败 - {error.message}" |

### 3.2 错误输出规范

**禁止**:
- ❌ 打印完整堆栈 (stack trace)
- ❌ 输出任何 token 值
- ❌ 显示内部调试信息

**允许**:
- ✅ 简洁的错误描述
- ✅ 可操作的建议
- ✅ 相关的上下文信息

**示例**:
```
错误: Token 交换失败: invalid_grant
提示: 授权码可能已过期，请重新运行 myauth login
```

---

## 4. 文件命名与 Sanitize

### 4.1 命名规则

**格式**: `codex-{plan}-{team_space}-{email}.json`

**规则**:
1. 固定前缀: `codex`
2. Plan: `team` 或 `plus`
3. Team Space: 仅当 `plan=team` 且用户提供时包含
4. Email: OAuth 返回的邮箱

**示例**:
```
Plus 用户:
  codex-plus-crazyzhang0401@crazyzhang.shop.json

Team 用户 (无空间名):
  codex-team-crazyzhang0401@crazyzhang.shop.json

Team 用户 (有空间名):
  codex-team-myteamspace-crazyzhang0401@crazyzhang.shop.json
```

### 4.2 Sanitize 策略

```javascript
function sanitizeFilename(str) {
  return str
    .trim()
    // 1. 替换非法字符为下划线
    .replace(/[\\/:*?"<>|]/g, '_')
    // 2. 空格替换为下划线
    .replace(/\s+/g, '_')
    // 3. 统一小写
    .toLowerCase()
    // 4. 移除连续下划线
    .replace(/_+/g, '_')
    // 5. 移除首尾下划线
    .replace(/^_+|_+$/g, '');
}
```

**处理示例**:
```
输入: "My Team Space!"
输出: "my_team_space"

输入: "user@example.com"
输出: "user@example.com"

输入: "Test/Name:123"
输出: "test_name_123"
```

**原因**:
- **统一小写**: 避免大小写敏感问题（Windows 不区分，Linux 区分）
- **替换非法字符**: 确保跨平台兼容性
- **移除连续下划线**: 保持文件名整洁

---

## 5. JSON 结构

### 5.1 完整结构

```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "sk-proj-abc123...",
  "refresh_token": "refresh_abc123...",
  "account_id": "acc_abc123def456",
  "email": "user@example.com",
  "type": "codex",
  "plan": "plus",
  "team_space": "myteamspace",
  "last_refresh": "2026-01-31T21:26:00+08:00",
  "expired": "2026-02-01T21:26:00+08:00"
}
```

### 5.2 字段说明

| 字段 | 类型 | 必需 | 说明 | 用途 |
|-----|------|------|------|------|
| `id_token` | string | ✅ | JWT ID Token | 包含用户身份信息 |
| `access_token` | string | ✅ | OAuth Access Token | API 调用凭证 |
| `refresh_token` | string | ⚠️ | OAuth Refresh Token | 刷新 access_token（可能为 null） |
| `account_id` | string | ✅ | ChatGPT 账户 ID | 唯一标识账户 |
| `email` | string | ✅ | 用户邮箱 | 显示和识别 |
| `type` | string | ✅ | 固定为 "codex" | 标识凭据类型 |
| `plan` | string | ✅ | "team" 或 "plus" | 订阅计划 |
| `team_space` | string | ❌ | Team 空间名 | 仅 team 且用户提供时存在 |
| `last_refresh` | string | ✅ | ISO-8601 时间 | 最后刷新时间（带时区） |
| `expired` | string | ⚠️ | ISO-8601 时间 | Token 过期时间（可能为 null） |

### 5.3 Expired 字段策略

**计算方式**:
```javascript
if (tokens.expires_in) {
  const expireDate = new Date(now.getTime() + tokens.expires_in * 1000);
  expired = expireDate.toISOString();
} else {
  expired = null;
}
```

**说明**:
- 如果 OAuth 响应包含 `expires_in`（秒），则计算过期时间
- 否则设置为 `null`
- 使用 ISO-8601 格式（带时区）

### 5.4 时间格式

**要求**: ISO-8601 格式，带时区偏移

**示例**:
```javascript
// Node.js 生成
new Date().toISOString()
// 输出: "2026-01-31T13:26:00.123Z"

// 带本地时区（推荐）
new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  .replace(' ', 'T') + '+08:00'
// 输出: "2026-01-31T21:26:00+08:00"
```

---

## 6. 与切换工具的对接

### 6.1 字段映射

**允许写入目标 JSON 的字段**:
```javascript
const fieldMapping = [
  { source: 'id_token',      target: ['tokens', 'id_token'] },
  { source: 'access_token',  target: ['tokens', 'access_token'] },
  { source: 'account_id',    target: ['tokens', 'account_id'] },
  { source: 'last_refresh',  target: ['last_refresh'] }
];
```

**禁止写入目标 JSON 的字段** (仅用于展示):
- `email`
- `type`
- `expired`
- `plan`
- `team_space`

### 6.2 切换流程

```javascript
// 1. 读取源 JSON (OAuth 保存的文件)
const source = JSON.parse(fs.readFileSync(sourcePath));

// 2. 读取目标 JSON (如 ~/.codex/auth.json)
const target = JSON.parse(fs.readFileSync(targetPath));

// 3. 更新允许的字段
target.tokens.id_token = source.id_token;
target.tokens.access_token = source.access_token;
target.tokens.account_id = source.account_id;
target.last_refresh = source.last_refresh;

// 4. 保存目标 JSON
fs.writeFileSync(targetPath, JSON.stringify(target, null, 2));
```

### 6.3 兼容性保证

**OAuth 保存逻辑必须确保**:
1. `id_token` 字段存在且为字符串
2. `access_token` 字段存在且为字符串
3. `account_id` 字段存在且为字符串
4. `last_refresh` 字段存在且为 ISO-8601 格式

**切换工具必须确保**:
1. 只写入允许的 4 个字段
2. 不修改目标 JSON 的其他字段
3. 保持目标 JSON 的格式和结构

---

## 7. CLI 命令设计

### 7.1 命令: `myauth login`

**功能**: 全交互式 OAuth 登录

**流程**:
```
1. 询问订阅计划 (team/plus)
2. 如果是 team，询问空间名（可空）
3. 询问保存目录（默认 ~/.myauth）
4. 生成 PKCE 和 state
5. 启动本地回调服务器
6. 打开浏览器进行授权
7. 等待回调并验证
8. 交换 tokens
9. 提取用户信息
10. 保存 JSON 文件
11. 更新本地缓存
12. 输出成功摘要
```

**交互示例**:
```powershell
PS> myauth login

=== OAuth 登录配置 ===

请选择订阅计划:
  [1] Plus
  [2] Team

请输入选项 (1/2): 1
✓ 已选择: plus

默认保存目录: C:\Users\User\.myauth
使用默认目录？(Y/n): y
✓ 保存目录: C:\Users\User\.myauth

正在准备 OAuth 认证...
正在启动本地回调服务器...
✓ 回调服务器已启动 (端口: 53682)

正在打开浏览器进行授权...
等待授权回调...

✓ 已收到授权码

正在交换 access token...
✓ Token 交换成功

正在解析用户信息...
✓ 用户: user@example.com

文件名: codex-plus-user@example.com.json
正在保存凭据...
✓ 凭据已保存: C:\Users\User\.myauth\codex-plus-user@example.com.json

正在更新缓存...
✓ 缓存已更新 (index: 3)

=== 登录成功 ===
Email: user@example.com
Type: codex
Plan: plus
File: C:\Users\User\.myauth\codex-plus-user@example.com.json
Index: 3

提示: 运行 myauth ls 查看所有凭据
提示: 运行 myauth use --index 3 切换到此凭据

⚠ 安全提示: 请确保凭据目录受到适当保护
```

### 7.2 无参数设计

**原因**:
- 全交互式更友好
- 避免参数错误
- 引导用户正确配置
- 减少文档复杂度

**不采用的设计**:
```bash
# ❌ 不采用
myauth login --plan plus --save-dir ~/.myauth

# ✅ 采用
myauth login  # 交互式询问所有信息
```

---

## 8. 安全要求

### 8.1 Token 保护

**严禁输出**:
- ❌ `id_token`
- ❌ `access_token`
- ❌ `refresh_token`

**允许输出**:
- ✅ `email`
- ✅ `account_id`
- ✅ `plan`
- ✅ `team_space`
- ✅ 文件路径
- ✅ index

### 8.2 文件权限

**Unix-like 系统** (Linux, macOS):
```javascript
// 目录权限: 700 (仅所有者可读写执行)
fs.mkdirSync(dir, { mode: 0o700 });

// 文件权限: 600 (仅所有者可读写)
fs.chmodSync(file, 0o600);
```

**Windows**:
```
⚠ 安全提示: 请确保凭据目录受到适当保护
```

### 8.3 网络安全

- **回调地址**: 仅监听 `127.0.0.1`（不监听 `0.0.0.0`）
- **HTTPS**: Token 交换使用 HTTPS
- **PKCE**: 防止授权码拦截
- **State**: 防止 CSRF 攻击

---

## 9. 与现有命令的联动

### 9.1 登录后自动更新缓存

```javascript
// login.js
const config = loadConfig();

if (config && config.fromDir === saveDir) {
  // 重新扫描
  const credentials = await scanCredentials(saveDir, config.recursive);
  
  // 保存缓存
  saveCache(credentials);
  
  // 找到新凭据的 index
  const newCred = credentials.find(c => c.email === email && c.path === filename);
  console.log(`✓ 缓存已更新 (index: ${newCred.index})`);
}
```

### 9.2 ls 命令立即可见

```javascript
// 登录后
myauth login
// 输出: ✓ 缓存已更新 (index: 3)

// 立即查看
myauth ls
// 输出:
// INDEX | EMAIL                          | TYPE
// ------|--------------------------------|----------
// 1     | old@example.com                | codex
// 2     | another@example.com            | codex
// 3     | user@example.com               | codex  <-- 新登录的
```

### 9.3 use 命令直接切换

```javascript
// 登录后立即切换
myauth login
// 输出: Index: 3

myauth use --index 3
// 输出: ✓ 凭据切换成功
```

### 9.4 whoami 命令显示状态

```javascript
myauth whoami
// 输出:
// === 当前配置 ===
// fromDir: C:\Users\User\.myauth
// targetFile: C:\Users\User\.codex\auth.json
// recursive: 否
//
// === 当前生效账号 ===
// index: 3
// email: user@example.com
// 更新时间: 2026-01-31T21:26:00+08:00
```

---

## 10. 测试场景

### 10.1 正常流程

1. ✅ 运行 `myauth login`
2. ✅ 选择 plan (plus)
3. ✅ 使用默认目录
4. ✅ 浏览器自动打开
5. ✅ 用户授权成功
6. ✅ Token 交换成功
7. ✅ 文件保存成功
8. ✅ 缓存更新成功
9. ✅ 输出成功摘要

### 10.2 异常场景

1. ✅ 端口被占用 → 自动重试
2. ✅ 浏览器打开失败 → 打印 URL
3. ✅ 用户拒绝授权 → 显示错误
4. ✅ State 不匹配 → 拒绝并报错
5. ✅ Token 交换失败 → 显示服务器错误
6. ✅ JWT 解析失败 → 显示解析错误
7. ✅ 文件保存失败 → 显示 IO 错误
8. ✅ 授权超时 → 5 分钟超时

### 10.3 边界情况

1. ✅ Team 用户不提供空间名
2. ✅ 邮箱包含特殊字符
3. ✅ 保存目录不存在 → 自动创建
4. ✅ 同名文件已存在 → 覆盖
5. ✅ 未配置 whoami → 不更新缓存
6. ✅ 配置目录与保存目录不同 → 不更新缓存

---

## 11. 依赖项

### 11.1 Node.js 内置模块

- `crypto` - PKCE 生成、随机数
- `http` - 本地回调服务器
- `https` - Token 交换请求
- `fs` - 文件读写
- `path` - 路径处理
- `os` - 系统信息、home 目录
- `child_process` - 打开浏览器

### 11.2 第三方依赖

- `commander` - CLI 框架（已有）
- `fast-glob` - 文件扫描（已有）

**无需新增依赖**

---

## 12. 跨平台兼容性

### 12.1 路径处理

```javascript
// ✅ 使用 path.join
const filePath = path.join(dir, filename);

// ❌ 不要硬编码分隔符
const filePath = dir + '/' + filename;
```

### 12.2 Home 目录

```javascript
// ✅ 使用 os.homedir()
const homeDir = os.homedir();

// ❌ 不要硬编码
const homeDir = 'C:\\Users\\User';
```

### 12.3 打开浏览器

```javascript
// Windows
start "" "https://example.com"

// macOS
open "https://example.com"

// Linux
xdg-open "https://example.com"
```

### 12.4 文件权限

```javascript
// Unix-like: 设置权限
if (process.platform !== 'win32') {
  fs.chmodSync(file, 0o600);
}

// Windows: 提示用户
if (process.platform === 'win32') {
  console.log('⚠ 安全提示: 请确保凭据目录受到适当保护');
}
```

---

## 13. 性能考虑

### 13.1 端口查找

- 最多尝试 10 次
- 每次尝试约 10ms
- 总耗时 < 100ms

### 13.2 Token 交换

- HTTPS 请求
- 通常 < 2 秒

### 13.3 文件操作

- 同步写入（确保原子性）
- 文件大小 < 10KB
- 耗时 < 10ms

### 13.4 缓存更新

- 仅当配置目录匹配时更新
- 扫描耗时取决于文件数量
- 通常 < 100ms

---

## 14. 未来扩展

### 14.1 Token 刷新

```javascript
// 未来可添加
myauth refresh --index 3
```

### 14.2 多账户管理

```javascript
// 已支持
// 通过 index 区分不同账户
```

### 14.3 自动过期检查

```javascript
// 未来可添加
myauth check-expired
```

### 14.4 导出/导入

```javascript
// 未来可添加
myauth export --index 3 --output backup.json
myauth import --input backup.json
```

---

**文档版本**: 1.0  
**最后更新**: 2026-01-31  
**作者**: Kiro AI Assistant

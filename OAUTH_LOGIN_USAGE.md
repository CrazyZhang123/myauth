# OAuth 登录功能使用指南

## 快速开始

### 1. 安装依赖

```powershell
# 进入项目目录
cd myauth

# 安装依赖（如果还没安装）
npm install
```

### 2. 运行登录命令

```powershell
# Windows PowerShell
npm start login

# 或者如果已全局安装
myauth login
```

---

## 完整使用流程

### 步骤 1: 启动登录

```powershell
PS D:\workspace\codex_switch\myauth> npm start login

=== OAuth 登录配置 ===

请选择订阅计划:
  [1] Plus
  [2] Team

请输入选项 (1/2):
```

### 步骤 2: 选择订阅计划

**Plus 用户**:
```powershell
请输入选项 (1/2): 1
✓ 已选择: plus
```

**Team 用户**:
```powershell
请输入选项 (1/2): 2
✓ 已选择: team

请输入 Team 空间名称 (可留空): myteamspace
✓ Team 空间: myteamspace
```

### 步骤 3: 选择保存目录

```powershell
默认保存目录: C:\Users\YourName\.myauth
使用默认目录？(Y/n): y
✓ 保存目录: C:\Users\YourName\.myauth
```

或者自定义目录:
```powershell
使用默认目录？(Y/n): n
请输入保存目录路径: D:\my-credentials
✓ 保存目录: D:\my-credentials
```

### 步骤 4: OAuth 认证

```powershell
正在准备 OAuth 认证...
正在启动本地回调服务器...
✓ 回调服务器已启动 (端口: 53682)

正在打开浏览器进行授权...
等待授权回调...
```

**浏览器会自动打开**，显示 OpenAI 登录页面。

如果浏览器没有自动打开:
```powershell
⚠ 无法自动打开浏览器，请手动访问以下 URL:

https://auth.openai.com/oauth/authorize?client_id=...

等待授权回调...
(如果浏览器未自动打开，请复制上方 URL 到浏览器)
```

### 步骤 5: 在浏览器中授权

1. 输入 OpenAI 账号密码
2. 点击"授权"按钮
3. 浏览器会显示成功页面（10 秒后自动关闭）

### 步骤 6: 完成登录

```powershell
✓ 已收到授权码

正在交换 access token...
✓ Token 交换成功

正在解析用户信息...
✓ 用户: crazyzhang0401@crazyzhang.shop

文件名: codex-plus-crazyzhang0401@crazyzhang.shop.json
正在保存凭据...
✓ 凭据已保存: C:\Users\YourName\.myauth\codex-plus-crazyzhang0401@crazyzhang.shop.json

正在更新缓存...
✓ 缓存已更新 (index: 3)

=== 登录成功 ===
Email: crazyzhang0401@crazyzhang.shop
Type: codex
Plan: plus
File: C:\Users\YourName\.myauth\codex-plus-crazyzhang0401@crazyzhang.shop.json
Index: 3

提示: 运行 myauth ls 查看所有凭据
提示: 运行 myauth use --index 3 切换到此凭据

⚠ 安全提示: 请确保凭据目录受到适当保护
```

---

## 使用场景

### 场景 1: Plus 用户首次登录

```powershell
PS> npm start login

=== OAuth 登录配置 ===

请选择订阅计划:
  [1] Plus
  [2] Team

请输入选项 (1/2): 1
✓ 已选择: plus

默认保存目录: C:\Users\YourName\.myauth
使用默认目录？(Y/n): y
✓ 保存目录: C:\Users\YourName\.myauth

# ... OAuth 流程 ...

=== 登录成功 ===
Email: user@example.com
Type: codex
Plan: plus
File: C:\Users\YourName\.myauth\codex-plus-user@example.com.json
Index: 1
```

**生成的文件名**: `codex-plus-user@example.com.json`

### 场景 2: Team 用户（有空间名）

```powershell
PS> npm start login

请选择订阅计划:
  [1] Plus
  [2] Team

请输入选项 (1/2): 2
✓ 已选择: team

请输入 Team 空间名称 (可留空): acme-corp
✓ Team 空间: acme-corp

# ... OAuth 流程 ...

=== 登录成功 ===
Email: admin@acme.com
Type: codex
Plan: team
Team Space: acme-corp
File: C:\Users\YourName\.myauth\codex-team-acme-corp-admin@acme.com.json
Index: 2
```

**生成的文件名**: `codex-team-acme-corp-admin@acme.com.json`

### 场景 3: Team 用户（无空间名）

```powershell
PS> npm start login

请选择订阅计划:
  [1] Plus
  [2] Team

请输入选项 (1/2): 2
✓ 已选择: team

请输入 Team 空间名称 (可留空): 
✓ 未设置 Team 空间

# ... OAuth 流程 ...

=== 登录成功 ===
Email: admin@acme.com
Type: codex
Plan: team
File: C:\Users\YourName\.myauth\codex-team-admin@acme.com.json
Index: 2
```

**生成的文件名**: `codex-team-admin@acme.com.json`

### 场景 4: 自定义保存目录

```powershell
PS> npm start login

# ... 选择 plan ...

默认保存目录: C:\Users\YourName\.myauth
使用默认目录？(Y/n): n
请输入保存目录路径: D:\my-credentials
✓ 保存目录: D:\my-credentials

# ... OAuth 流程 ...

=== 登录成功 ===
Email: user@example.com
Type: codex
Plan: plus
File: D:\my-credentials\codex-plus-user@example.com.json
Index: 1
```

---

## 登录后操作

### 查看所有凭据

```powershell
PS> npm start ls

可用凭据源总数: 3

INDEX | EMAIL                          | TYPE
------|--------------------------------|----------
1     | old@example.com                | codex
2     | another@example.com            | codex
3     | user@example.com               | codex
```

### 切换到新凭据

```powershell
PS> npm start use -- --index 3

✓ 凭据切换成功

更新的字段:
  - tokens.id_token
  - tokens.access_token
  - tokens.account_id
  - last_refresh

目标文件: C:\Users\YourName\.codex\auth.json
备份文件: C:\Users\YourName\.codex\auth.json.2026-01-31T13-26-00-123Z.bak
```

### 查看当前状态

```powershell
PS> npm start whoami

=== 当前配置 ===
fromDir: C:\Users\YourName\.myauth
targetFile: C:\Users\YourName\.codex\auth.json
recursive: 否

=== 当前生效账号 ===
index: 3
email: user@example.com
更新时间: 2026-01-31T21:26:00+08:00
```

---

## 生成的 JSON 文件

### Plus 用户示例

**文件名**: `codex-plus-user@example.com.json`

```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "sk-proj-abc123...",
  "refresh_token": "refresh_abc123...",
  "account_id": "acc_abc123def456",
  "email": "user@example.com",
  "type": "codex",
  "plan": "plus",
  "last_refresh": "2026-01-31T21:26:00.123Z",
  "expired": "2026-02-01T21:26:00.123Z"
}
```

### Team 用户示例（有空间名）

**文件名**: `codex-team-myteamspace-admin@acme.com.json`

```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "sk-proj-xyz789...",
  "refresh_token": "refresh_xyz789...",
  "account_id": "acc_xyz789abc123",
  "email": "admin@acme.com",
  "type": "codex",
  "plan": "team",
  "team_space": "myteamspace",
  "last_refresh": "2026-01-31T21:26:00.123Z",
  "expired": "2026-02-01T21:26:00.123Z"
}
```

---

## 常见问题

### Q1: 端口被占用怎么办？

**A**: 程序会自动从 53682 开始递增查找可用端口（最多尝试 10 次）。

```powershell
正在启动本地回调服务器...
✓ 回调服务器已启动 (端口: 53683)  # 自动使用了 53683
```

如果所有端口都被占用:
```powershell
错误: 无法找到可用端口 (尝试了 53682-53691)
提示: 请检查端口是否被占用，或稍后重试
```

### Q2: 浏览器没有自动打开？

**A**: 手动复制 URL 到浏览器:

```powershell
⚠ 无法自动打开浏览器，请手动访问以下 URL:

https://auth.openai.com/oauth/authorize?client_id=...&response_type=code&...
```

### Q3: 授权超时怎么办？

**A**: 5 分钟内必须完成授权，否则会超时:

```powershell
错误: 等待授权超时 (5 分钟)
```

解决方法: 重新运行 `npm start login`

### Q4: 同名文件已存在会怎样？

**A**: 会直接覆盖旧文件（无提示）。

如果需要保留旧文件，请在登录前手动备份:
```powershell
copy C:\Users\YourName\.myauth\codex-plus-user@example.com.json C:\Users\YourName\.myauth\codex-plus-user@example.com.json.bak
```

### Q5: 如何登录多个账户？

**A**: 多次运行 `npm start login`，每次登录不同账户即可。

```powershell
# 第一次登录
npm start login
# 输出: Index: 1

# 第二次登录（不同账户）
npm start login
# 输出: Index: 2

# 查看所有账户
npm start ls
# 输出:
# INDEX | EMAIL                          | TYPE
# ------|--------------------------------|----------
# 1     | user1@example.com              | codex
# 2     | user2@example.com              | codex
```

### Q6: 登录后缓存没有更新？

**A**: 可能是以下原因:

1. **未配置 whoami**: 首次使用需要先运行 `npm start whoami` 配置工具
2. **保存目录不匹配**: 登录时选择的目录与 whoami 配置的不同

手动刷新缓存:
```powershell
npm start ls -- --refresh
```

### Q7: 如何在远程服务器上使用？

**A**: 如果在远程服务器（通过 SSH 连接）上运行，需要手动复制 URL:

```powershell
# 服务器上运行
npm start login

# 输出:
⚠ 无法自动打开浏览器，请手动访问以下 URL:
https://auth.openai.com/oauth/authorize?...

# 在本地浏览器打开该 URL
# 授权后会重定向到 http://127.0.0.1:53682/callback?code=...
```

**解决方法**: 使用 SSH 端口转发:
```powershell
# 本地机器上运行
ssh -L 53682:127.0.0.1:53682 user@remote-server

# 然后在服务器上运行 login
# 浏览器会正确回调到本地转发的端口
```

### Q8: Windows 上文件权限如何设置？

**A**: Windows 不支持 Unix 风格的文件权限（600）。

建议:
1. 将凭据目录放在用户目录下（如 `C:\Users\YourName\.myauth`）
2. 确保该目录只有当前用户可访问
3. 不要将凭据目录共享或放在公共位置

检查目录权限:
```powershell
# 右键点击目录 -> 属性 -> 安全
# 确保只有当前用户有完全控制权限
```

---

## 错误处理

### 错误 1: State 验证失败

```powershell
错误: State 验证失败，可能存在安全风险
```

**原因**: CSRF 攻击或回调 URL 被篡改

**解决**: 重新运行 `npm start login`

### 错误 2: Token 交换失败

```powershell
错误: Token 交换失败: invalid_grant
提示: 授权码可能已过期，请重新运行 myauth login
```

**原因**: 授权码已过期（通常 10 分钟有效期）

**解决**: 重新运行 `npm start login`

### 错误 3: JWT 解析失败

```powershell
错误: 无法从 ID Token 中提取邮箱
```

**原因**: ID Token 格式异常或缺少必需字段

**解决**: 
1. 检查网络连接
2. 重新运行 `npm start login`
3. 如果持续失败，请提交 issue

### 错误 4: 文件保存失败

```powershell
错误: 保存失败 - EACCES: permission denied
```

**原因**: 没有目录写入权限

**解决**:
1. 检查目录权限
2. 使用有写入权限的目录
3. 以管理员身份运行（不推荐）

---

## 安全注意事项

### ⚠️ 严禁操作

1. **不要分享凭据文件**: 包含敏感的 access_token
2. **不要提交到 Git**: 添加到 `.gitignore`
3. **不要在公共场所运行**: 避免屏幕被他人看到
4. **不要使用公共 WiFi**: 使用安全的网络连接

### ✅ 推荐做法

1. **定期更换凭据**: 定期重新登录
2. **使用强密码**: OpenAI 账户使用强密码
3. **启用 2FA**: OpenAI 账户启用两步验证
4. **备份凭据**: 定期备份到安全位置
5. **监控使用**: 定期检查 OpenAI 使用记录

---

## 开发调试

### 启用调试模式

```powershell
# 设置环境变量
$env:DEBUG = "myauth:*"

# 运行登录
npm start login
```

### 查看详细日志

```powershell
# 查看 HTTP 请求
$env:NODE_DEBUG = "http,https"

npm start login
```

### 测试端口查找

```javascript
// 手动测试
import { findAvailablePort } from './src/auth/server.js';

const port = await findAvailablePort(53682, 10);
console.log(`可用端口: ${port}`);
```

---

## 完整命令参考

```powershell
# 登录
npm start login

# 查看凭据列表
npm start ls

# 刷新凭据列表
npm start ls -- --refresh

# 切换凭据
npm start use -- --index 3

# 查看当前状态
npm start whoami

# 查看帮助
npm start -- --help
```

---

## 下一步

登录成功后，你可以:

1. **查看所有凭据**: `npm start ls`
2. **切换凭据**: `npm start use -- --index <N>`
3. **查看当前状态**: `npm start whoami`
4. **登录更多账户**: 再次运行 `npm start login`

---

**文档版本**: 1.0  
**最后更新**: 2026-01-31  
**作者**: Kiro AI Assistant

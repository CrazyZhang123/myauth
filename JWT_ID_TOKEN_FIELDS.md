# OpenAI Codex JWT ID Token 完整字段说明

## 概述

当你调用 `ParseJWTToken(tokenResp.IDToken)` 时，会解析出一个包含用户身份和订阅信息的 JWT Claims 对象。本文档详细说明每个字段的含义和用途。

## JWT 结构

JWT Token 由三部分组成（用 `.` 分隔）：
```
header.payload.signature
```

`ParseJWTToken` 函数解析的是 **payload** 部分（即 Claims）。

## 完整的 Claims 结构

```go
type JWTClaims struct {
    // 标准 JWT Claims (RFC 7519)
    AtHash        string        `json:"at_hash"`
    Aud           []string      `json:"aud"`
    Exp           int           `json:"exp"`
    Iat           int           `json:"iat"`
    Iss           string        `json:"iss"`
    Jti           string        `json:"jti"`
    Sub           string        `json:"sub"`
    Sid           string        `json:"sid"`
    
    // OpenID Connect Claims
    Email         string        `json:"email"`
    EmailVerified bool          `json:"email_verified"`
    
    // OAuth 相关
    AuthProvider  string        `json:"auth_provider"`
    AuthTime      int           `json:"auth_time"`
    Rat           int           `json:"rat"`
    
    // OpenAI 自定义 Claims
    CodexAuthInfo CodexAuthInfo `json:"https://api.openai.com/auth"`
}
```

---

## 字段详细说明

### 1. 标准 JWT Claims (RFC 7519)

#### `at_hash` (Access Token Hash)
- **类型**: `string`
- **含义**: Access Token 的哈希值
- **用途**: 用于验证 ID Token 和 Access Token 的绑定关系
- **示例**: `"xYz123AbC456DeF789"`
- **说明**: 这是 Access Token 的 SHA-256 哈希值的前半部分，Base64 URL 编码

#### `aud` (Audience)
- **类型**: `[]string` (字符串数组)
- **含义**: Token 的目标受众（接收方）
- **用途**: 验证 Token 是否发给正确的应用
- **示例**: `["app_EMoamEEZ73f0CkXaXp7hrann"]`
- **说明**: 通常包含 OAuth Client ID

#### `exp` (Expiration Time)
- **类型**: `int` (Unix 时间戳)
- **含义**: Token 过期时间
- **用途**: 验证 Token 是否仍然有效
- **示例**: `1738368000` (2026-01-31 12:00:00 UTC)
- **说明**: 超过此时间后 Token 无效，需要刷新

#### `iat` (Issued At)
- **类型**: `int` (Unix 时间戳)
- **含义**: Token 签发时间
- **用途**: 记录 Token 创建时间
- **示例**: `1738281600` (2026-01-30 12:00:00 UTC)
- **说明**: 可用于计算 Token 年龄

#### `iss` (Issuer)
- **类型**: `string`
- **含义**: Token 签发者
- **用途**: 验证 Token 来源
- **示例**: `"https://auth.openai.com"`
- **说明**: OpenAI 的认证服务器地址

#### `jti` (JWT ID)
- **类型**: `string`
- **含义**: JWT 的唯一标识符
- **用途**: 防止 Token 重放攻击
- **示例**: `"550e8400-e29b-41d4-a716-446655440000"`
- **说明**: 每个 Token 都有唯一的 ID

#### `sub` (Subject)
- **类型**: `string`
- **含义**: Token 主体（用户标识符）
- **用途**: 唯一标识用户
- **示例**: `"user-abc123def456"`
- **说明**: OpenAI 内部的用户 ID

#### `sid` (Session ID)
- **类型**: `string`
- **含义**: 会话标识符
- **用途**: 关联用户的登录会话
- **示例**: `"sess_xyz789abc123"`
- **说明**: 用于会话管理和单点登出

---

### 2. OpenID Connect Claims

#### `email`
- **类型**: `string`
- **含义**: 用户的电子邮件地址
- **用途**: 显示用户身份，用于文件命名
- **示例**: `"user@example.com"`
- **说明**: 这是用户注册 OpenAI 账户时使用的邮箱

#### `email_verified`
- **类型**: `bool`
- **含义**: 邮箱是否已验证
- **用途**: 确认用户邮箱的有效性
- **示例**: `true` 或 `false`
- **说明**: `true` 表示用户已通过邮箱验证链接

---

### 3. OAuth 认证相关

#### `auth_provider`
- **类型**: `string`
- **含义**: 认证提供商
- **用途**: 标识用户使用的登录方式
- **示例**: `"auth0"`, `"google"`, `"microsoft"`
- **说明**: 如果用户通过 Google 登录，值为 `"google"`

#### `auth_time`
- **类型**: `int` (Unix 时间戳)
- **含义**: 用户认证时间
- **用途**: 记录用户最后一次输入密码的时间
- **示例**: `1738281600`
- **说明**: 用于判断是否需要重新认证

#### `rat` (Refresh At Time)
- **类型**: `int` (Unix 时间戳)
- **含义**: 建议刷新时间
- **用途**: 提示何时应该刷新 Token
- **示例**: `1738324800`
- **说明**: 在此时间之前刷新可避免服务中断

---

### 4. OpenAI 自定义 Claims

#### `CodexAuthInfo` (命名空间: `https://api.openai.com/auth`)

这是 OpenAI 特有的自定义 Claims，包含 ChatGPT 账户和订阅信息：

```go
type CodexAuthInfo struct {
    ChatgptAccountID               string          `json:"chatgpt_account_id"`
    ChatgptPlanType                string          `json:"chatgpt_plan_type"`
    ChatgptSubscriptionActiveStart any             `json:"chatgpt_subscription_active_start"`
    ChatgptSubscriptionActiveUntil any             `json:"chatgpt_subscription_active_until"`
    ChatgptSubscriptionLastChecked time.Time       `json:"chatgpt_subscription_last_checked"`
    ChatgptUserID                  string          `json:"chatgpt_user_id"`
    Groups                         []any           `json:"groups"`
    Organizations                  []Organizations `json:"organizations"`
    UserID                         string          `json:"user_id"`
}
```

##### `chatgpt_account_id`
- **类型**: `string`
- **含义**: ChatGPT 账户 ID
- **用途**: 唯一标识 ChatGPT 账户
- **示例**: `"acc_abc123def456ghi789"`
- **说明**: 这是最重要的标识符，用于区分不同账户
- **使用场景**: 
  - 生成凭证文件名
  - 区分同一邮箱的不同账户（如个人和团队）

##### `chatgpt_plan_type`
- **类型**: `string`
- **含义**: ChatGPT 订阅计划类型
- **用途**: 标识用户的订阅级别
- **可能的值**:
  - `"free"` - 免费用户
  - `"plus"` - ChatGPT Plus 订阅
  - `"team"` - ChatGPT Team 订阅
  - `"enterprise"` - 企业订阅
  - `"legacy"` - 旧版订阅
- **示例**: `"plus"`
- **使用场景**:
  - 文件命名（如 `codex-user@example.com-plus.json`）
  - 判断用户权限和配额

##### `chatgpt_subscription_active_start`
- **类型**: `any` (可能是 `string`, `int`, 或 `null`)
- **含义**: 订阅开始时间
- **用途**: 记录订阅激活日期
- **示例**: `"2024-01-15T00:00:00Z"` 或 `1705276800` 或 `null`
- **说明**: 免费用户可能为 `null`

##### `chatgpt_subscription_active_until`
- **类型**: `any` (可能是 `string`, `int`, 或 `null`)
- **含义**: 订阅结束时间
- **用途**: 记录订阅到期日期
- **示例**: `"2025-01-15T00:00:00Z"` 或 `1736899200` 或 `null`
- **说明**: 
  - 月度订阅会显示下次续费日期
  - 取消订阅后显示最后有效日期
  - 免费用户为 `null`

##### `chatgpt_subscription_last_checked`
- **类型**: `time.Time` (ISO 8601 时间字符串)
- **含义**: 最后一次检查订阅状态的时间
- **用途**: 记录订阅信息的更新时间
- **示例**: `"2026-01-31T10:30:00Z"`
- **说明**: OpenAI 定期检查订阅状态并更新此字段

##### `chatgpt_user_id`
- **类型**: `string`
- **含义**: ChatGPT 用户 ID
- **用途**: ChatGPT 服务内部的用户标识
- **示例**: `"user-xyz789abc123"`
- **说明**: 与 `sub` 字段可能相同或不同

##### `user_id`
- **类型**: `string`
- **含义**: OpenAI 平台用户 ID
- **用途**: OpenAI 平台级别的用户标识
- **示例**: `"user-platform-123456"`
- **说明**: 跨 OpenAI 所有服务的统一用户 ID

##### `groups`
- **类型**: `[]any` (数组)
- **含义**: 用户所属的组
- **用途**: 权限和访问控制
- **示例**: `["beta-testers", "api-users"]` 或 `[]`
- **说明**: 
  - 可能包含特殊权限组
  - 如 Beta 测试组、API 访问组等

##### `organizations`
- **类型**: `[]Organizations` (组织数组)
- **含义**: 用户所属的组织列表
- **用途**: 管理团队和企业账户
- **结构**:
```go
type Organizations struct {
    ID        string `json:"id"`         // 组织 ID
    IsDefault bool   `json:"is_default"` // 是否为默认组织
    Role      string `json:"role"`       // 用户角色
    Title     string `json:"title"`      // 组织名称
}
```
- **示例**:
```json
[
  {
    "id": "org-abc123",
    "is_default": true,
    "role": "owner",
    "title": "My Company"
  },
  {
    "id": "org-def456",
    "is_default": false,
    "role": "member",
    "title": "Partner Org"
  }
]
```
- **角色类型**:
  - `"owner"` - 组织所有者
  - `"admin"` - 管理员
  - `"member"` - 普通成员
  - `"reader"` - 只读成员

---

## 完整示例

### 示例 1: 免费用户

```json
{
  "at_hash": "xYz123AbC456DeF789",
  "aud": ["app_EMoamEEZ73f0CkXaXp7hrann"],
  "auth_provider": "auth0",
  "auth_time": 1738281600,
  "email": "freeuser@example.com",
  "email_verified": true,
  "exp": 1738368000,
  "https://api.openai.com/auth": {
    "chatgpt_account_id": "acc_free123456",
    "chatgpt_plan_type": "free",
    "chatgpt_subscription_active_start": null,
    "chatgpt_subscription_active_until": null,
    "chatgpt_subscription_last_checked": "2026-01-31T10:00:00Z",
    "chatgpt_user_id": "user-free123",
    "groups": [],
    "organizations": [],
    "user_id": "user-platform-free123"
  },
  "iat": 1738281600,
  "iss": "https://auth.openai.com",
  "jti": "550e8400-e29b-41d4-a716-446655440000",
  "rat": 1738324800,
  "sid": "sess_abc123",
  "sub": "user-free123456"
}
```

### 示例 2: Plus 订阅用户

```json
{
  "at_hash": "aBc789XyZ012",
  "aud": ["app_EMoamEEZ73f0CkXaXp7hrann"],
  "auth_provider": "google",
  "auth_time": 1738281600,
  "email": "plususer@example.com",
  "email_verified": true,
  "exp": 1738368000,
  "https://api.openai.com/auth": {
    "chatgpt_account_id": "acc_plus789xyz",
    "chatgpt_plan_type": "plus",
    "chatgpt_subscription_active_start": "2024-06-15T00:00:00Z",
    "chatgpt_subscription_active_until": "2026-02-15T00:00:00Z",
    "chatgpt_subscription_last_checked": "2026-01-31T10:00:00Z",
    "chatgpt_user_id": "user-plus789",
    "groups": ["beta-testers"],
    "organizations": [],
    "user_id": "user-platform-plus789"
  },
  "iat": 1738281600,
  "iss": "https://auth.openai.com",
  "jti": "660f9511-f3ac-52e5-b827-557766551111",
  "rat": 1738324800,
  "sid": "sess_xyz789",
  "sub": "user-plus789xyz"
}
```

### 示例 3: Team 用户（多组织）

```json
{
  "at_hash": "DeF456GhI789",
  "aud": ["app_EMoamEEZ73f0CkXaXp7hrann"],
  "auth_provider": "microsoft",
  "auth_time": 1738281600,
  "email": "teamuser@company.com",
  "email_verified": true,
  "exp": 1738368000,
  "https://api.openai.com/auth": {
    "chatgpt_account_id": "acc_team456def",
    "chatgpt_plan_type": "team",
    "chatgpt_subscription_active_start": "2025-01-01T00:00:00Z",
    "chatgpt_subscription_active_until": "2026-12-31T23:59:59Z",
    "chatgpt_subscription_last_checked": "2026-01-31T10:00:00Z",
    "chatgpt_user_id": "user-team456",
    "groups": ["api-users", "enterprise-features"],
    "organizations": [
      {
        "id": "org-company123",
        "is_default": true,
        "role": "admin",
        "title": "Acme Corporation"
      },
      {
        "id": "org-partner456",
        "is_default": false,
        "role": "member",
        "title": "Partner LLC"
      }
    ],
    "user_id": "user-platform-team456"
  },
  "iat": 1738281600,
  "iss": "https://auth.openai.com",
  "jti": "770fa622-g4bd-63f6-c938-668877662222",
  "rat": 1738324800,
  "sid": "sess_team123",
  "sub": "user-team456def"
}
```

---

## 在代码中的使用

### 提取关键信息

```go
// 解析 JWT
claims, err := ParseJWTToken(tokenResp.IDToken)
if err != nil {
    log.Fatalf("Failed to parse JWT: %v", err)
}

// 获取用户邮箱
email := claims.Email
// 或使用辅助方法
email = claims.GetUserEmail()

// 获取账户 ID
accountID := claims.CodexAuthInfo.ChatgptAccountID
// 或使用辅助方法
accountID = claims.GetAccountID()

// 获取订阅类型
planType := claims.CodexAuthInfo.ChatgptPlanType

// 获取用户 ID
userID := claims.CodexAuthInfo.UserID

// 检查邮箱是否验证
if claims.EmailVerified {
    fmt.Println("Email is verified")
}

// 检查 Token 是否过期
now := time.Now().Unix()
if int64(claims.Exp) < now {
    fmt.Println("Token has expired")
}

// 获取组织信息
for _, org := range claims.CodexAuthInfo.Organizations {
    fmt.Printf("Organization: %s (Role: %s)\n", org.Title, org.Role)
    if org.IsDefault {
        fmt.Println("  ^ This is the default organization")
    }
}

// 检查用户组
if len(claims.CodexAuthInfo.Groups) > 0 {
    fmt.Printf("User is in groups: %v\n", claims.CodexAuthInfo.Groups)
}
```

### 生成文件名

```go
// 基于用户信息生成唯一文件名
func generateFileName(claims *JWTClaims) string {
    email := claims.Email
    planType := claims.CodexAuthInfo.ChatgptPlanType
    accountID := claims.CodexAuthInfo.ChatgptAccountID
    
    // 对账户 ID 进行哈希（用于 Team 账户）
    hash := sha256.Sum256([]byte(accountID))
    hashStr := hex.EncodeToString(hash[:])[:8]
    
    if planType == "team" {
        return fmt.Sprintf("codex-%s-%s-%s.json", hashStr, email, planType)
    } else if planType != "" && planType != "free" {
        return fmt.Sprintf("codex-%s-%s.json", email, planType)
    }
    return fmt.Sprintf("codex-%s.json", email)
}
```

---

## 安全注意事项

1. **不验证签名**: `ParseJWTToken` 函数**不验证** JWT 签名
   - 仅用于从已验证的 Token 中提取信息
   - Token 的验证由 OpenAI 服务器完成

2. **敏感信息**: JWT 中包含敏感信息
   - 不要在日志中打印完整的 Token
   - 不要通过不安全的渠道传输
   - 妥善保管存储的凭证文件

3. **过期检查**: 始终检查 `exp` 字段
   - 过期的 Token 应该被刷新
   - 不要使用过期的 Token 进行 API 调用

4. **订阅状态**: `chatgpt_plan_type` 可能变化
   - 用户可能升级或降级订阅
   - 定期刷新 Token 以获取最新状态

---

## 常见问题

### Q1: 为什么 `chatgpt_account_id` 和 `sub` 不同？
**A**: 
- `sub` 是 OAuth 标准字段，表示用户在认证系统中的 ID
- `chatgpt_account_id` 是 ChatGPT 服务特定的账户 ID
- 一个用户可能有多个 ChatGPT 账户（个人、团队等）

### Q2: `organizations` 数组为空意味着什么？
**A**: 用户不属于任何组织，是个人账户（Free 或 Plus）

### Q3: 如何判断用户是否有 API 访问权限？
**A**: 检查 `groups` 数组中是否包含 `"api-users"` 或类似标识

### Q4: `chatgpt_subscription_active_until` 为 null 怎么办？
**A**: 
- 免费用户通常为 `null`
- 某些订阅类型可能不设置结束时间
- 应该检查 `chatgpt_plan_type` 来判断订阅状态

### Q5: 如何处理多个组织？
**A**: 
- 使用 `is_default: true` 的组织作为默认
- 或让用户选择要使用的组织
- Team 账户通常需要指定组织 ID

---

## 参考资源

- [JWT RFC 7519](https://tools.ietf.org/html/rfc7519)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)

---

**文档版本**: 1.0  
**最后更新**: 2026-01-31  
**作者**: Kiro AI Assistant

# Codex OAuth 完整实现分析

## 概述

CLIProxyAPI 中的 Codex OAuth 实现是一个完整的 OAuth 2.0 + PKCE 认证流程，用于 OpenAI Codex 服务的身份验证。本文档详细分析其实现方式，以便集成到 myauth 项目中。

## 核心架构

### 1. 架构层次

```
┌─────────────────────────────────────────────────────────────┐
│                    CLI 命令层 (cmd)                          │
│  - openai_login.go: 用户入口命令                             │
│  - login.go: 通用登录逻辑                                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  SDK 认证管理层 (sdk/auth)                   │
│  - manager.go: 认证管理器，协调多个认证器                    │
│  - codex.go: Codex 认证器实现                                │
│  - interfaces.go: 认证接口定义                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              内部认证实现层 (internal/auth/codex)            │
│  - openai_auth.go: OAuth 核心逻辑                            │
│  - oauth_server.go: 本地回调服务器                           │
│  - pkce.go: PKCE 代码生成                                    │
│  - token.go: Token 存储                                      │
│  - jwt_parser.go: JWT 解析                                   │
│  - html_templates.go: 成功页面模板                           │
│  - errors.go: 错误处理                                       │
└─────────────────────────────────────────────────────────────┘
```

## 详细实现分析

### 2. OAuth 配置常量

```go
// 位置: internal/auth/codex/openai_auth.go
const (
    AuthURL     = "https://auth.openai.com/oauth/authorize"
    TokenURL    = "https://auth.openai.com/oauth/token"
    ClientID    = "app_EMoamEEZ73f0CkXaXp7hrann"
    RedirectURI = "http://localhost:1455/auth/callback"
)
```

**关键点:**
- 使用 OpenAI 官方 OAuth 端点
- ClientID 是公开的客户端标识符
- 回调地址固定为本地 1455 端口
- 使用 PKCE 增强安全性（无需 client_secret）

### 3. PKCE 实现 (Proof Key for Code Exchange)

#### 3.1 PKCE 数据结构

```go
// 位置: internal/auth/codex/openai.go
type PKCECodes struct {
    CodeVerifier  string `json:"code_verifier"`   // 随机生成的验证码
    CodeChallenge string `json:"code_challenge"`  // 验证码的 SHA256 哈希
}
```

#### 3.2 PKCE 生成逻辑

```go
// 位置: internal/auth/codex/pkce.go
func GeneratePKCECodes() (*PKCECodes, error) {
    // 1. 生成 96 字节随机数据 (128 个 base64 字符)
    bytes := make([]byte, 96)
    _, err := rand.Read(bytes)
    
    // 2. Base64 URL 编码（无填充）
    codeVerifier := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(bytes)
    
    // 3. SHA256 哈希并 Base64 编码
    hash := sha256.Sum256([]byte(codeVerifier))
    codeChallenge := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hash[:])
    
    return &PKCECodes{
        CodeVerifier:  codeVerifier,
        CodeChallenge: codeChallenge,
    }, nil
}
```

**PKCE 流程:**
1. 客户端生成随机 `code_verifier`
2. 计算 `code_challenge = BASE64URL(SHA256(code_verifier))`
3. 授权请求时发送 `code_challenge`
4. Token 交换时发送 `code_verifier`
5. 服务器验证 `SHA256(code_verifier) == code_challenge`

### 4. OAuth 授权 URL 生成

```go
// 位置: internal/auth/codex/openai_auth.go
func (o *CodexAuth) GenerateAuthURL(state string, pkceCodes *PKCECodes) (string, error) {
    params := url.Values{
        "client_id":                  {ClientID},
        "response_type":              {"code"},
        "redirect_uri":               {RedirectURI},
        "scope":                      {"openid email profile offline_access"},
        "state":                      {state},
        "code_challenge":             {pkceCodes.CodeChallenge},
        "code_challenge_method":      {"S256"},
        "prompt":                     {"login"},
        "id_token_add_organizations": {"true"},
        "codex_cli_simplified_flow":  {"true"},
    }
    
    return fmt.Sprintf("%s?%s", AuthURL, params.Encode()), nil
}
```

**参数说明:**
- `client_id`: 应用标识符
- `response_type=code`: 授权码模式
- `redirect_uri`: 回调地址
- `scope`: 请求的权限范围
  - `openid`: OpenID Connect 核心
  - `email`: 用户邮箱
  - `profile`: 用户资料
  - `offline_access`: 获取 refresh_token
- `state`: CSRF 防护随机字符串
- `code_challenge`: PKCE 挑战码
- `code_challenge_method=S256`: 使用 SHA256 哈希
- `prompt=login`: 强制重新登录
- `id_token_add_organizations=true`: ID Token 包含组织信息
- `codex_cli_simplified_flow=true`: 简化 CLI 流程

### 5. 本地回调服务器

#### 5.1 服务器结构

```go
// 位置: internal/auth/codex/oauth_server.go
type OAuthServer struct {
    server     *http.Server
    port       int
    resultChan chan *OAuthResult
    errorChan  chan error
    mu         sync.Mutex
    running    bool
}

type OAuthResult struct {
    Code  string  // 授权码
    State string  // 状态参数
    Error string  // 错误信息
}
```

#### 5.2 服务器启动

```go
func (s *OAuthServer) Start() error {
    // 检查端口是否可用
    if !s.isPortAvailable() {
        return fmt.Errorf("port %d is already in use", s.port)
    }
    
    // 设置路由
    mux := http.NewServeMux()
    mux.HandleFunc("/auth/callback", s.handleCallback)
    mux.HandleFunc("/success", s.handleSuccess)
    
    // 创建 HTTP 服务器
    s.server = &http.Server{
        Addr:         fmt.Sprintf(":%d", s.port),
        Handler:      mux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
    }
    
    // 异步启动
    go func() {
        if err := s.server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            s.errorChan <- fmt.Errorf("server failed to start: %w", err)
        }
    }()
    
    return nil
}
```

#### 5.3 回调处理

```go
func (s *OAuthServer) handleCallback(w http.ResponseWriter, r *http.Request) {
    query := r.URL.Query()
    code := query.Get("code")
    state := query.Get("state")
    errorParam := query.Get("error")
    
    // 错误处理
    if errorParam != "" {
        result := &OAuthResult{Error: errorParam}
        s.sendResult(result)
        http.Error(w, fmt.Sprintf("OAuth error: %s", errorParam), http.StatusBadRequest)
        return
    }
    
    // 验证参数
    if code == "" || state == "" {
        result := &OAuthResult{Error: "no_code"}
        s.sendResult(result)
        http.Error(w, "No authorization code received", http.StatusBadRequest)
        return
    }
    
    // 发送成功结果
    result := &OAuthResult{Code: code, State: state}
    s.sendResult(result)
    
    // 重定向到成功页面
    http.Redirect(w, r, "/success", http.StatusFound)
}
```

#### 5.4 等待回调

```go
func (s *OAuthServer) WaitForCallback(timeout time.Duration) (*OAuthResult, error) {
    select {
    case result := <-s.resultChan:
        return result, nil
    case err := <-s.errorChan:
        return nil, err
    case <-time.After(timeout):
        return nil, fmt.Errorf("timeout waiting for OAuth callback")
    }
}
```

### 6. Token 交换

```go
// 位置: internal/auth/codex/openai_auth.go
func (o *CodexAuth) ExchangeCodeForTokens(ctx context.Context, code string, pkceCodes *PKCECodes) (*CodexAuthBundle, error) {
    // 准备请求数据
    data := url.Values{
        "grant_type":    {"authorization_code"},
        "client_id":     {ClientID},
        "code":          {code},
        "redirect_uri":  {RedirectURI},
        "code_verifier": {pkceCodes.CodeVerifier},  // PKCE 验证码
    }
    
    // 发送 POST 请求
    req, _ := http.NewRequestWithContext(ctx, "POST", TokenURL, strings.NewReader(data.Encode()))
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    req.Header.Set("Accept", "application/json")
    
    resp, err := o.httpClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("token exchange request failed: %w", err)
    }
    defer resp.Body.Close()
    
    // 解析响应
    var tokenResp struct {
        AccessToken  string `json:"access_token"`
        RefreshToken string `json:"refresh_token"`
        IDToken      string `json:"id_token"`
        TokenType    string `json:"token_type"`
        ExpiresIn    int    `json:"expires_in"`
    }
    
    json.Unmarshal(body, &tokenResp)
    
    // 解析 ID Token 获取用户信息
    claims, _ := ParseJWTToken(tokenResp.IDToken)
    accountID := claims.GetAccountID()
    email := claims.GetUserEmail()
    
    // 创建 Token 数据
    tokenData := CodexTokenData{
        IDToken:      tokenResp.IDToken,
        AccessToken:  tokenResp.AccessToken,
        RefreshToken: tokenResp.RefreshToken,
        AccountID:    accountID,
        Email:        email,
        Expire:       time.Now().Add(time.Duration(tokenResp.ExpiresIn) * time.Second).Format(time.RFC3339),
    }
    
    return &CodexAuthBundle{
        TokenData:   tokenData,
        LastRefresh: time.Now().Format(time.RFC3339),
    }, nil
}
```

### 7. JWT Token 解析

```go
// 位置: internal/auth/codex/jwt_parser.go
type JWTClaims struct {
    Email         string        `json:"email"`
    EmailVerified bool          `json:"email_verified"`
    Exp           int           `json:"exp"`
    CodexAuthInfo CodexAuthInfo `json:"https://api.openai.com/auth"`
    Sub           string        `json:"sub"`
}

type CodexAuthInfo struct {
    ChatgptAccountID               string          `json:"chatgpt_account_id"`
    ChatgptPlanType                string          `json:"chatgpt_plan_type"`
    ChatgptUserID                  string          `json:"chatgpt_user_id"`
    Organizations                  []Organizations `json:"organizations"`
    UserID                         string          `json:"user_id"`
}

func ParseJWTToken(token string) (*JWTClaims, error) {
    // JWT 格式: header.payload.signature
    parts := strings.Split(token, ".")
    if len(parts) != 3 {
        return nil, fmt.Errorf("invalid JWT token format")
    }
    
    // 解码 payload (Base64 URL)
    claimsData, err := base64URLDecode(parts[1])
    if err != nil {
        return nil, err
    }
    
    // 解析 JSON
    var claims JWTClaims
    json.Unmarshal(claimsData, &claims)
    
    return &claims, nil
}

func base64URLDecode(data string) ([]byte, error) {
    // 添加填充
    switch len(data) % 4 {
    case 2:
        data += "=="
    case 3:
        data += "="
    }
    return base64.URLEncoding.DecodeString(data)
}
```

### 8. Token 刷新

```go
// 位置: internal/auth/codex/openai_auth.go
func (o *CodexAuth) RefreshTokens(ctx context.Context, refreshToken string) (*CodexTokenData, error) {
    data := url.Values{
        "client_id":     {ClientID},
        "grant_type":    {"refresh_token"},
        "refresh_token": {refreshToken},
        "scope":         {"openid profile email"},
    }
    
    req, _ := http.NewRequestWithContext(ctx, "POST", TokenURL, strings.NewReader(data.Encode()))
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    req.Header.Set("Accept", "application/json")
    
    resp, err := o.httpClient.Do(req)
    // ... 处理响应，返回新的 TokenData
}
```

### 9. Token 存储

```go
// 位置: internal/auth/codex/token.go
type CodexTokenStorage struct {
    IDToken      string `json:"id_token"`
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
    AccountID    string `json:"account_id"`
    LastRefresh  string `json:"last_refresh"`
    Email        string `json:"email"`
    Type         string `json:"type"`
    Expire       string `json:"expired"`
}

func (ts *CodexTokenStorage) SaveTokenToFile(authFilePath string) error {
    ts.Type = "codex"
    
    // 创建目录
    os.MkdirAll(filepath.Dir(authFilePath), 0700)
    
    // 写入 JSON 文件
    f, _ := os.Create(authFilePath)
    defer f.Close()
    
    json.NewEncoder(f).Encode(ts)
    return nil
}
```

### 10. 文件命名策略

```go
// 位置: internal/auth/codex/filename.go
func CredentialFileName(email, planType, hashAccountID string, includeProviderPrefix bool) string {
    email = strings.TrimSpace(email)
    plan := normalizePlanTypeForFilename(planType)
    
    prefix := ""
    if includeProviderPrefix {
        prefix = "codex"
    }
    
    if plan == "" {
        return fmt.Sprintf("%s-%s.json", prefix, email)
    } else if plan == "team" {
        return fmt.Sprintf("%s-%s-%s-%s.json", prefix, hashAccountID, email, plan)
    }
    return fmt.Sprintf("%s-%s-%s.json", prefix, email, plan)
}
```

**文件名示例:**
- `codex-user@example.com.json` (免费用户)
- `codex-user@example.com-plus.json` (Plus 用户)
- `codex-abc12345-user@example.com-team.json` (Team 用户)

### 11. 完整认证流程

```go
// 位置: sdk/auth/codex.go
func (a *CodexAuthenticator) Login(ctx context.Context, cfg *config.Config, opts *LoginOptions) (*coreauth.Auth, error) {
    // 1. 生成 PKCE 代码
    pkceCodes, _ := codex.GeneratePKCECodes()
    
    // 2. 生成随机 state
    state, _ := misc.GenerateRandomState()
    
    // 3. 启动本地回调服务器
    oauthServer := codex.NewOAuthServer(callbackPort)
    oauthServer.Start()
    defer oauthServer.Stop(ctx)
    
    // 4. 生成授权 URL
    authSvc := codex.NewCodexAuth(cfg)
    authURL, _ := authSvc.GenerateAuthURL(state, pkceCodes)
    
    // 5. 打开浏览器
    if !opts.NoBrowser {
        browser.OpenURL(authURL)
    } else {
        fmt.Printf("Visit: %s\n", authURL)
    }
    
    // 6. 等待回调
    result, _ := oauthServer.WaitForCallback(5 * time.Minute)
    
    // 7. 验证 state
    if result.State != state {
        return nil, fmt.Errorf("state mismatch")
    }
    
    // 8. 交换 Token
    authBundle, _ := authSvc.ExchangeCodeForTokens(ctx, result.Code, pkceCodes)
    
    // 9. 创建存储对象
    tokenStorage := authSvc.CreateTokenStorage(authBundle)
    
    // 10. 生成文件名
    fileName := codex.CredentialFileName(tokenStorage.Email, planType, hashAccountID, true)
    
    // 11. 返回认证记录
    return &coreauth.Auth{
        ID:       fileName,
        Provider: "codex",
        FileName: fileName,
        Storage:  tokenStorage,
        Metadata: map[string]any{"email": tokenStorage.Email},
    }, nil
}
```

## 关键技术点总结

### 1. 安全特性

- **PKCE (RFC 7636)**: 防止授权码拦截攻击
- **State 参数**: 防止 CSRF 攻击
- **本地回调**: 避免在公网暴露回调端点
- **Token 过期管理**: 自动刷新机制

### 2. 用户体验

- **自动打开浏览器**: 简化认证流程
- **SSH 隧道提示**: 支持远程服务器场景
- **手动输入回调**: 浏览器无法自动回调时的备选方案
- **成功页面**: 友好的认证完成提示

### 3. 错误处理

- **端口占用检测**: 提前检查端口可用性
- **超时机制**: 5 分钟回调超时
- **重试机制**: Token 刷新失败重试
- **用户友好错误**: 将技术错误转换为可读信息

### 4. 多账户支持

- **文件名区分**: 通过邮箱和计划类型区分
- **Team 账户**: 使用账户 ID 哈希避免冲突
- **元数据存储**: 保存用户信息便于管理

## 集成到 myauth 的建议

### 1. 核心模块

```
myauth/
├── src/
│   ├── auth/
│   │   ├── codex/
│   │   │   ├── oauth.js          # OAuth 核心逻辑
│   │   │   ├── server.js         # 本地回调服务器
│   │   │   ├── pkce.js           # PKCE 生成
│   │   │   ├── token.js          # Token 管理
│   │   │   └── jwt.js            # JWT 解析
│   │   └── manager.js            # 认证管理器
│   ├── commands/
│   │   └── codex-login.js        # Codex 登录命令
│   └── utils/
│       ├── browser.js            # 浏览器打开
│       └── storage.js            # 文件存储
```

### 2. 实现步骤

1. **实现 PKCE 生成器** (pkce.js)
   - 使用 Node.js crypto 模块
   - 生成随机 code_verifier
   - 计算 SHA256 code_challenge

2. **实现本地回调服务器** (server.js)
   - 使用 Express 或原生 http 模块
   - 监听 /auth/callback 路径
   - 提供成功页面

3. **实现 OAuth 流程** (oauth.js)
   - 生成授权 URL
   - 交换授权码
   - 刷新 Token

4. **实现 JWT 解析** (jwt.js)
   - Base64 URL 解码
   - 提取用户信息

5. **实现存储管理** (storage.js)
   - JSON 文件读写
   - 文件名生成策略

6. **实现 CLI 命令** (codex-login.js)
   - 整合上述模块
   - 提供用户交互

### 3. 配置文件

```json
{
  "codex": {
    "authUrl": "https://auth.openai.com/oauth/authorize",
    "tokenUrl": "https://auth.openai.com/oauth/token",
    "clientId": "app_EMoamEEZ73f0CkXaXp7hrann",
    "redirectUri": "http://localhost:1455/auth/callback",
    "callbackPort": 1455,
    "scopes": ["openid", "email", "profile", "offline_access"]
  }
}
```

### 4. 使用示例

```bash
# 登录
myauth codex login

# 指定端口
myauth codex login --port 3000

# 不打开浏览器
myauth codex login --no-browser

# 查看当前用户
myauth codex whoami

# 列出所有账户
myauth codex ls

# 切换账户
myauth codex use user@example.com
```

## 参考资源

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [JWT RFC 7519](https://tools.ietf.org/html/rfc7519)

## 注意事项

1. **Client ID 可能变化**: OpenAI 可能更新 Client ID，需要定期检查
2. **端点可能变化**: OAuth 端点 URL 可能更新
3. **Scope 权限**: 确保请求的 scope 与实际需求匹配
4. **Token 安全**: 妥善保管 access_token 和 refresh_token
5. **错误处理**: 完善的错误处理和用户提示
6. **跨平台兼容**: 考虑 Windows/Linux/macOS 的差异

---

**文档版本**: 1.0  
**最后更新**: 2026-01-31  
**作者**: Kiro AI Assistant

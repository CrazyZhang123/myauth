# 如何克隆和运行 dev 分支

## 方法 1: 直接克隆 dev 分支

```bash
# 克隆 dev 分支
git clone -b dev https://github.com/CrazyZhang123/myauth.git
cd myauth

# 安装依赖
npm install

# 全局链接
npm link

# 使用
myauth whoami
```

## 方法 2: 克隆后切换到 dev 分支

```bash
# 克隆仓库
git clone https://github.com/CrazyZhang123/myauth.git
cd myauth

# 查看所有分支
git branch -a

# 切换到 dev 分支
git checkout dev

# 安装依赖
npm install

# 全局链接
npm link

# 使用
myauth whoami
```

## 方法 3: 本地开发（不全局安装）

```bash
# 克隆 dev 分支
git clone -b dev https://github.com/CrazyZhang123/myauth.git
cd myauth

# 安装依赖
npm install

# 直接运行（不需要 npm link）
node bin/cli.js whoami
node bin/cli.js ls
node bin/cli.js use --index 1

# 或使用 npm start
npm start -- whoami
npm start -- ls
```

## 验证安装

```bash
# 检查版本
myauth --version

# 查看帮助
myauth --help

# 测试配置（使用默认路径）
myauth whoami
# 直接按回车使用默认值:
# fromDir: ~/.cli-proxy-api
# targetFile: ~/.codex/auth.json
```

## 新功能测试

### 1. 测试路径解析（~ 符号）

```bash
myauth whoami

# 输入测试:
请输入凭据源目录路径 (默认: ~/.cli-proxy-api): ~/.cli-proxy-api
请输入目标 JSON 文件路径 (默认: ~/.codex/auth.json): ~/.codex/auth.json
是否递归扫描子目录？(y/N): n
```

### 2. 测试默认路径

```bash
myauth whoami

# 直接按回车使用默认值:
请输入凭据源目录路径 (默认: ~/.cli-proxy-api): [回车]
请输入目标 JSON 文件路径 (默认: ~/.codex/auth.json): [回车]
是否递归扫描子目录？(y/N): n
```

### 3. 测试跨平台路径

**所有平台统一使用 ~ 符号**:
```bash
myauth whoami
# 输入: ~/.cli-proxy-api
# 输入: ~/.codex/auth.json
```

**或使用完整路径**:
```bash
# Windows
myauth whoami
# 输入: C:\Users\ZJJ\.cli-proxy-api

# macOS
myauth whoami
# 输入: /Users/zjj/.cli-proxy-api

# Linux
myauth whoami
# 输入: /home/zjj/.cli-proxy-api
```

## 开发模式

### 监听文件变化（可选）

```bash
# 安装 nodemon
npm install -g nodemon

# 使用 nodemon 运行
nodemon bin/cli.js whoami
```

### 调试模式

```bash
# 使用 Node.js 调试器
node --inspect bin/cli.js whoami

# 在 Chrome 中打开: chrome://inspect
```

## 分支管理

### 查看当前分支

```bash
git branch
# * dev
#   main
```

### 切换分支

```bash
# 切换到 main 分支
git checkout main

# 切换回 dev 分支
git checkout dev
```

### 拉取最新代码

```bash
# 拉取 dev 分支最新代码
git pull origin dev

# 重新安装依赖（如果 package.json 有更新）
npm install
```

### 查看分支差异

```bash
# 查看 dev 和 main 的差异
git diff main..dev

# 查看文件列表差异
git diff --name-only main..dev
```

## 常见问题

### Q: npm link 失败怎么办？

**Windows**:
```bash
# 以管理员身份运行 PowerShell
npm link
```

**macOS/Linux**:
```bash
# 使用 sudo
sudo npm link
```

### Q: 如何卸载全局链接？

```bash
npm unlink -g myauth
```

### Q: 如何更新到最新的 dev 分支？

```bash
cd myauth
git pull origin dev
npm install
```

### Q: 如何查看 dev 分支的新功能？

```bash
# 查看提交历史
git log --oneline

# 查看最近 5 次提交
git log --oneline -5

# 查看某次提交的详细内容
git show <commit-hash>
```

## dev 分支新特性

### ✨ 路径解析支持

- 支持 `~` 符号表示用户主目录
- 跨平台兼容（Windows/macOS/Linux）
- 自动解析相对路径和绝对路径

### ✨ 默认路径配置

- fromDir 默认: `~/.cli-proxy-api`
- targetFile 默认: `~/.codex/auth.json`
- 直接按回车即可使用默认值

### ✨ 开发文档

- 新增 `DEVELOPMENT.md` 开发指南
- 详细的代码结构说明
- 完整的测试流程

### ✨ 路径显示优化

- 配置显示时自动将用户目录替换为 `~`
- 更简洁的路径展示

## 贡献代码到 dev 分支

```bash
# 1. Fork 项目并克隆
git clone https://github.com/YOUR_USERNAME/myauth.git
cd myauth

# 2. 切换到 dev 分支
git checkout dev

# 3. 创建功能分支
git checkout -b feature/my-feature

# 4. 开发并提交
git add .
git commit -m "feat: Add my feature"

# 5. 推送到你的 fork
git push origin feature/my-feature

# 6. 在 GitHub 上创建 Pull Request 到 dev 分支
```

## 反馈问题

如果在使用 dev 分支时遇到问题：

1. 查看 [Issues](https://github.com/CrazyZhang123/myauth/issues)
2. 创建新 Issue 并标注 `dev` 标签
3. 提供详细的错误信息和复现步骤

---

**祝开发愉快！** 🚀

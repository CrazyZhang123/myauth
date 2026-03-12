# `zjjauth`

基于 OAuth 2.0 + PKCE 的 Codex 多账号工具，聚焦三件事：

- `login`：登录并保存账号
- `pool`：查看帐号池、按序号切换 / 删除
- `watch`：自动监控额度并在低额度时切换账号

## 安装

一次性使用：

```bash
npx zjjauth
```

全局安装：

```bash
npm install -g zjjauth
zjjauth
```

## 默认路径

- 凭据目录：`~/.zjjauth`
- Codex 目标文件：`~/.codex/auth.json`

不再需要单独配置路径；目录不存在时会自动创建。

## 命令

```bash
zjjauth
zjjauth login
zjjauth pool
zjjauth watch
zjjauth watch --install-service
zjjauth watch --status
```

## 帐号池

`zjjauth pool` 会：

- 优先刷新当前账号的 `/usage`
- 再刷新最近使用的其他账号
- 按序号手动切换账号
- 输入 `d` 后按序号删除账号

状态说明：

- `健康`：两个窗口都高于自动切号阈值
- `低于 10%`：任一窗口剩余额度低于 10%
- `已耗尽`：任一窗口剩余额度为 0
- `请求失败`：实时刷新失败，通常会回退到最近一次已知样本
- `已失效`：凭据 401 / deactivated / refresh 失败
- `未采样`：暂时没有实时额度样本

## 自动切号

`zjjauth watch` 是唯一公开的自动切号入口。

切号策略：

- 检测源统一使用官方 `/usage`
- 任一窗口剩余额度 `< 10%` 就触发切号
- 不等到 `0%`
- 候选账号优先选择“最健康”的账号，而不是按序号轮转
- 已知低于阈值或已失效的账号会被跳过

## 系统自启

支持两种平台：

- macOS：`LaunchAgent`
- Windows：计划任务（登录自启）

安装并启动：

```bash
zjjauth watch --install-service
```

查看状态：

```bash
zjjauth watch --status
```

停止服务：

```bash
zjjauth watch --stop
```

卸载服务：

```bash
zjjauth watch --uninstall-service
```

服务行为：

- macOS：安装到 `~/Library/LaunchAgents/`
- Windows：注册为当前用户的计划任务 `zjjauth-watch`
- 登录后自动启动
- 使用全局 `zjjauth watch --foreground-service`
- 日志写入 `~/.zjjauth/watch.log` 与 `~/.zjjauth/watch.err.log`

## 代理

如需代理，设置：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
```

## 安全说明

- token 不会打印到终端
- OAuth 回调固定监听 `127.0.0.1:1455`
- 凭据文件在类 Unix 系统下会写成 `600`
- 切换 `auth.json` 时会先备份再原子替换

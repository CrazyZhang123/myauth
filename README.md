# `zjjauth`

基于 OAuth 2.0 + PKCE 的 Codex 多账号工具，聚焦两件事：

- `login`：登录并保存账号
- `pool`：查看帐号池、按序号切换 / 删除

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

目录不存在时会自动创建。

## 命令

```bash
zjjauth
zjjauth login
zjjauth pool
```

## 帐号池

`zjjauth pool` 会：

- 优先刷新当前账号的 `/usage`
- 尝试补刷新最近使用的其他账号
- 按序号手动切换账号
- 输入 `d` 后按序号删除账号

状态说明：

- `健康`：两个窗口剩余额度都高于提醒阈值
- `低于 10%`：任一窗口剩余额度低于 10%
- `已耗尽`：任一窗口剩余额度为 0
- `请求失败`：实时刷新失败，通常会回退到最近一次已知样本
- `已失效`：凭据 401 / deactivated / refresh 失败
- `未采样`：暂时没有实时额度样本

## 代理

程序启动时会先按当前系统询问是否启用本地代理，并让你输入端口号；默认主机是 `127.0.0.1`。

- Windows：会提示 Windows 本地 HTTP 代理端口，常见如 `7890`、`7897`
- macOS：会提示 macOS 本地 HTTP 代理端口，常见如 `7890`、`6152`
- Linux：会提示 Linux 本地 HTTP 代理端口，常见如 `7890`、`7897`

如果你想手动设置环境变量，不同系统可以这样写：

Windows PowerShell：

```powershell
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
$env:HTTP_PROXY = "http://127.0.0.1:7890"
```

Windows CMD：

```cmd
set HTTPS_PROXY=http://127.0.0.1:7890
set HTTP_PROXY=http://127.0.0.1:7890
```

macOS：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

Linux：

```bash
export HTTPS_PROXY=http://127.0.0.1:7890
export HTTP_PROXY=http://127.0.0.1:7890
```

## 安全说明

- token 不会打印到终端
- OAuth 回调固定监听 `127.0.0.1:1455`
- 凭据文件在类 Unix 系统下会写成 `600`
- 切换 `auth.json` 时会先备份再原子替换

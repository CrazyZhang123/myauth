/**
 * 本地 OAuth 回调服务器
 * 仅监听 127.0.0.1，处理授权回调
 */

import http from 'http';
import { URL } from 'url';

/**
 * 成功页面 HTML
 */
const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录成功 - myauth</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 1rem;
        }
        .container {
            text-align: center;
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            max-width: 480px;
            width: 100%;
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .success-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1.5rem;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 2rem;
            font-weight: bold;
        }
        h1 {
            color: #1f2937;
            margin-bottom: 1rem;
            font-size: 1.75rem;
            font-weight: 600;
        }
        .subtitle {
            color: #6b7280;
            margin-bottom: 1.5rem;
            font-size: 1rem;
            line-height: 1.5;
        }
        .button {
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            border: none;
            background: #3b82f6;
            color: white;
            transition: all 0.2s;
        }
        .button:hover {
            background: #2563eb;
            transform: translateY(-1px);
        }
        .countdown {
            color: #9ca3af;
            font-size: 0.75rem;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✓</div>
        <h1>认证成功！</h1>
        <p class="subtitle">您已成功完成 OAuth 认证。请返回终端查看结果。</p>
        <button class="button" onclick="window.close()">关闭窗口</button>
        <div class="countdown">
            此窗口将在 <span id="countdown">10</span> 秒后自动关闭
        </div>
    </div>
    <script>
        let countdown = 10;
        const countdownElement = document.getElementById('countdown');
        const timer = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            if (countdown <= 0) {
                clearInterval(timer);
                window.close();
            }
        }, 1000);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') window.close();
        });
    </script>
</body>
</html>`;

/**
 * 错误页面 HTML
 */
const ERROR_HTML = (error) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>认证失败 - myauth</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            padding: 1rem;
        }
        .container {
            text-align: center;
            background: white;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            max-width: 480px;
            width: 100%;
        }
        .error-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 1.5rem;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 2rem;
            font-weight: bold;
        }
        h1 {
            color: #1f2937;
            margin-bottom: 1rem;
            font-size: 1.75rem;
            font-weight: 600;
        }
        .error-message {
            color: #6b7280;
            margin-bottom: 1.5rem;
            font-size: 0.875rem;
            padding: 1rem;
            background: #fef2f2;
            border-radius: 6px;
            border: 1px solid #fecaca;
        }
        .button {
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            cursor: pointer;
            border: none;
            background: #6b7280;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">✗</div>
        <h1>认证失败</h1>
        <div class="error-message">${error}</div>
        <button class="button" onclick="window.close()">关闭窗口</button>
    </div>
</body>
</html>`;

/**
 * 创建 OAuth 回调服务器
 * @param {string} expectedState - 期望的 state 值
 * @returns {Promise<{server: http.Server, codePromise: Promise<string>}>}
 */
export function createCallbackServer(expectedState) {
  let resolveCode, rejectCode;
  
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = http.createServer((req, res) => {
    const port = server.address()?.port || 0;
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    // 处理回调 - 支持 /callback 和 /auth/callback
    if (url.pathname === '/callback' || url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      // 错误处理
      if (error) {
        const errorMsg = errorDescription || error;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML(errorMsg));
        rejectCode(new Error(`OAuth 错误: ${errorMsg}`));
        return;
      }

      // 验证参数
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML('未收到授权码'));
        rejectCode(new Error('未收到授权码'));
        return;
      }

      if (!state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML('未收到 state 参数'));
        rejectCode(new Error('未收到 state 参数'));
        return;
      }

      // 验证 state (CSRF 防护)
      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(ERROR_HTML('State 验证失败，可能存在安全风险'));
        rejectCode(new Error('State 验证失败'));
        return;
      }

      // 成功
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      resolveCode(code);
      return;
    }

    // 其他路径返回 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return { server, codePromise };
}

/**
 * 启动回调服务器
 * @param {string} expectedState - 期望的 state
 * @param {number} port - 监听端口（默认 1455）
 * @returns {Promise<{port: number, server: http.Server, waitForCode: () => Promise<string>}>}
 */
export async function startCallbackServer(expectedState, port = 1455) {
  // 创建服务器
  const { server, codePromise } = createCallbackServer(expectedState);

  // 启动服务器，使用指定端口（OpenAI 预先注册的端口）
  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${port} 已被占用，请关闭占用该端口的程序后重试`));
      } else {
        reject(err);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      resolve();
    });
  });

  // 返回端口、服务器和等待授权码的函数
  return {
    port,
    server,
    waitForCode: (timeoutMs = 300000) => {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('等待授权超时 (5 分钟)')), timeoutMs);
      });
      return Promise.race([codePromise, timeoutPromise]);
    }
  };
}

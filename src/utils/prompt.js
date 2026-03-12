import readline from 'readline';

// 创建 readline 接口
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// 询问问题
export function question(prompt) {
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 判断是否为返回主菜单命令
export function isBackCommand(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  return normalized === 'b' || normalized === 'back';
}

// 询问 Yes/No（不自动添加后缀，由调用者控制）
export async function confirm(prompt) {
  const answer = await question(prompt);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

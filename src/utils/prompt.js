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

// 询问 Yes/No
export async function confirm(prompt) {
  const answer = await question(`${prompt} (Y/N): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

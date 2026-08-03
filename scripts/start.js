const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const appDir = path.join(__dirname, '..');

function getPlatformBinary() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return path.join('Electron.app', 'Contents', 'MacOS', 'Electron');
    default:
      return 'electron';
  }
}

function resolveElectronPath() {
  try {
    const p = require('electron');
    if (p && fs.existsSync(p)) {
      return p;
    }
  } catch (_) {}
  const binary = path.join(appDir, 'node_modules', 'electron', 'dist', getPlatformBinary());
  return fs.existsSync(binary) ? binary : null;
}

function isSandboxUsable(electronPath) {
  const sandboxBin = path.join(path.dirname(electronPath), 'chrome-sandbox');
  if (!fs.existsSync(sandboxBin)) {
    return true;
  }
  try {
    const st = fs.statSync(sandboxBin);
    return st.uid === 0 && (st.mode & 0o4000) === 0o4000;
  } catch (_) {
    return false;
  }
}

function main() {
  const electronPath = resolveElectronPath();
  if (!electronPath) {
    console.error('未找到 Electron 二进制，请先运行 npm install');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (process.platform === 'linux' && !isSandboxUsable(electronPath)) {
    console.warn('[start] 检测到受限文件系统(chrome-sandbox 不可用)，自动追加 --no-sandbox --ozone-platform=x11');
    const extras = ['--no-sandbox', '--ozone-platform=x11'];
    for (const flag of extras) {
      if (!args.includes(flag)) {
        args.push(flag);
      }
    }
  }
  args.push(appDir);

  const child = spawn(electronPath, args, { stdio: 'inherit', env: process.env });
  child.on('close', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code == null ? 1 : code);
    }
  });
  ['SIGINT', 'SIGTERM', 'SIGUSR2'].forEach((sig) => {
    process.on(sig, () => child.kill(sig));
  });
}

main();

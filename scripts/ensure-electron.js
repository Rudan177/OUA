const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronDir, 'dist');

function getExpectedBinary() {
  switch (process.platform) {
    case 'win32':
      return 'electron.exe';
    case 'darwin':
      return path.join('Electron.app', 'Contents', 'MacOS', 'Electron');
    default:
      return 'electron';
  }
}

function main() {
  const expected = getExpectedBinary();
  const binaryPath = path.join(distDir, expected);

  if (fs.existsSync(binaryPath)) {
    console.log('Electron 二进制正常 (' + process.platform + ' ' + process.arch + ')');
    process.exit(0);
  }

  console.log('未检测到当前平台 (' + process.platform + ' ' + process.arch + ') 的 Electron 二进制: ' + binaryPath);
  console.log('正在下载对应平台的 Electron...');

  const installJs = path.join(electronDir, 'install.js');
  if (!fs.existsSync(installJs)) {
    console.error('找不到 ' + installJs);
    console.error('请先运行 npm install 安装依赖');
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [installJs], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error('Electron 二进制下载失败 (exit ' + result.status + ')');
    process.exit(result.status || 1);
  }

  if (!fs.existsSync(binaryPath)) {
    console.error('下载完成后仍未找到 ' + binaryPath);
    console.error('请检查网络，或手动执行: node node_modules/electron/install.js');
    process.exit(1);
  }

  console.log('Electron 二进制就绪: ' + binaryPath);
  process.exit(0);
}

main();

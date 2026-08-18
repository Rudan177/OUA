/**
 * 编译 C# 托盘助手 hotkey-helper.exe
 * 使用 .NET Framework 自带 csc.exe（Windows 必备），产物约 10KB，随仓库提交。
 * 用法: node scripts/build-hotkey-helper.js
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const toolsDir = path.join(__dirname, '..', 'tools');
const csFile = path.join(toolsDir, 'hotkey-helper.cs');
const exeFile = path.join(toolsDir, 'hotkey-helper.exe');
const exeDir = path.dirname(exeFile);

// csc.exe 候选路径
const CSC_CANDIDATES = [
  process.env.WINDIR + '\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  process.env.WINDIR + '\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
];

function main() {
  if (!fs.existsSync(csFile)) {
    console.error('找不到 ' + csFile);
    process.exit(1);
  }
  const csc = CSC_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!csc) {
    console.error('未找到 csc.exe（需要 .NET Framework 4.x）');
    process.exit(1);
  }

  const manifestFile = path.join(toolsDir, 'app.manifest');
  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    '/win32manifest:' + manifestFile,
    '/out:' + exeFile,
    csFile
  ];
  console.log('编译 hotkey-helper.exe ...');
  execFileSync(csc, args, { stdio: 'inherit' });

  if (fs.existsSync(exeFile)) {
    const size = fs.statSync(exeFile).size;
    console.log('编译成功: ' + exeFile + ' (' + Math.round(size / 1024) + ' KB)');
  } else {
    console.error('编译失败，未生成 exe');
    process.exit(1);
  }
}

main();

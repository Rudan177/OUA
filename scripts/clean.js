const fs = require('fs');
const path = require('path');
// electron-builder 配置的打包输出目录是 build2（见 electron-builder.json directories.output）
const dist = path.join(__dirname, '..', 'build2');
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
  console.log('Cleaned build2 directory');
} else {
  console.log('No build2 directory to clean');
}

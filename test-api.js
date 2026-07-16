const https = require('https');
const url = 'https://api.github.com/repos/Rudan177/OOOInterface/contents/main/Script/version.js?ref=LTS';

https.get(url, { headers: { 'User-Agent': 'OUA-Update-Assistant' } }, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('状态码:', res.statusCode);
    if (res.statusCode === 200) {
      const j = JSON.parse(d);
      const content = Buffer.from(j.content, 'base64').toString('utf8');
      console.log('文件内容前100字:', content.substring(0, 100));
      const match = content.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
      console.log('提取版本号:', match ? match[1] : '未找到');
    } else {
      console.log('响应:', d.substring(0, 200));
    }
  });
}).on('error', e => console.error('错误:', e.message));

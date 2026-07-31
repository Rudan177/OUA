const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.join(__dirname, '..');
const sourceIcon = path.join(projectRoot, 'renderer', 'assets', 'icons', 'logo.png');
const outputDir = path.join(projectRoot, 'build', 'icons');
const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('不是有效的 PNG 文件: 签名不匹配');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height) {
    throw new Error('PNG 缺少 IHDR 信息');
  }
  if (bitDepth !== 8) {
    throw new Error('仅支持 8 位色深的 PNG，当前为 ' + bitDepth + ' 位');
  }
  if (colorType === 3) {
    throw new Error('不支持调色板类型(Palette)的 PNG');
  }

  const channelCount = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channelCount) {
    throw new Error('不支持的 PNG 颜色类型: ' + colorType);
  }

  const rawData = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = channelCount;
  const stride = width * bytesPerPixel;

  const rgba = Buffer.alloc(width * height * 4);
  let prevRow = Buffer.alloc(stride);
  let pos = 0;

  for (let y = 0; y < height; y++) {
    const filter = rawData[pos];
    pos++;
    const row = rawData.subarray(pos, pos + stride);
    pos += stride;

    const unfiltered = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const raw = row[x];
      const left = x >= bytesPerPixel ? unfiltered[x - bytesPerPixel] : 0;
      const up = prevRow[x];
      const upLeft = x >= bytesPerPixel ? prevRow[x - bytesPerPixel] : 0;

      let value;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = (raw + left) & 0xff;
          break;
        case 2:
          value = (raw + up) & 0xff;
          break;
        case 3:
          value = (raw + ((left + up) >> 1)) & 0xff;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          value = (raw + predictor) & 0xff;
          break;
        }
        default:
          throw new Error('未知的 PNG 滤波类型: ' + filter);
      }
      unfiltered[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const src = x * bytesPerPixel;
      const dst = (y * width + x) * 4;
      switch (colorType) {
        case 0:
          rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = unfiltered[src];
          rgba[dst + 3] = 255;
          break;
        case 2:
          rgba[dst] = unfiltered[src];
          rgba[dst + 1] = unfiltered[src + 1];
          rgba[dst + 2] = unfiltered[src + 2];
          rgba[dst + 3] = 255;
          break;
        case 4:
          rgba[dst] = rgba[dst + 1] = rgba[dst + 2] = unfiltered[src];
          rgba[dst + 3] = unfiltered[src + 1];
          break;
        case 6:
          rgba[dst] = unfiltered[src];
          rgba[dst + 1] = unfiltered[src + 1];
          rgba[dst + 2] = unfiltered[src + 2];
          rgba[dst + 3] = unfiltered[src + 3];
          break;
      }
    }

    prevRow = unfiltered;
  }

  return { width, height, rgba };
}

function resizeAreaAverage(src, srcWidth, srcHeight, dstWidth, dstHeight) {
  const srcRgba = src.rgba;
  const dst = Buffer.alloc(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    const srcYStart = Math.floor(y * yRatio);
    const srcYEnd = Math.max(srcYStart + 1, Math.floor((y + 1) * yRatio));
    for (let x = 0; x < dstWidth; x++) {
      const srcXStart = Math.floor(x * xRatio);
      const srcXEnd = Math.max(srcXStart + 1, Math.floor((x + 1) * xRatio));

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = srcYStart; sy < srcYEnd; sy++) {
        for (let sx = srcXStart; sx < srcXEnd; sx++) {
          const idx = (sy * srcWidth + sx) * 4;
          r += srcRgba[idx];
          g += srcRgba[idx + 1];
          b += srcRgba[idx + 2];
          a += srcRgba[idx + 3];
          count++;
        }
      }

      const dstIdx = (y * dstWidth + x) * 4;
      dst[dstIdx] = Math.round(r / count);
      dst[dstIdx + 1] = Math.round(g / count);
      dst[dstIdx + 2] = Math.round(b / count);
      dst[dstIdx + 3] = Math.round(a / count);
    }
  }
  return dst;
}

function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos] = 0;
    pos++;
    rgba.copy(raw, pos, y * stride, (y + 1) * stride);
    pos += stride;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function main() {
  if (!fs.existsSync(sourceIcon)) {
    console.error('找不到源图标: ' + sourceIcon);
    process.exit(1);
  }

  let source;
  try {
    source = decodePng(fs.readFileSync(sourceIcon));
  } catch (error) {
    console.error('源图标解析失败: ' + error.message);
    process.exit(1);
  }

  if (source.width !== source.height) {
    console.warn('警告: 源图标不是正方形 (' + source.width + 'x' + source.height + ')，生成结果可能变形');
  }

  fs.mkdirSync(outputDir, { recursive: true });

  for (const size of sizes) {
    const resizedRgba = resizeAreaAverage(source, source.width, source.height, size, size);
    const outFile = path.join(outputDir, size + 'x' + size + '.png');
    fs.writeFileSync(outFile, encodePng(resizedRgba, size, size));
    console.log('已生成 ' + outFile);
  }

  console.log('图标生成完成: ' + outputDir);
}

main();

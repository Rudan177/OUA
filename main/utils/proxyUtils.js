/**
 * 代理检测工具 - 从系统环境变量和 Windows 注册表检测代理
 */
const logger = require('./logger');
const { execFileSync } = require('child_process');

/**
 * 检测系统代理 URL（同步版，仅用于快速环境变量检查）
 * @returns {string|null} 代理 URL 或 null
 */
function detectSystemProxyUrl() {
  const envProxy = process.env.HTTP_PROXY || process.env.http_proxy ||
                   process.env.HTTPS_PROXY || process.env.https_proxy;

  if (envProxy) {
    logger.info(`检测到系统环境变量代理: ${envProxy}`);
    return envProxy;
  }

  return null;
}

/**
 * 从 Windows 注册表读取代理设置
 * @returns {{proxyEnable: number, proxyServer: string}|null}
 */
function readRegistryProxy() {
  try {
    const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    
    // 读取 ProxyEnable
    const enableOutput = execFileSync('reg', ['query', regPath, '/v', 'ProxyEnable'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    
    // 解析输出，格式: "    ProxyEnable    REG_DWORD    0x1"
    // 某些 Windows 版本可能是 REG_BINARY 类型
    const enableMatch = enableOutput.match(/ProxyEnable\s+REG_(?:DWORD|BINARY)\s+0x([0-9a-fA-F]+)/i);
    if (!enableMatch) {
      logger.info(`ProxyEnable 格式解析失败，输出: ${enableOutput.trim()}`);
      return null;
    }
    
    const proxyEnable = parseInt(enableMatch[1], 16);
    if (proxyEnable !== 1) {
      logger.info(`系统代理未启用 (ProxyEnable=${proxyEnable})`);
      return null;
    }
    
    // ProxyEnable=1，继续读取 ProxyServer
    const serverOutput = execFileSync('reg', ['query', regPath, '/v', 'ProxyServer'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    });
    
    // 解析输出，格式: "    ProxyServer    REG_SZ    127.0.0.1:7890"
    // 使用更灵活的正则，匹配 REG_SZ、REG_MULTI_SZ 等类型
    const serverMatch = serverOutput.match(/ProxyServer\s+REG_\w+\s+(.+)/i);
    if (!serverMatch) {
      logger.info(`ProxyServer 格式解析失败，输出: ${serverOutput.trim()}`);
      return null;
    }
    
    return {
      proxyEnable: proxyEnable,
      proxyServer: serverMatch[1].trim()
    };
  } catch (error) {
    logger.info(`读取注册表代理设置失败: ${error.message}`);
    return null;
  }
}

/**
 * 检测系统代理 URL（异步版，包含注册表查询）
 * @returns {Promise<string|null>} 代理 URL 或 null
 */
async function detectSystemProxyUrlAsync() {
  const envProxy = detectSystemProxyUrl();
  if (envProxy) {
    return envProxy;
  }

  try {
    const regResult = readRegistryProxy();

    if (regResult && regResult.proxyServer) {
      let proxyUrl = regResult.proxyServer;

      // 处理分号分隔的多协议格式: "http=127.0.0.1:7890;https=127.0.0.1:7890"
      if (proxyUrl.includes(';')) {
        const parts = proxyUrl.split(';');
        const httpPart = parts.find(p => p.trim().toLowerCase().startsWith('http=') || p.trim().toLowerCase().startsWith('https='));
        if (httpPart) {
          proxyUrl = httpPart.trim();
        } else {
          proxyUrl = parts[0].trim();
        }
      }

      // 处理协议前缀格式: "http=127.0.0.1:7890" 或 "=127.0.0.1:7890"
      if (proxyUrl.includes('=')) {
        const parts = proxyUrl.split('=');
        proxyUrl = parts[1] || parts[0];
      }

      proxyUrl = proxyUrl.trim();
      if (!proxyUrl.startsWith('http://') && !proxyUrl.startsWith('https://')) {
        proxyUrl = `http://${proxyUrl}`;
      }
      logger.info(`从注册表检测到代理: ${proxyUrl}`);
      return proxyUrl;
    }
  } catch (error) {
    logger.info(`检测系统代理失败: ${error.message}`);
  }

  return null;
}

module.exports = {
  detectSystemProxyUrl,
  detectSystemProxyUrlAsync
};

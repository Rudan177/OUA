/**
 * 更新 IPC 通信
 */
const { ipcMain, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const updateService = require('../services/updateService');
const versionService = require('../services/versionService');
const selfUpdateService = require('../services/selfUpdateService');
const configService = require('../services/configService');
const logger = require('../utils/logger');

function registerUpdateIPC() {
  ipcMain.handle('self-update-check', async () => {
    return selfUpdateService.checkUpdate();
  });

  ipcMain.handle('self-update-download', async (event) => {
    return selfUpdateService.downloadUpdate((progress) => {
      event.sender.send('self-update-progress', progress);
    });
  });

  ipcMain.handle('self-update-open', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return { ok: false, message: '无效的文件路径' };
    }
    const error = await shell.openPath(filePath);
    if (error) {
      logger.error(`打开更新文件失败: ${error}`);
      return { ok: false, message: error };
    }
    logger.info(`已打开更新文件: ${filePath}`);
    return { ok: true };
  });

  ipcMain.handle('self-update-clear-pending', async () => {
    configService.setSelfUpdate(null);
    configService.setPendingUpdatePath(null);
    return true;
  });

  ipcMain.handle('self-update-open-and-relaunch', async (event, filePath) => {
    if (!filePath || typeof filePath !== 'string') {
      return { ok: false, message: '无效的文件路径' };
    }
    if (!fs.existsSync(filePath)) {
      return { ok: false, message: '安装包文件不存在' };
    }
    // 先清除待安装记录（避免反复弹出）
    configService.setPendingUpdatePath(null);
    logger.info(`即将重启并打开安装包: ${filePath}`);
    // app.relaunch 会在当前事件循环结束后再启动新实例
    app.relaunch();
    // 等主进程开始退出后打开安装包
    setTimeout(() => {
      shell.openPath(filePath).catch(err => logger.error(`打开安装包失败: ${err}`));
    }, 800);
    app.exit(0);
    return { ok: true };
  });
  ipcMain.handle('get-local-version', async (event, installDir) => {
    return versionService.getLocalVersion(installDir);
  });

  ipcMain.handle('get-remote-version', async (event, branch) => {
    return versionService.getRemoteVersion(branch);
  });

  ipcMain.handle('compare-versions', async (event, localVersion, remoteVersion) => {
    return versionService.compareLocalWithRemote(localVersion, remoteVersion);
  });

  ipcMain.handle('first-install', async (event, targetDir) => {
    return updateService.firstInstall(targetDir, (progress) => {
      event.sender.send('update-progress', progress);
    });
  });

  ipcMain.handle('force-overwrite', async (event, targetDir, branch) => {
    return updateService.forceOverwrite(targetDir, branch, (progress) => {
      event.sender.send('update-progress', progress);
    });
  });

  ipcMain.handle('update-app', async (event, targetDir, branch) => {
    return updateService.updateApp(targetDir, branch, (progress) => {
      event.sender.send('update-progress', progress);
    });
  });

  ipcMain.handle('switch-branch', async (event, targetDir, branch) => {
    return updateService.switchBranch(targetDir, branch, (progress) => {
      event.sender.send('update-progress', progress);
    });
  });

  ipcMain.handle('get-branch', async () => {
    return configService.getBranch();
  });

  ipcMain.handle('set-branch', async (event, branch) => {
    configService.setBranch(branch);
    return true;
  });
}

module.exports = { registerUpdateIPC };

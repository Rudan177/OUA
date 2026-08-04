/**
 * 更新 IPC 通信
 */
const { ipcMain, shell } = require('electron');
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
    return true;
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

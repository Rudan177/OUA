/**
 * 更新 IPC 通信
 */
const { ipcMain } = require('electron');
const updateService = require('../services/updateService');
const versionService = require('../services/versionService');
const configService = require('../services/configService');
const pathUtils = require('../utils/pathUtils');
const logger = require('../utils/logger');

function registerUpdateIPC() {
  ipcMain.handle('get-local-version', async (event, installDir) => {
    return versionService.getLocalVersion(installDir);
  });

  ipcMain.handle('get-remote-version', async (event, branch) => {
    const tempDir = pathUtils.getTempDir();
    return versionService.getRemoteVersion(tempDir, branch);
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

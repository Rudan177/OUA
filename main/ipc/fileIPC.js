/**
 * 文件 IPC 通信
 */
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const pathUtils = require('../utils/pathUtils');
const configService = require('../services/configService');
const folderService = require('../services/folderService');
const fileUtils = require('../utils/fileUtils');

function registerFileIPC() {
  ipcMain.handle('check-folder-structure', async (event, dirPath) => {
    return folderService.checkFolderStructure(dirPath);
  });

  ipcMain.handle('get-missing-files', async (event, dirPath) => {
    return folderService.getMissingFiles(dirPath);
  });

  ipcMain.handle('contains-ooointerface-files', async (event, dirPath) => {
    return folderService.containsOOOInterfaceFiles(dirPath);
  });

  ipcMain.handle('has-write-permission', async (event, dirPath) => {
    return folderService.hasWritePermission(dirPath);
  });

  ipcMain.handle('ensure-directory', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return true;
    } catch (error) {
      console.error('创建目录失败:', error);
      return false;
    }
  });

  ipcMain.handle('get-install-dir', async () => {
    return configService.getInstallDir();
  });

  ipcMain.handle('set-install-dir', async (event, dirPath) => {
    configService.setInstallDir(dirPath);
    return true;
  });

  ipcMain.handle('is-first-run', async () => {
    return configService.isFirstRun();
  });

  ipcMain.handle('get-config', async () => {
    return configService.getConfig();
  });

  ipcMain.handle('get-app-paths', async () => {
    return {
      storageDir: pathUtils.getStorageDir(),
      tempDir: pathUtils.getTempDir(),
      logDir: pathUtils.getLogDir(),
      cacheDir: pathUtils.getCacheDir()
    };
  });
}

module.exports = { registerFileIPC };

/**
 * 文件 IPC 通信
 */
const { ipcMain } = require('electron');
const fs = require('fs');
const configService = require('../services/configService');
const folderService = require('../services/folderService');

function registerFileIPC() {
  ipcMain.handle('check-folder-structure', async (event, dirPath) => {
    return folderService.checkFolderStructure(dirPath);
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
}

module.exports = { registerFileIPC };

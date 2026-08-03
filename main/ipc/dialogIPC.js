/**
 * 对话框 IPC 通信
 */
const { ipcMain, dialog, BrowserWindow } = require('electron');
const notificationService = require('../services/notificationService');

function registerDialogIPC() {
  ipcMain.handle('select-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择 OOOInterface 安装目录'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('select-zip-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'ZIP 文件', extensions: ['zip'] }],
      title: '选择 OOOInterface 压缩包'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

ipcMain.handle('fetch-notifications', async () => {
    const raw = await notificationService.fetchNotifications();
    return notificationService.formatNotifications(raw);
  });
}

module.exports = { registerDialogIPC };

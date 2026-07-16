/**
 * Git IPC 通信
 */
const { ipcMain } = require('electron');
const gitService = require('../services/gitService');

function registerGitIPC() {
  ipcMain.handle('get-current-branch', async () => {
    return gitService.getCurrentBranch();
  });
}

module.exports = { registerGitIPC };

# OOOInterface Update Assistant (OUA) - 项目工程文档

## 项目概述

**OOOInterface Update Assistant (OUA)** 是一个基于 Electron 的桌面应用程序，用于帮助用户安装、更新和管理 OOOInterface 项目。

### 核心功能

- **自动安装**：从 GitHub 仓库克隆 OOOInterface 到指定目录
- **版本管理**：支持多分支切换（LTS 长期支持版、main 正式版、test 尝鲜版）
- **自动更新**：检测远程版本并自动下载安装更新
- **代理支持**：支持自动检测系统代理或手动配置代理
- **系统托盘**：支持最小化到托盘、开机启动
- **一键卸载**：完全清除应用及其所有数据

### 技术栈

- **框架**：Electron 42.0.1
- **构建工具**：electron-builder 26.8.1
- **Git 操作**：simple-git 3.36.0
- **代理支持**：https-proxy-agent 9.0.0
- **目标平台**：Windows

---

## 项目架构

### 整体架构

```
┌─────────────────────────────────────────┐
│         Renderer Process (UI)           │
│  ┌──────────────────────────────────┐  │
│  │  HTML/CSS/JavaScript (前端界面)   │  │
│  │  - 更新面板                       │  │
│  │  - 通知列表                       │  │
│  │  - 关于页面                       │  │
│  │  - 设置对话框                     │  │
│  └──────────────────────────────────┘  │
│              ↕ IPC 通信                 │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│           Main Process (Electron)       │
│  ┌──────────────────────────────────┐  │
│  │  Services (业务逻辑层)            │  │
│  │  - configService (配置管理)       │  │
│  │  - gitService (Git 操作)          │  │
│  │  - updateService (更新逻辑)       │  │
│  │  - versionService (版本检测)      │  │
│  │  - folderService (目录检测)       │  │
│  │  - notificationService (通知)     │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  IPC Handlers (IPC 通信层)        │  │
│  │  - fileIPC (文件操作)             │  │
│  │  - gitIPC (Git 操作)              │  │
│  │  - updateIPC (更新操作)           │  │
│  │  - dialogIPC (对话框操作)         │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │  Utils (工具函数层)               │  │
│  │  - logger (日志)                  │  │
│  │  - fileUtils (文件操作)           │  │
│  │  - pathUtils (路径处理)           │  │
│  │  - proxyUtils (代理检测)          │  │
│  │  - compareVersion (版本比较)      │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────┐
│           External Resources            │
│  - GitHub 仓库 (OOOInterface)           │
│  - 本地文件系统                         │
│  - Windows 注册表 (代理检测)            │
└─────────────────────────────────────────┘
```

---

## 目录结构

```
OUA/
├── main/                          # 主进程代码
│   ├── config/                    # 配置文件
│   │   └── appConfig.js          # 应用配置（版本、仓库地址、URL 等）
│   ├── ipc/                       # IPC 通信处理器
│   │   ├── fileIPC.js            # 文件相关 IPC
│   │   ├── gitIPC.js             # Git 相关 IPC
│   │   ├── updateIPC.js          # 更新相关 IPC
│   │   └── dialogIPC.js          # 对话框相关 IPC
│   ├── services/                  # 业务逻辑服务
│   │   ├── configService.js      # 配置管理服务
│   │   ├── gitService.js         # Git 操作服务
│   │   ├── updateService.js      # 更新逻辑服务
│   │   ├── versionService.js     # 版本检测服务
│   │   ├── folderService.js      # 目录检测服务
│   │   └── notificationService.js # 通知获取服务
│   ├── utils/                     # 工具函数
│   │   ├── logger.js             # 日志工具
│   │   ├── fileUtils.js          # 文件操作工具
│   │   ├── pathUtils.js          # 路径处理工具
│   │   ├── proxyUtils.js         # 代理检测工具
│   │   └── compareVersion.js     # 版本号比较工具
│   ├── main.js                    # 主进程入口
│   └── preload.js                 # 预加载脚本（安全桥接）
│
├── renderer/                      # 渲染进程代码（前端）
│   ├── assets/                    # 静态资源
│   │   ├── fonts/                # 字体文件
│   │   │   ├── HarmonyOS_SansSC.ttf
│   │   │   └── RUDAN.otf
│   │   └── icons/                # 图标文件
│   │       ├── logo.png
│   │       ├── icon.ico
│   │       ├── DLL.png
│   │       └── DLN.png
│   ├── css/                       # 样式文件
│   │   ├── style.css             # 主样式
│   │   ├── components.css        # 组件样式
│   │   ├── light.css             # 浅色主题
│   │   └── dark.css              # 深色主题
│   ├── js/                        # JavaScript 模块
│   │   ├── app.js                # 应用入口（初始化）
│   │   ├── theme.js              # 主题管理
│   │   ├── dialog.js             # 对话框管理
│   │   ├── ui.js                 # UI 管理
│   │   ├── updatePage.js         # 更新页面逻辑
│   │   ├── notificationPage.js   # 通知页面逻辑
│   │   ├── settingsPage.js       # 设置页面逻辑
│   │   └── aboutPage.js          # 关于页面逻辑
│   └── index.html                 # 主页面
│
├── storage/                       # 运行时数据存储（开发环境）
│   ├── config.json               # 用户配置
│   ├── logs/                     # 日志文件
│   ├── temp/                     # 临时文件
│   └── cache/                    # 缓存文件
│
├── scripts/                       # 构建脚本
│   └── clean.js                  # 清理脚本
│
├── package.json                   # 项目配置
├── electron-builder.json          # 打包配置
└── test-api.js                    # API 测试脚本
```

---

## 核心模块详解

### 1. 主进程入口 (main.js)

**职责**：
- 创建和管理主窗口
- 初始化系统托盘
- 注册所有 IPC 处理器
- 启动时自动检查更新
- 处理应用生命周期事件

**关键功能**：
- **单实例锁**：防止多开（`app.requestSingleInstanceLock()`）
- **静默启动**：支持开机启动时最小化到托盘（`--silent` 参数）
- **自动更新**：启动时检查并自动下载安装更新
- **主题监听**：监听系统主题变化并通知渲染进程

### 2. 预加载脚本 (preload.js)

**职责**：安全桥接主进程和渲染进程

**暴露的 API**：
```javascript
window.electronAPI = {
  folder: {
    checkStructure,        // 检查目录结构
    getMissingFiles,       // 获取缺失文件列表
    containsOOOInterfaceFiles, // 检查是否包含 OOOInterface 文件
    hasWritePermission,    // 检查写入权限
    ensureDirectory,       // 确保目录存在
    getInstallDir,         // 获取安装目录
    setInstallDir,         // 设置安装目录
    isFirstRun,            // 是否首次运行
    getConfig,             // 获取配置
    getAppPaths,           // 获取应用路径
    getUserPaths           // 获取用户路径
  },
  git: {
    getCurrentBranch,      // 获取当前分支
    setBranch              // 设置分支
  },
  update: {
    getLocalVersion,       // 获取本地版本
    getRemoteVersion,      // 获取远程版本
    compareVersions,       // 比较版本
    firstInstall,          // 首次安装
    forceOverwrite,        // 强制覆盖
    updateApp,             // 更新应用
    switchBranch,          // 切换分支
    getBranch,             // 获取分支
    setBranch,             // 设置分支
    onUpdateProgress       // 监听更新进度
  },
  dialog: {
    selectFolder,          // 选择文件夹
    showMessage,           // 显示消息
    fetchNotifications     // 获取通知
  },
  theme: {
    onThemeChanged         // 监听主题变化
  },
  app: {
    reset,                 // 恢复出厂设置
    restart,               // 重启应用
    uninstall              // 一键卸载
  },
  settings: {
    getProxyConfig,        // 获取代理配置
    setProxyConfig,        // 设置代理配置
    getStartupConfig,      // 获取启动配置
    setStartupConfig       // 设置启动配置
  },
  appConfig: {
    getAppInfo             // 获取应用信息
  }
}
```

### 3. 配置服务 (configService.js)

**职责**：管理应用配置数据

**配置结构**：
```javascript
{
  installDir: string | null,     // 安装目录路径
  branch: string,                // 当前分支 (LTS/main/test)
  isFirstRun: boolean,           // 是否首次运行
  theme: string,                 // 主题 (system/light/dark)
  proxy: {                       // 代理配置
    autoConfigure: boolean,      // 自动配置代理
    enabled: boolean,            // 启用代理
    http: string,                // HTTP 代理地址
    https: string                // HTTPS 代理地址
  },
  startup: {                     // 启动配置
    launchOnBoot: boolean,       // 开机启动
    minimizeToTray: boolean,     // 最小化到托盘
    autoUpdate: boolean          // 自动更新
  }
}
```

**配置文件位置**：
- 开发环境：`storage/config.json`
- 打包后：`%APPDATA%/oua/config.json`

### 4. Git 服务 (gitService.js)

**职责**：处理所有 Git 相关操作

**核心功能**：
- **克隆仓库**：从 GitHub 克隆 OOOInterface 仓库
- **拉取更新**：从远程分支拉取最新代码
- **获取远程版本**：通过 GitHub API 读取远程版本号
- **代理支持**：支持通过代理访问 GitHub

**关键实现**：
- 使用 `simple-git` 库执行 Git 操作
- 通过环境变量设置代理（`HTTP_PROXY`、`HTTPS_PROXY`）
- 支持超时控制（120 秒克隆超时）
- 自动处理浅克隆和分支跟踪

### 5. 更新服务 (updateService.js)

**职责**：处理应用更新逻辑

**核心功能**：
- **首次安装**：克隆仓库到空目录
- **强制覆盖**：删除旧文件并重新克隆
- **增量更新**：拉取远程更新
- **分支切换**：切换到不同分支

**更新流程**：
1. 检测本地版本（读取 `main/Script/version.js` 或 `main/version.js`）
2. 获取远程版本（通过 GitHub API）
3. 比较版本号
4. 执行更新（克隆或拉取）
5. 清理临时文件

### 6. 版本服务 (versionService.js)

**职责**：处理版本检测与比较

**版本文件格式**：
```javascript
const VERSION = "0.4.1:01-BS61";
```

**版本比较规则**：
1. 比较主版本号（major.minor.patch）
2. 比较构建号（冒号后的数字）
3. 比较后缀（横杠后的字符串）

### 7. 目录服务 (folderService.js)

**职责**：检测目录结构和权限

**目录结构类型**：
- `empty`：空目录
- `valid`：有效的 OOOInterface 目录
- `incomplete`：OOOInterface 文件不完整
- `not-ooointerface`：非 OOOInterface 目录

**必需文件**：
```javascript
requiredFiles: [
  "images",      // 图片目录
  "main",        // 主程序目录
  "manifest.json" // 清单文件
]
```

### 8. 通知服务 (notificationService.js)

**职责**：获取和解析远程通知

**通知来源**：
```
https://rudan177.github.io/OOOInterface/info/info-UA.json
```

**通知格式**：
```json
{
  "001": {
    "title": "通知标题",
    "link": "https://example.com",
    "text": "通知内容"
  }
}
```

---

## 数据流

### 更新检查流程

```
用户点击"检查更新"
    ↓
updatePage.js: JianChaGengXin()
    ↓
IPC: update.getLocalVersion(installDir)
    ↓
updateIPC.js → versionService.getLocalVersion()
    ↓
读取本地版本文件 (main/Script/version.js)
    ↓
返回本地版本号
    ↓
IPC: update.getRemoteVersion(branch)
    ↓
updateIPC.js → versionService.getRemoteVersion()
    ↓
gitService.getRemoteVersion()
    ↓
通过 GitHub API 获取远程版本文件
    ↓
解析版本号并返回
    ↓
IPC: update.compareVersions(local, remote)
    ↓
compareVersion.compareVersion()
    ↓
返回比较结果 (1: 本地高, -1: 远程高, 0: 相同)
    ↓
更新 UI 显示更新状态
```

### 首次安装流程

```
用户选择安装目录
    ↓
updatePage.js: ChuLiGengHuanLuJing()
    ↓
检查目录权限
    ↓
检查目录结构 (empty/valid/incomplete/not-ooointerface)
    ↓
如果是空目录：
    ↓
IPC: update.firstInstall(targetDir)
    ↓
updateIPC.js → updateService.firstInstall()
    ↓
gitService.cloneRepo()
    ↓
克隆仓库到目标目录
    ↓
发送进度更新 (update-progress)
    ↓
安装完成，重新检查更新
```

---

## 命名约定

### 文件命名

- **主进程文件**：使用小驼峰命名法（camelCase）
  - 例如：`configService.js`、`gitService.js`
  
- **渲染进程文件**：使用小驼峰命名法（camelCase）
  - 例如：`updatePage.js`、`settingsPage.js`

### 变量命名

- **主进程变量**：使用小驼峰命名法
  - 例如：`mainWindow`、`configData`、`currentBranch`

- **渲染进程变量**：使用拼音命名法（项目特色）
  - 例如：`DangQianBanBen`（当前版本）、`YuanChengBanBen`（远程版本）
  - 例如：`AnNiuJianChaGengXin`（按钮-检查更新）
  - 例如：`GengXinZhuangTaiWenBen`（更新-状态-文本）

### 函数命名

- **主进程函数**：使用小驼峰命名法
  - 例如：`getLocalVersion()`、`cloneRepo()`、`pullUpdates()`

- **渲染进程函数**：使用拼音命名法
  - 例如：`JianChaGengXin()`（检查更新）
  - 例如：`KaiShiShouCiAnZhuang()`（开始首次安装）
  - 例如：`ChuLiGengHuanLuJing()`（处理更换路径）

### CSS 类命名

- **使用拼音命名法**
  - 例如：`YingYong-RongQi`（应用-容器）
  - 例如：`Zuo-MianBan`（左-面板）
  - 例如：`KaPian-TouBu`（卡片-头部）
  - 例如：`AnNiu-Zhu`（按钮-主）

### IPC 通道命名

- **使用短横线分隔**
  - 例如：`get-local-version`、`first-install`、`check-folder-structure`

---

## 开发指南

### 环境要求

- Node.js >= 18
- npm >= 9
- Git（用于克隆仓库）

### 安装依赖

```bash
npm install
```

### 开发模式运行

```bash
npm start
```

### 构建应用

```bash
# 构建 Windows 版本
npm run build:win

# 构建所有平台
npm run build
```

### 清理构建产物

```bash
npm run clean
```

---

## 配置说明

### 应用配置 (appConfig.js)

```javascript
module.exports = {
  app: {
    name: "OOOInterface 易升",           // 应用名称（中文）
    nameEn: "OOOInterface Update Assistant", // 应用名称（英文）
    shortName: "OUA",                   // 简称
    version: "0.4.1",                   // 版本号
    fullVersion: "0.4.1:01-BS61",       // 完整版本号
    copyright: "© 2026 ByRUDAN 保留所有权利。", // 版权信息
    contact: "wyjcrtu@proton.me"        // 联系邮箱
  },
  git: {
    repoUrl: "https://github.com/Rudan177/OOOInterface.git", // 仓库地址
    defaultBranch: "LTS",               // 默认分支
    ltsBranch: "LTS",                   // 长期支持版分支
    mainBranch: "main",                 // 正式版分支
    testBranch: "test"                  // 尝鲜版分支
  },
  urls: {
    notifications: "https://rudan177.github.io/OOOInterface/info/info-UA.json" // 通知 URL
  },
  requiredFiles: [                      // 必需文件列表
    "images",
    "main",
    "manifest.json"
  ]
};
```

### 用户配置 (config.json)

存储在 `storage/config.json`（开发环境）或 `%APPDATA%/oua/config.json`（打包后）

---

## 日志系统

### 日志级别

- `INFO`：一般信息
- `WARN`：警告信息
- `ERROR`：错误信息
- `DEBUG`：调试信息

### 日志文件

- 位置：`storage/logs/oua-YYYY-MM-DD.log`
- 格式：`[时间戳] [级别] 消息`
- 示例：`[2026-07-16T10:30:45.123Z] [INFO] 应用启动`

---

## 代理支持

### 代理检测顺序

1. **应用配置代理**：用户在设置中手动配置的代理
2. **自动检测代理**：从系统环境变量和 Windows 注册表检测
3. **直连**：不使用代理

### 代理配置

```javascript
{
  autoConfigure: false,    // 自动检测系统代理
  enabled: false,          // 启用手动代理
  http: "127.0.0.1:7890",  // HTTP 代理
  https: "127.0.0.1:7890"  // HTTPS 代理
}
```

### Windows 注册表代理检测

读取路径：`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`
- `ProxyEnable`：是否启用代理（1 = 启用）
- `ProxyServer`：代理服务器地址

---

## 版本管理

### 版本号格式

```
主版本号.次版本号.修订号:构建号-后缀
```

示例：`0.4.1:01-BS61`
- `0.4.1`：主版本号
- `01`：构建号
- `BS61`：后缀（可能表示构建类型或其他信息）

### 版本比较规则

1. 比较主版本号（major.minor.patch）
2. 主版本号相同时，比较构建号
3. 构建号也相同时，比较后缀

---

## 常见问题

### 1. Git 克隆失败

**可能原因**：
- 网络连接问题
- 代理配置错误
- GitHub 访问受限

**解决方案**：
- 检查网络连接
- 配置代理（自动检测或手动配置）
- 尝试使用镜像源

### 2. 权限不足

**可能原因**：
- 选择的目录没有写入权限

**解决方案**：
- 选择用户目录、桌面或文档目录
- 以管理员身份运行程序

### 3. 版本检测失败

**可能原因**：
- 本地版本文件不存在
- 远程版本文件路径变更

**解决方案**：
- 重新安装 OOOInterface
- 检查 GitHub 仓库结构

---

## 未来改进方向

1. **主题切换**：当前依赖系统主题，未来可添加手动切换
2. **增量更新优化**：使用 diff 算法减少下载量
3. **多语言支持**：添加英文界面
4. **自动备份**：更新前自动备份用户数据
5. **插件系统**：支持扩展功能

---

## 联系方式

- **作者**：ByRUDAN
- **邮箱**：wyjcrtu@proton.me
- **GitHub**：https://github.com/Rudan177/OOOInterface

---

## 许可证

MIT License

---

**文档版本**：1.0
**最后更新**：2026-07-16
**适用版本**：OUA 0.4.1

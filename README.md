# OUA (OOOInterface 易升)

OOOInterface 更新助手（Electron）。

## OUA 最新版本下载

<!-- OUA-RELEASES-BEGIN -->

- Windows 免安装 https://github.com/Rudan177/OUA/releases/download/0.9.6/Win-OOOInterface.0.9.6.exe
- Windows 安装 https://github.com/Rudan177/OUA/releases/download/0.9.6/Win-OOOInterface.Setup.0.9.6.exe
- Linux 免安装 https://github.com/Rudan177/OUA/releases/download/0.9.6/Linux-OOOInterface.-0.9.6.AppImage
- Linux 安装 https://github.com/Rudan177/OUA/releases/download/0.9.6/Linux-oua_0.9.6_amd64.deb

<!-- OUA-RELEASES-END -->

## 终端使用（CLI）

安装版安装后会把 `<安装目录>\bin` 加入系统 PATH，在 PowerShell / CMD 中直接使用 `oua` 命令
（GUI 程序自身是窗口子系统，PowerShell 不会等待其结束，故对外入口是 `bin\oua.cmd` 包装脚本）。

输入 `oua cli`（或 `oua help`，直接输入 `oua` 也可）会显示所有指令的完整教程。

```text
oua update                                     检查本地/云端版本
oua upgrade                                    下载并安装新版本
oua load <zip 路径>                            本地模式导入 ZIP
oua change branch <LTS|Release|Beta>           切换更新分支
oua change mode <Cloud|Local>                  切换更新模式
oua change dir <路径>                          更换安装目录
oua setting start on boot <true|false>         开机自启
oua setting mini to tray <true|false>          最小化到托盘
oua setting auto update <true|false>           自动更新
oua setting lite mode <true|false>             轻量模式
oua setting hotkey <true|false>                热键开关
oua setting hotkey open as <组合键>            自定义热键（ctrl/alt 等）
oua delete                                     卸载 OOOInterface
oua gateway start|close|port|ooo|ext[ token]   可访问性网关
oua cli                                        显示所有指令教程
```

免安装（portable）版本不写 PATH，可直接以 `oua.exe <命令>` 方式调用。

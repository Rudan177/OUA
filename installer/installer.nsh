; OUA 自定义 NSIS 安装脚本
;
; 目标：安装完成后，用户可在终端直接使用 oua 命令。
; 由于应用主程序是 Electron GUI 程序（窗口子系统），PowerShell 调用它时不会等待、
; 也不回传退出码；因此在安装目录下的 bin 子目录放置 oua.cmd 包装脚本，并只把该
; bin 目录加入系统 PATH。这样 oua 解析到的是 .cmd 脚本（同步执行、正确回传输出与
; 退出码），同时避免与应用主程序 oua.exe 在同名解析上冲突。

!include "LogicLib.nsh"
!include "WinMessages.nsh"
!include "StrFunc.nsh"

; electron-builder 分两趟编译：先 BUILD_UNINSTALLER 生成卸载程序，再生成安装程序。
; 每趟只声明该趟真正用到的字符串函数，避免未引用告警（nsis 告警在打包时视为错误）。
!ifdef BUILD_UNINSTALLER
  !insertmacro FUNCTION_STRING_UnStrRep
!else
  !insertmacro FUNCTION_STRING_StrStr
!endif

!define OUA_ENV_KEY "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
!define OUA_BIN_DIR "$INSTDIR\bin"

; 广播环境变量变更，通知已运行的资源管理器刷新 PATH
!macro ouaBroadcastEnvChange
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

; 安装完成：写入 bin\oua.cmd 包装脚本，并把 bin 目录追加到系统 PATH
!macro customInstall
  CreateDirectory "${OUA_BIN_DIR}"
  FileOpen $4 "${OUA_BIN_DIR}\oua.cmd" w
  FileWrite $4 "@echo off$\r$\n"
  FileWrite $4 'rem OUA CLI wrapper: forwards "oua <command>" to the app executable.$\r$\n'
  FileWrite $4 "rem A .cmd wrapper makes PowerShell wait for completion and return the exit code.$\r$\n"
  FileWrite $4 '"%~dp0..\oua.exe" %*$\r$\n'
  FileClose $4

  ReadRegStr $0 HKLM "${OUA_ENV_KEY}" "Path"
  ${StrStr} $1 "$0" "${OUA_BIN_DIR}"
  ${If} $1 == ""
    ${If} $0 == ""
      WriteRegExpandStr HKLM "${OUA_ENV_KEY}" "Path" "${OUA_BIN_DIR}"
    ${Else}
      WriteRegExpandStr HKLM "${OUA_ENV_KEY}" "Path" "$0;${OUA_BIN_DIR}"
    ${EndIf}
    !insertmacro ouaBroadcastEnvChange
  ${EndIf}
!macroend

; 卸载：删除 bin\oua.cmd，并从系统 PATH 中移除 bin 目录
!macro customUnInstall
  Delete "${OUA_BIN_DIR}\oua.cmd"
  RMDir "${OUA_BIN_DIR}"

  ReadRegStr $0 HKLM "${OUA_ENV_KEY}" "Path"
  ${UnStrRep} $1 "$0" ";${OUA_BIN_DIR}" ""
  ${UnStrRep} $2 "$1" "${OUA_BIN_DIR};" ""
  ${UnStrRep} $3 "$2" "${OUA_BIN_DIR}" ""
  ${If} $3 != $0
    WriteRegExpandStr HKLM "${OUA_ENV_KEY}" "Path" "$3"
    !insertmacro ouaBroadcastEnvChange
  ${EndIf}
!macroend

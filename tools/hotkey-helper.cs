// OOAInterface易升 轻量模式托盘助手 —— 全 Win32 原生实现
//   - DPI 感知: 内嵌 PerMonitorV2 manifest + 运行时 SetProcessDpiAwarenessContext 双保险（避免缩放屏模糊/菜单错位）
//   - 托盘: Shell_NotifyIcon (NOTIFYICON_VERSION_4)，启动时先 NIM_DELETE 清残留图标再 NIM_ADD
//   - 菜单: CreatePopupMenu + TrackPopupMenu（系统原生渲染，跟随深浅色主题）
//   - 热键: RegisterHotKey + WndProc (WM_HOTKEY)
//   - 显示窗口: 启动主程序 exe (Electron 单实例锁聚焦)；切换分支: --switch-branch
//   - 诊断: 关键动作 + 收到的托盘/鼠标消息写入 <storage>/helper.log
// 编译: csc /target:winexe /platform:x64 /optimize+ /win32manifest:app.manifest /out:hotkey-helper.exe hotkey-helper.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace OuaNativeTray
{
    internal static class Program
    {
        // ===== Win32 常量 =====
        private const int WM_HOTKEY = 0x0312;
        private const int WM_DESTROY = 0x0002;
        private const int WM_NULL = 0x0000;
        private const int WM_USER = 0x0400;
        private const int WM_LBUTTONUP = 0x0202;
        private const int WM_RBUTTONUP = 0x0205;

        private const uint NIM_ADD = 0;
        private const uint NIM_DELETE = 2;
        private const uint NIM_SETVERSION = 4;
        private const uint NIF_MESSAGE = 1;
        private const uint NIF_ICON = 2;
        private const uint NIF_TIP = 4;
        private const uint NOTIFYICON_VERSION_4 = 4;
        private const uint NIN_SELECT = WM_USER + 1;
        private const uint NIN_DOUBLE = WM_USER + 3;
        private const uint TRAY_MSG = WM_USER + 200; // 远离 WM_USER+1(NIN_SELECT) 避免混淆

        private const uint MF_STRING = 0;
        private const uint MF_SEPARATOR = 0x800;
        private const uint MF_CHECKED = 0x8;
        private const uint MF_POPUP = 0x10;

        private const uint TPM_RIGHTBUTTON = 0x2;
        private const uint TPM_RETURNCMD = 0x100;
        private const uint TPM_NONOTIFY = 0x80;

        private const uint MOD_ALT = 0x1;
        private const uint MOD_CONTROL = 0x2;
        private const uint MOD_SHIFT = 0x4;
        private const uint MOD_WIN = 0x8;
        private const uint MOD_NOREPEAT = 0x4000;
        private const int HOTKEY_ID = 0x4F55;

        private const uint IMAGE_ICON = 1;
        private const uint LR_LOADFROMFILE = 0x10;
        private const int WS_POPUP = unchecked((int)0x80000000);
        private const int SW_HIDE = 0;

        // 菜单项 ID
        private const uint ID_SHOW = 1001;
        private const uint ID_BRANCH_BASE = 2000;
        private const uint ID_EXIT = 3001;

        // ===== 结构 =====
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct NOTIFYICONDATA
        {
            public int cbSize;
            public IntPtr hWnd;
            public uint uID;
            public uint uFlags;
            public uint uCallbackMessage;
            public IntPtr hIcon;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
            public string szTip;
            public int dwState;
            public int dwStateMask;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
            public string szInfo;
            public uint uVersion;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
            public string szInfoTitle;
            public uint dwInfoFlags;
            public Guid guidItem;
            public IntPtr hBalloonIcon;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSG
        {
            public IntPtr hwnd;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public POINT pt;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct WNDCLASS
        {
            public uint style;
            public WndProcDelegate lpfnWndProc;
            public int cbClsExtra;
            public int cbWndExtra;
            public IntPtr hInstance;
            public IntPtr hIcon;
            public IntPtr hCursor;
            public IntPtr hbrBackground;
            public string lpszMenuName;
            public string lpszClassName;
        }

        [UnmanagedFunctionPointer(CallingConvention.Winapi)]
        private delegate IntPtr WndProcDelegate(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        // ===== P/Invoke =====
        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr CreateWindowEx(uint dwExStyle, string lpClassName, string lpWindowName,
            int dwStyle, int x, int y, int nWidth, int nHeight, IntPtr hWndParent, IntPtr hMenu,
            IntPtr hInstance, IntPtr lpParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern ushort RegisterClassW(ref WNDCLASS lpWndClass);

        [DllImport("user32.dll")]
        private static extern IntPtr DefWindowProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool DestroyWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        private static extern bool Shell_NotifyIcon(uint dwMessage, ref NOTIFYICONDATA lpData);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr LoadImage(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr LoadIcon(IntPtr hInst, string lpIconName);

        [DllImport("user32.dll")]
        private static extern IntPtr CreatePopupMenu();

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool AppendMenu(IntPtr hMenu, uint uFlags, IntPtr uIDNewItem, string lpNewItem);

        [DllImport("user32.dll")]
        private static extern bool DestroyMenu(IntPtr hMenu);

        [DllImport("user32.dll")]
        private static extern uint TrackPopupMenu(IntPtr hMenu, uint uFlags, int x, int y, int nReserved,
            IntPtr hWnd, IntPtr prcRect);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool PostMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

        [DllImport("user32.dll")]
        private static extern bool TranslateMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern IntPtr DispatchMessage(ref MSG lpMsg);

        [DllImport("user32.dll")]
        private static extern void PostQuitMessage(int nExitCode);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        // ===== 状态 =====
        private static IntPtr _hwnd;
        private static WndProcDelegate _wndProc;
        private static NOTIFYICONDATA _nid;
        private static string _mainExe = "";
        private static string[] _mainArgs = new string[0];
        private static string _storageDir = "";
        private static string _logFile = "";
        private static List<string> _branches = new List<string>();
        private static bool _trayOnly = false;
        private static uint _hotkeyMods = 0;
        private static uint _hotkeyVk = 0;
        private static long _lastShowTime = 0; // 防抖：左键单击可能同时收到 WM_LBUTTONUP + NIN_SELECT

        private const int SM_CXSMICON = 11;
        private const int SM_CYSMICON = 12;
        private const int DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;

        private static string DaemonPidFile { get { return Path.Combine(_storageDir, "daemon.pid"); } }
        private static string ConfigFile { get { return Path.Combine(_storageDir, "config.json"); } }

        [STAThread]
        private static void Main(string[] args)
        {
            try
            {
                // DPI 感知（manifest 双保险：运行时强制 PerMonitorV2）
                EnableDpiAwareness();

                ParseArgs(args);

                bool createdNew;
                var mutex = new Mutex(true, "Global\\OUA_HotkeyHelper", out createdNew);
                if (!createdNew) return; // 已有实例
                try
                {
                    // 注册窗口类
                    _wndProc = WndProc;
                    var wc = new WNDCLASS
                    {
                        lpfnWndProc = _wndProc,
                        hInstance = GetModuleHandle(null),
                        lpszClassName = "OUA_TrayHelperWin",
                        hCursor = IntPtr.Zero,
                        hbrBackground = IntPtr.Zero
                    };
                    RegisterClassW(ref wc); // 类可能已存在(同二进制)不视为失败

                    // 创建隐藏窗口并初始化（ShowWindow(SW_HIDE) 确保窗口可被 SetForegroundWindow 用于弹出菜单）
                    _hwnd = CreateWindowEx(0, "OUA_TrayHelperWin", "OUA Helper", WS_POPUP,
                        0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, GetModuleHandle(null), IntPtr.Zero);
                    if (_hwnd == IntPtr.Zero)
                    {
                        Log("创建窗口失败: " + Marshal.GetLastWin32Error());
                        return;
                    }
                    ShowWindow(_hwnd, SW_HIDE);

                    // 添加托盘图标（先删除同窗口同ID的旧图标，防止路由到残留窗口）
                    if (!AddTrayIcon())
                    {
                        Log("添加托盘图标失败");
                        return;
                    }

                    // 注册全局热键
                    if (!_trayOnly && _hotkeyVk != 0)
                    {
                        bool ok = RegisterHotKey(_hwnd, HOTKEY_ID, _hotkeyMods | MOD_NOREPEAT, _hotkeyVk);
                        Log("注册热键 => " + (ok ? "成功" : "失败(可能被占用)"));
                    }
                    else
                    {
                        Log("未注册热键 (trayOnly=" + _trayOnly + ")");
                    }

                    Log("托盘助手就绪");

                    // 消息循环
                    MSG msg;
                    while (GetMessage(out msg, IntPtr.Zero, 0, 0))
                    {
                        TranslateMessage(ref msg);
                        DispatchMessage(ref msg);
                    }

                    // 清理
                    Shell_NotifyIcon(NIM_DELETE, ref _nid);
                    UnregisterHotKey(_hwnd, HOTKEY_ID);
                    DestroyWindow(_hwnd);
                }
                finally
                {
                    mutex.ReleaseMutex();
                }
            }
            catch (Exception ex)
            {
                try { Log("致命错误: " + ex); } catch { }
            }
        }

        private static void EnableDpiAwareness()
        {
            try
            {
                if (!SetProcessDpiAwarenessContext((IntPtr)DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2))
                {
                    SetProcessDPIAware();
                }
            }
            catch { SetProcessDPIAware(); }
        }

        private static IntPtr WndProc(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
        {
            try
            {
                if (msg == WM_HOTKEY && wParam.ToInt32() == HOTKEY_ID)
                {
                    Log("热键触发");
                    ToggleMainWindow();
                    return IntPtr.Zero;
                }
                if (msg == TRAY_MSG)
                {
                    uint action = (uint)(lParam.ToInt64() & 0xFFFF);
                    Log("托盘消息 lParam=0x" + action.ToString("X4") + " (" + action + ")");
                    if (action == NIN_SELECT || action == WM_LBUTTONUP)
                    {
                        ShowMainWindowDebounced();
                    }
                    else if (action == NIN_DOUBLE)
                    {
                        ShowMainWindow();
                    }
                    else if (action == WM_RBUTTONUP || action == 0x007B /* WM_CONTEXTMENU */)
                    {
                        ShowContextMenu();
                    }
                    return IntPtr.Zero;
                }
                if (msg == WM_DESTROY)
                {
                    PostQuitMessage(0);
                    return IntPtr.Zero;
                }
            }
            catch (Exception ex)
            {
                Log("WndProc 异常: " + ex.Message);
            }
            return DefWindowProc(hWnd, msg, wParam, lParam);
        }

        // ===== 托盘 =====
        private static bool AddTrayIcon()
        {
            string iconPath = ParseArg("--icon");

            // 先清除残留图标（同窗口+同ID），确保回调路由到当前窗口
            _nid = new NOTIFYICONDATA();
            _nid.cbSize = Marshal.SizeOf(typeof(NOTIFYICONDATA));
            _nid.hWnd = _hwnd;
            _nid.uID = 1;
            Shell_NotifyIcon(NIM_DELETE, ref _nid);

            // 重新初始化并添加
            _nid = new NOTIFYICONDATA();
            _nid.cbSize = Marshal.SizeOf(typeof(NOTIFYICONDATA));
            _nid.hWnd = _hwnd;
            _nid.uID = 1;
            _nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
            _nid.uCallbackMessage = TRAY_MSG;
            _nid.szTip = "OOOInterface 易升";

            IntPtr hIcon = IntPtr.Zero;
            if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath))
            {
                hIcon = LoadImage(IntPtr.Zero, iconPath, IMAGE_ICON,
                    GetSystemMetrics(SM_CXSMICON), GetSystemMetrics(SM_CYSMICON), LR_LOADFROMFILE);
            }
            if (hIcon == IntPtr.Zero)
            {
                hIcon = LoadIcon(IntPtr.Zero, "IDI_APPLICATION");
            }
            _nid.hIcon = hIcon;

            if (!Shell_NotifyIcon(NIM_ADD, ref _nid))
            {
                Log("NIM_ADD 失败: " + Marshal.GetLastWin32Error());
                return false;
            }

            // 使用 v4 通知行为（NIN_SELECT / NIN_DOUBLE）
            var verData = _nid;
            verData.uFlags = 0;
            verData.uVersion = NOTIFYICON_VERSION_4;
            Shell_NotifyIcon(NIM_SETVERSION, ref verData);

            Log("托盘图标已添加 (callback=0x" + TRAY_MSG.ToString("X4") + ")");
            return true;
        }

        // ===== 菜单 =====
        private static void ShowContextMenu()
        {
            try
            {
                IntPtr menu = CreatePopupMenu();
                if (menu == IntPtr.Zero)
                {
                    Log("CreatePopupMenu 失败");
                    return;
                }

                AppendMenu(menu, MF_STRING, (IntPtr)ID_SHOW, "显示窗口");

                if (_branches.Count > 0)
                {
                    string current = GetCurrentBranch();
                    IntPtr branchMenu = CreatePopupMenu();
                    for (int i = 0; i < _branches.Count; i++)
                    {
                        uint flags = MF_STRING;
                        if (_branches[i] == current) flags |= MF_CHECKED;
                        AppendMenu(branchMenu, flags, (IntPtr)(ID_BRANCH_BASE + (uint)i), GetBranchDisplay(_branches[i]));
                    }
                    AppendMenu(menu, MF_STRING | MF_POPUP, branchMenu, "切换分支");
                }

                AppendMenu(menu, MF_SEPARATOR, IntPtr.Zero, null);
                AppendMenu(menu, MF_STRING, (IntPtr)ID_EXIT, "退出");

                POINT pt;
                GetCursorPos(out pt);
                Log("弹出菜单 at (" + pt.x + "," + pt.y + ")");
                SetForegroundWindow(_hwnd);
                uint cmd = TrackPopupMenu(menu, TPM_RIGHTBUTTON | TPM_RETURNCMD | TPM_NONOTIFY,
                    pt.x, pt.y, 0, _hwnd, IntPtr.Zero);
                DestroyMenu(menu);
                // 标准模式：菜单关闭后补发 WM_NULL，确保菜单正确消失
                PostMessage(_hwnd, WM_NULL, IntPtr.Zero, IntPtr.Zero);

                if (cmd == ID_SHOW)
                {
                    Log("菜单: 显示窗口");
                    ShowMainWindow();
                }
                else if (cmd == ID_EXIT)
                {
                    Log("菜单: 退出");
                    ExitApp();
                }
                else if (cmd >= ID_BRANCH_BASE && cmd < ID_BRANCH_BASE + (uint)_branches.Count)
                {
                    string branch = _branches[(int)(cmd - ID_BRANCH_BASE)];
                    Log("菜单: 切换分支 " + branch);
                    SwitchBranch(branch);
                }
                else
                {
                    Log("菜单返回 0（取消或未选择）");
                }
            }
            catch (Exception ex)
            {
                Log("显示菜单异常: " + ex.Message);
            }
        }

        // ===== 动作 =====
        private static void ShowMainWindowDebounced()
        {
            long now = Environment.TickCount;
            if (now - _lastShowTime < 300) return; // 左键单击可能同时收到 WM_LBUTTONUP + NIN_SELECT
            _lastShowTime = now;
            ShowMainWindow();
        }

        private static void ShowMainWindow()
        {
            Log("托盘动作: 显示窗口");
            LaunchMain(null);
        }

        private static void ToggleMainWindow()
        {
            LaunchMain("--toggle");
        }

        private static void SwitchBranch(string branch)
        {
            LaunchMain("--switch-branch", branch);
        }

        private static void LaunchMain(params string[] extraArgs)
        {
            if (string.IsNullOrEmpty(_mainExe) || !File.Exists(_mainExe))
            {
                Log("主程序不存在: " + _mainExe);
                return;
            }
            try
            {
                var allArgs = new List<string>(_mainArgs);
                if (extraArgs != null)
                {
                    foreach (string a in extraArgs)
                    {
                        if (!string.IsNullOrEmpty(a)) allArgs.Add(a);
                    }
                }
                string full = BuildArgs(allArgs.ToArray());
                Process.Start(new ProcessStartInfo
                {
                    FileName = _mainExe,
                    Arguments = full,
                    UseShellExecute = false
                });
                Log("已启动主程序: " + _mainExe + " " + full);
            }
            catch (Exception ex)
            {
                Log("启动主程序失败: " + ex.Message);
            }
        }

        private static void ExitApp()
        {
            int daemonPid = ReadDaemonPid();
            if (daemonPid > 0 && IsProcessAlive(daemonPid))
            {
                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "taskkill",
                        Arguments = "/PID " + daemonPid + " /F",
                        CreateNoWindow = true,
                        UseShellExecute = false
                    });
                    Log("已结束守护进程: " + daemonPid);
                }
                catch (Exception ex) { Log("结束守护进程失败: " + ex.Message); }
                for (int i = 0; i < 10 && File.Exists(DaemonPidFile); i++)
                {
                    try { File.Delete(DaemonPidFile); } catch { }
                    Thread.Sleep(100);
                }
                PostQuitMessage(0);
            }
            else if (IsMainRunning())
            {
                LaunchMain("--quit");
                Thread.Sleep(5000);
                PostQuitMessage(0);
            }
            else
            {
                PostQuitMessage(0);
            }
        }

        // ===== 工具 =====
        private static string GetCurrentBranch()
        {
            try
            {
                if (!File.Exists(ConfigFile)) return "";
                string text = File.ReadAllText(ConfigFile);
                var m = System.Text.RegularExpressions.Regex.Match(text, "\"branch\"\\s*:\\s*\"([^\"]+)\"");
                return m.Success ? m.Groups[1].Value : "";
            }
            catch { return ""; }
        }

        private static string GetBranchDisplay(string branch)
        {
            switch (branch)
            {
                case "LTS": return "长期支持版";
                case "main": return "正式版";
                case "test": return "尝鲜版";
                default: return branch;
            }
        }

        private static void ParseArgs(string[] args)
        {
            string branches = "";
            string hotkey = "";
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--main-exe" && i + 1 < args.Length) _mainExe = args[i + 1];
                if (args[i] == "--main-args" && i + 1 < args.Length) _mainArgs = ParseJsonArray(args[i + 1]);
                if (args[i] == "--storage" && i + 1 < args.Length) _storageDir = args[i + 1];
                if (args[i] == "--branches" && i + 1 < args.Length) branches = args[i + 1];
                if (args[i] == "--hotkey" && i + 1 < args.Length) hotkey = args[i + 1];
                if (args[i] == "--tray-only") _trayOnly = true;
            }
            foreach (string b in branches.Split(new[] { ',', '，' }, StringSplitOptions.RemoveEmptyEntries))
            {
                string t = b.Trim();
                if (t.Length > 0) _branches.Add(t);
            }
            _logFile = string.IsNullOrEmpty(_storageDir) ? "" : Path.Combine(_storageDir, "helper.log");

            if (!_trayOnly && !string.IsNullOrEmpty(hotkey))
            {
                uint mods = 0; uint vk = 0;
                if (TryParseHotkey(hotkey, ref mods, ref vk))
                {
                    _hotkeyMods = mods;
                    _hotkeyVk = vk;
                }
                else
                {
                    Log("热键无法解析: " + hotkey);
                }
            }

            Log("启动: mainExe=" + _mainExe + " storage=" + _storageDir +
                " branches=" + branches + " hotkey=" + hotkey);
        }

        private static string ParseArg(string key)
        {
            string[] args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == key && i + 1 < args.Length) return args[i + 1];
            }
            return "";
        }

        private static bool IsMainRunning()
        {
            try
            {
                string name = Path.GetFileNameWithoutExtension(_mainExe);
                return Process.GetProcessesByName(name).Length > 0;
            }
            catch { return false; }
        }

        private static int ReadDaemonPid()
        {
            try
            {
                if (File.Exists(DaemonPidFile))
                {
                    int pid;
                    if (int.TryParse(File.ReadAllText(DaemonPidFile).Trim(), out pid)) return pid;
                }
            }
            catch { }
            return 0;
        }

        private static bool IsProcessAlive(int pid)
        {
            try { Process.GetProcessById(pid); return true; }
            catch { return false; }
        }

        private static void Log(string msg)
        {
            try
            {
                if (string.IsNullOrEmpty(_logFile)) return;
                File.AppendAllText(_logFile,
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + msg + "\r\n");
            }
            catch { }
        }

        private static string[] ParseJsonArray(string json)
        {
            var list = new List<string>();
            int i = 0;
            while (i < json.Length)
            {
                int start = json.IndexOf('"', i);
                if (start < 0) break;
                int end = json.IndexOf('"', start + 1);
                if (end < 0) break;
                list.Add(json.Substring(start + 1, end - start - 1));
                i = end + 1;
            }
            return list.ToArray();
        }

        private static string BuildArgs(string[] args)
        {
            var sb = new StringBuilder();
            foreach (string a in args)
            {
                if (sb.Length > 0) sb.Append(' ');
                if (a.IndexOf(' ') >= 0 || a.IndexOf('"') >= 0)
                {
                    sb.Append('"').Append(a.Replace("\"", "\\\"")).Append('"');
                }
                else
                {
                    sb.Append(a);
                }
            }
            return sb.ToString();
        }

        private static bool TryParseHotkey(string combo, ref uint mods, ref uint vk)
        {
            string[] parts = combo.Split(new[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return false;
            foreach (string part in parts)
            {
                switch (part.Trim().ToLowerInvariant())
                {
                    case "ctrl": case "control": mods |= MOD_CONTROL; break;
                    case "alt": mods |= MOD_ALT; break;
                    case "shift": mods |= MOD_SHIFT; break;
                    case "win": case "meta": case "super": case "cmd": case "command": mods |= MOD_WIN; break;
                    case "commandorcontrol": mods |= MOD_CONTROL; break;
                }
            }
            string key = parts[parts.Length - 1].Trim();
            if (key.Length == 1 && char.IsLetterOrDigit(key[0]))
            {
                vk = (uint)char.ToUpperInvariant(key[0]);
                return true;
            }
            if (key.Length >= 2 && (key[0] == 'F' || key[0] == 'f'))
            {
                int f;
                if (int.TryParse(key.Substring(1), out f) && f >= 1 && f <= 24)
                {
                    vk = 0x70 + (uint)(f - 1);
                    return true;
                }
            }
            switch (key.ToLowerInvariant())
            {
                case "space": vk = 0x20; return true;
                case "plus": vk = 0x6B; return true;
                case "tab": vk = 0x09; return true;
                case "enter": vk = 0x0D; return true;
                case "esc": case "escape": vk = 0x1B; return true;
                case "backspace": vk = 0x08; return true;
                case "delete": vk = 0x2E; return true;
                case "insert": vk = 0x2D; return true;
                case "home": vk = 0x24; return true;
                case "end": vk = 0x23; return true;
                case "pageup": vk = 0x21; return true;
                case "pagedown": vk = 0x22; return true;
                case "up": vk = 0x26; return true;
                case "down": vk = 0x28; return true;
                case "left": vk = 0x25; return true;
                case "right": vk = 0x27; return true;
                case "comma": vk = 0xBC; return true;
                case "period": vk = 0xBE; return true;
            }
            return false;
        }
    }
}

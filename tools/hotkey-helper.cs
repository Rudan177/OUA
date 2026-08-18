// OOAInterface易升 轻量模式托盘助手
// WinForms 托盘图标 + 全局热键，与 Electron 主进程完全解耦（不依赖任何 HTTP 服务）。
//   - "显示窗口"：直接启动主程序 exe（Electron 单实例锁负责聚焦已有窗口）
//   - "退出"    ：守护模式 → 结束守护进程并自杀；窗口模式 → 通知主程序带 --quit 退出
// 编译: csc /target:winexe /platform:x64 /optimize+ /out:hotkey-helper.exe hotkey-helper.cs
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace OuaHotkeyHelper
{
    static class Program
    {
        // ---- Win32 APIs ----
        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        private const int WM_HOTKEY = 0x0312;
        private const int WM_QUIT = 0x0012;
        private const int HOTKEY_ID = 0x4F55; // "OU"

        // 修饰键
        private const uint MOD_ALT = 0x1;
        private const uint MOD_CONTROL = 0x2;
        private const uint MOD_SHIFT = 0x4;
        private const uint MOD_WIN = 0x8;
        private const uint MOD_NOREPEAT = 0x4000;

        private static NotifyIcon _tray;
        private static string _mainExe = "";
        private static string[] _mainArgs = new string[0];
        private static string _storageDir = "";
        private static bool _trayOnly = false; // 热键关闭时仅保留托盘

        // daemon.pid 文件名（与 daemon.js 保持一致）
        private static string DaemonPidFile { get { return Path.Combine(_storageDir, "daemon.pid"); } }

        [STAThread]
        static void Main(string[] args)
        {
            // 单实例
            bool createdNew;
            using (var mutex = new Mutex(true, "Global\\OUA_HotkeyHelper", out createdNew))
            {
                if (!createdNew) return;
                Run(args);
            }
        }

        static void Run(string[] args)
        {
            // 参数: --main-exe <路径> --main-args <json数组> --storage <目录> --hotkey "Ctrl+Shift+O" --icon <路径> --tray-only
            string hotkey = "";
            string iconPath = "";
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--main-exe" && i + 1 < args.Length) _mainExe = args[i + 1];
                if (args[i] == "--main-args" && i + 1 < args.Length)
                {
                    try { _mainArgs = NewtonsoftJsonFallback(args[i + 1]); } catch { }
                }
                if (args[i] == "--storage" && i + 1 < args.Length) _storageDir = args[i + 1];
                if (args[i] == "--hotkey" && i + 1 < args.Length) hotkey = args[i + 1];
                if (args[i] == "--icon" && i + 1 < args.Length) iconPath = args[i + 1];
                if (args[i] == "--tray-only") _trayOnly = true;
            }

            _tray = new NotifyIcon();
            Icon ico = null;
            try { if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath)) ico = new Icon(iconPath); } catch { }
            _tray.Icon = ico ?? SystemIcons.Application;
            _tray.Text = "OOOInterface 易升";
            _tray.Visible = true;

            var menu = new ContextMenu();
            menu.MenuItems.Add("显示窗口", (s, e) => ShowMainWindow());
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("退出", (s, e) => ExitApp());
            _tray.ContextMenu = menu;
            _tray.DoubleClick += (s, e) => ShowMainWindow();

            // 注册全局热键（关闭时仅托盘）
            IntPtr hwnd = new IntPtr(0);
            if (!_trayOnly && !string.IsNullOrEmpty(hotkey))
            {
                uint mods = 0; uint vk = 0;
                if (TryParseHotkey(hotkey, ref mods, ref vk))
                {
                    RegisterHotKey(hwnd, HOTKEY_ID, mods | MOD_NOREPEAT, vk);
                }
            }

            // 消息循环
            bool running = true;
            while (running)
            {
                var msg = new NativeMessage();
                if (PeekMessage(out msg, IntPtr.Zero, 0, 0, 0))
                {
                    if (msg.message == WM_HOTKEY && msg.wParam.ToInt32() == HOTKEY_ID)
                    {
                        // 热键：切换窗口显隐（窗口已显示则隐藏，否则显示）
                        ToggleMainWindow();
                    }
                    else if (msg.message == WM_QUIT)
                    {
                        running = false;
                    }
                    else
                    {
                        TranslateMessage(ref msg);
                        DispatchMessage(ref msg);
                    }
                }
                else
                {
                    Thread.Sleep(50);
                }
            }

            UnregisterHotKey(hwnd, HOTKEY_ID);
            _tray.Visible = false;
            _tray.Dispose();
        }

        /// <summary>
        /// 简易 JSON 字符串数组解析（不引入依赖）：["a","b"] → ["a","b"]
        /// </summary>
        static string[] NewtonsoftJsonFallback(string json)
        {
            var list = new System.Collections.Generic.List<string>();
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

        /// <summary>
        /// 显示窗口：直接启动主程序 exe。Electron 单实例锁会聚焦已有窗口（若在运行）。
        /// </summary>
        static void ShowMainWindow()
        {
            LaunchMain(null);
        }

        /// <summary>
        /// 切换窗口显隐：启动主程序带 --toggle 参数，Electron 单实例锁切换窗口可见性。
        /// </summary>
        static void ToggleMainWindow()
        {
            LaunchMain("--toggle");
        }

        static void LaunchMain(string extraArg)
        {
            if (string.IsNullOrEmpty(_mainExe) || !File.Exists(_mainExe)) return;
            try
            {
                var allArgs = new System.Collections.Generic.List<string>(_mainArgs);
                if (!string.IsNullOrEmpty(extraArg)) allArgs.Add(extraArg);
                Process.Start(new ProcessStartInfo
                {
                    FileName = _mainExe,
                    Arguments = BuildArgs(allArgs.ToArray()),
                    UseShellExecute = false
                });
            }
            catch { }
        }

        /// <summary>
        /// 退出：
        ///   守护模式（daemon.pid 存在且进程存活）→ 结束守护进程（仅杀本体，避免连带自杀），删除 PID 文件，自杀
        ///   窗口模式（Electron 在跑）→ 启动主程序带 --quit，单实例锁触发退出
        /// </summary>
        static void ExitApp()
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
                }
                catch { }
                // 清理 PID 文件（taskkill 是异步的，稍后删除）
                for (int i = 0; i < 10 && File.Exists(DaemonPidFile); i++)
                {
                    try { File.Delete(DaemonPidFile); } catch { }
                    Thread.Sleep(100);
                }
                // 自杀
                Environment.Exit(0);
            }
            else
            {
                // 窗口模式：通知主程序退出
                if (!string.IsNullOrEmpty(_mainExe) && File.Exists(_mainExe))
                {
                    var allArgs = new System.Collections.Generic.List<string>(_mainArgs);
                    allArgs.Add("--quit");
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = _mainExe,
                            Arguments = BuildArgs(allArgs.ToArray()),
                            UseShellExecute = false
                        });
                    }
                    catch { }
                }
                // 兜底：等主程序退出后本进程也会被杀；若 5 秒仍未退出则自杀
                Thread.Sleep(5000);
                Environment.Exit(0);
            }
        }

        static string BuildArgs(string[] args)
        {
            var sb = new StringBuilder();
            foreach (var a in args)
            {
                if (sb.Length > 0) sb.Append(' ');
                if (a.Contains(" ") || a.Contains("\""))
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

        static int ReadDaemonPid()
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

        static bool IsProcessAlive(int pid)
        {
            try { Process.GetProcessById(pid); return true; }
            catch { return false; }
        }

        static bool TryParseHotkey(string combo, ref uint mods, ref uint vk)
        {
            // 支持 Ctrl, Alt, Shift, Win 与单字符键；例如 "Ctrl+Shift+O"
            string[] parts = combo.Split(new[] { '+' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2) return false;
            foreach (string part in parts)
            {
                switch (part.Trim().ToLowerInvariant())
                {
                    case "ctrl": mods |= MOD_CONTROL; break;
                    case "alt": mods |= MOD_ALT; break;
                    case "shift": mods |= MOD_SHIFT; break;
                    case "win": case "meta": mods |= MOD_WIN; break;
                }
            }
            string key = parts[parts.Length - 1].Trim();
            if (key.Length == 1 && char.IsLetterOrDigit(key[0]))
            {
                vk = (uint)char.ToUpperInvariant(key[0]);
                return true;
            }
            return false;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct NativeMessage
        {
            public IntPtr handle;
            public uint message;
            public IntPtr wParam;
            public IntPtr lParam;
            public uint time;
            public int x;
            public int y;
        }

        [DllImport("user32.dll")]
        private static extern bool PeekMessage(out NativeMessage lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);
        [DllImport("user32.dll")]
        private static extern bool TranslateMessage(ref NativeMessage lpMsg);
        [DllImport("user32.dll")]
        private static extern bool DispatchMessage(ref NativeMessage lpMsg);
    }
}

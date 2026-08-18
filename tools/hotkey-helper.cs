// OOAInterface易升 轻量模式托盘助手
// 基于 WinForms NotifyIcon（底层即 Windows 原生托盘 API Shell_NotifyIcon）。
//   - 现代样式托盘菜单（ContextMenuStrip，跟随系统主题渲染）
//   - 全局热键：RegisterHotKey 绑定到隐藏窗体句柄，经 WndProc 可靠接收（标准 Win32 模式）
//   - "显示窗口"：直接启动主程序 exe（Electron 单实例锁负责聚焦已有窗口）
//   - 热键：--toggle 切换窗口显隐；托盘左键/双击：显示窗口
//   - "退出"：守护模式 → 结束守护进程并自杀；窗口模式 → 通知主程序 --quit 退出
//   - 所有关键动作写入 <storage>/helper.log 便于诊断
// 编译: csc /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:hotkey-helper.exe hotkey-helper.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace OuaHotkeyHelper
{
    internal sealed class TrayApp : Form
    {
        [DllImport("user32.dll")]
        private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
        [DllImport("user32.dll")]
        private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        private const int WM_HOTKEY = 0x0312;
        private const int HOTKEY_ID = 0x4F55; // "OU"

        private const uint MOD_ALT = 0x1;
        private const uint MOD_CONTROL = 0x2;
        private const uint MOD_SHIFT = 0x4;
        private const uint MOD_WIN = 0x8;
        private const uint MOD_NOREPEAT = 0x4000;

        private NotifyIcon _tray;
        private string _mainExe = "";
        private string[] _mainArgs = new string[0];
        private string _storageDir = "";
        private bool _trayOnly = false;

        private string DaemonPidFile { get { return Path.Combine(_storageDir, "daemon.pid"); } }

        public TrayApp(string[] args)
        {
            // 参数: --main-exe <路径> --main-args <json数组> --storage <目录> --hotkey <组合> --icon <路径> --tray-only
            string hotkey = "";
            string iconPath = "";
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--main-exe" && i + 1 < args.Length) _mainExe = args[i + 1];
                if (args[i] == "--main-args" && i + 1 < args.Length) _mainArgs = ParseJsonArray(args[i + 1]);
                if (args[i] == "--storage" && i + 1 < args.Length) _storageDir = args[i + 1];
                if (args[i] == "--hotkey" && i + 1 < args.Length) hotkey = args[i + 1];
                if (args[i] == "--icon" && i + 1 < args.Length) iconPath = args[i + 1];
                if (args[i] == "--tray-only") _trayOnly = true;
            }

            Log("启动: mainExe=" + _mainExe + " storage=" + _storageDir + " hotkey=" + hotkey);

            // 隐藏窗体（仅用于接收热键消息）
            ShowInTaskbar = false;
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Minimized;
            Opacity = 0;

            // 托盘图标
            _tray = new NotifyIcon();
            Icon ico = null;
            try { if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath)) ico = new Icon(iconPath); } catch { }
            _tray.Icon = ico ?? SystemIcons.Application;
            _tray.Text = "OOOInterface 易升";
            _tray.Visible = true;

            // 现代样式托盘菜单
            var menu = new ContextMenuStrip();
            menu.Items.Add("显示窗口", null, (s, e) => ShowMainWindow());
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("退出", null, (s, e) => ExitApp());
            _tray.ContextMenuStrip = menu;
            _tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) ShowMainWindow(); };
            _tray.DoubleClick += (s, e) => ShowMainWindow();

            // 注册全局热键（绑定到本窗体句柄）
            if (!_trayOnly && !string.IsNullOrEmpty(hotkey))
            {
                uint mods = 0; uint vk = 0;
                if (TryParseHotkey(hotkey, ref mods, ref vk))
                {
                    IntPtr h = this.Handle; // 强制创建窗体句柄
                    bool ok = RegisterHotKey(h, HOTKEY_ID, mods | MOD_NOREPEAT, vk);
                    Log("注册热键 " + hotkey + " => " + (ok ? "成功" : "失败(可能被占用)"));
                }
                else
                {
                    Log("热键无法解析: " + hotkey);
                }
            }
            else
            {
                Log("未注册热键 (trayOnly=" + _trayOnly + " hotkey=" + hotkey + ")");
            }
        }

        /// <summary>热键消息经隐藏窗体 WndProc 可靠接收</summary>
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == HOTKEY_ID)
            {
                Log("热键触发");
                ToggleMainWindow();
                return;
            }
            base.WndProc(ref m);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            try { UnregisterHotKey(this.Handle, HOTKEY_ID); } catch { }
            if (_tray != null) { _tray.Visible = false; _tray.Dispose(); }
            base.OnFormClosed(e);
        }

        /// <summary>显示窗口：直接启动主程序 exe，单实例锁负责聚焦已有窗口</summary>
        private void ShowMainWindow()
        {
            Log("托盘动作: 显示窗口");
            LaunchMain(null);
        }

        /// <summary>切换窗口显隐：启动主程序带 --toggle，单实例锁切换可见性</summary>
        private void ToggleMainWindow()
        {
            LaunchMain("--toggle");
        }

        private void LaunchMain(string extraArg)
        {
            if (string.IsNullOrEmpty(_mainExe) || !File.Exists(_mainExe))
            {
                Log("主程序不存在: " + _mainExe);
                return;
            }
            try
            {
                var allArgs = new List<string>(_mainArgs);
                if (!string.IsNullOrEmpty(extraArg)) allArgs.Add(extraArg);
                Process.Start(new ProcessStartInfo
                {
                    FileName = _mainExe,
                    Arguments = BuildArgs(allArgs.ToArray()),
                    UseShellExecute = false
                });
                Log("已启动主程序: " + _mainExe + " " + BuildArgs(allArgs.ToArray()));
            }
            catch (Exception ex)
            {
                Log("启动主程序失败: " + ex.Message);
            }
        }

        /// <summary>退出：守护模式杀守护进程；窗口模式通知主程序 --quit；无进程则直接退出</summary>
        private void ExitApp()
        {
            Log("托盘动作: 退出");
            int daemonPid = ReadDaemonPid();
            if (daemonPid > 0 && IsProcessAlive(daemonPid))
            {
                // 守护模式：仅结束守护进程本体（不连带杀自己）
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
                Close();
            }
            else if (IsMainRunning())
            {
                // 窗口模式：通知主程序正常退出
                LaunchMain("--quit");
                // 主程序 before-quit 会结束本进程；兜底 5 秒后自行退出
                Thread.Sleep(5000);
                Close();
            }
            else
            {
                // 无守护进程也无主程序：直接退出
                Close();
            }
        }

        private bool IsMainRunning()
        {
            try
            {
                string name = Path.GetFileNameWithoutExtension(_mainExe);
                return Process.GetProcessesByName(name).Length > 0;
            }
            catch { return false; }
        }

        private int ReadDaemonPid()
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

        private bool IsProcessAlive(int pid)
        {
            try { Process.GetProcessById(pid); return true; }
            catch { return false; }
        }

        private void Log(string msg)
        {
            try
            {
                if (string.IsNullOrEmpty(_storageDir)) return;
                string path = Path.Combine(_storageDir, "helper.log");
                File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + msg + "\r\n");
            }
            catch { }
        }

        /// <summary>解析 ["a","b"] 形式的 JSON 字符串数组（不引入依赖）</summary>
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

        /// <summary>解析 Electron 加速键格式，如 Ctrl+Shift+O / CommandOrControl+Alt+F8</summary>
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
                    case "commandorcontrol": mods |= MOD_CONTROL; break; // Windows 上 CommandOrControl = Ctrl
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

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            bool createdNew;
            using (var mutex = new Mutex(true, "Global\\OUA_HotkeyHelper", out createdNew))
            {
                if (!createdNew) return; // 已有实例
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var app = new TrayApp(args))
                {
                    Application.Run(app);
                }
            }
        }
    }
}

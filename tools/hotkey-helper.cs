// OOAInterface易升 轻量模式托盘助手
// WinForms 托盘图标 + 全局热键。热键/托盘动作通过 HTTP POST 通知守护进程。
// 编译: csc /target:winexe /platform:x64 /optimize+ /out:hotkey-helper.exe hotkey-helper.cs
using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
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
        private static string _wakeUrl = "";
        private static string _exitUrl = "";
        private static bool _trayOnly = false; // 热键关闭时仅保留托盘

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
            // 参数: --port 8964 --token xxx --hotkey "Ctrl+Shift+O" --tray-only
            int port = 8964;
            string hotkey = "";
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length) port = int.Parse(args[i + 1]);
                if (args[i] == "--hotkey" && i + 1 < args.Length) hotkey = args[i + 1];
                if (args[i] == "--tray-only") _trayOnly = true;
            }

            _wakeUrl = "http://127.0.0.1:" + port + "/api/daemon/wake";
            _exitUrl = "http://127.0.0.1:" + port + "/api/daemon/exit";

            // 托盘图标（内嵌：生成自图标文件路径参数 --icon 或使用默认）
            string iconPath = "";
            for (int i = 0; i < args.Length; i++)
                if (args[i] == "--icon" && i + 1 < args.Length) iconPath = args[i + 1];

            _tray = new NotifyIcon();
            Icon ico = null;
            try { if (!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath)) ico = new Icon(iconPath); } catch { }
            _tray.Icon = ico ?? SystemIcons.Application;
            _tray.Text = "OOOInterface 易升";
            _tray.Visible = true;

            var menu = new ContextMenu();
            menu.MenuItems.Add("显示窗口", (s, e) => Post(_wakeUrl));
            menu.MenuItems.Add("-");
            menu.MenuItems.Add("退出", (s, e) => Post(_exitUrl));
            _tray.ContextMenu = menu;
            _tray.DoubleClick += (s, e) => Post(_wakeUrl);

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
                        Post(_wakeUrl);
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

        static void Post(string url)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "POST";
                req.ContentLength = 0;
                req.Timeout = 3000;
                using (var resp = (HttpWebResponse)req.GetResponse()) { }
            }
            catch { }
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

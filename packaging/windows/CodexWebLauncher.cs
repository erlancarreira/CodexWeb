using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Codex Web")]
[assembly: System.Reflection.AssemblyProduct("Codex Web")]
[assembly: System.Reflection.AssemblyCompany("Erlan Carreira")]
[assembly: System.Reflection.AssemblyVersion("6.2.1.0")]
[assembly: System.Reflection.AssemblyFileVersion("6.2.1.0")]

static class Program
{
    static readonly string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    static readonly string BootstrapScript = Path.Combine(Root, "start-codex-web.ps1");
    static readonly string AppExe = ResolveAppExecutable();
    static readonly string DesktopProfile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".codex-chatgpt-web",
        "desktop-profile");
    static readonly string LogDir = Path.Combine(Root, "logs");

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [STAThread]
    static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            if (!File.Exists(BootstrapScript))
                throw new FileNotFoundException("Bootstrap do Codex Web não encontrado.", BootstrapScript);

            int exitCode = RunBootstrapHidden(args);
            if (exitCode == 0)
            {
                var running = FindRunningApp();
                if (running != null)
                    Focus(running);
            }
            return exitCode;
        }
        catch (Exception ex)
        {
            try
            {
                Directory.CreateDirectory(LogDir);
                File.AppendAllText(
                    Path.Combine(LogDir, "desktop-launcher-error.log"),
                    DateTimeOffset.Now.ToString("o") + " " + ex + Environment.NewLine,
                    Encoding.UTF8);
            }
            catch { }

            MessageBox.Show(
                "Não foi possível abrir o Codex Web.\r\n\r\n" + ex.Message,
                "Codex Web",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    static int RunBootstrapHidden(string[] args)
    {
        string powershell = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            @"System32\WindowsPowerShell\v1.0\powershell.exe");

        var command = new StringBuilder();
        command.Append("-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ");
        command.Append(Quote(BootstrapScript));

        if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
        {
            command.Append(" -Uri ");
            command.Append(Quote(args[0]));
        }

        Directory.CreateDirectory(LogDir);
        string stdoutPath = Path.Combine(LogDir, "desktop-launcher.out.log");
        string stderrPath = Path.Combine(LogDir, "desktop-launcher.err.log");

        using (var process = new Process())
        {
            process.StartInfo = new ProcessStartInfo
            {
                FileName = powershell,
                Arguments = command.ToString(),
                WorkingDirectory = Root,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            process.OutputDataReceived += (sender, e) =>
            {
                if (e.Data != null) AppendLine(stdoutPath, e.Data);
            };
            process.ErrorDataReceived += (sender, e) =>
            {
                if (e.Data != null) AppendLine(stderrPath, e.Data);
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();

            if (process.ExitCode != 0)
                throw new InvalidOperationException(
                    "O bootstrap do Codex Web não ficou pronto. Código: " + process.ExitCode +
                    ". Consulte " + stderrPath);

            return 0;
        }
    }

    static Process FindRunningApp()
    {
        if (string.IsNullOrEmpty(AppExe) || !File.Exists(AppExe))
            return null;

        string expected = Path.GetFullPath(AppExe);
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(AppExe)))
        {
            try
            {
                process.Refresh();
                if (process.MainModule == null)
                    continue;

                if (!string.Equals(
                    Path.GetFullPath(process.MainModule.FileName),
                    expected,
                    StringComparison.OrdinalIgnoreCase))
                    continue;

                string commandLineProfileMarker = DesktopProfile;
                return process;
            }
            catch { }
        }
        return null;
    }

    static void Focus(Process process)
    {
        for (int i = 0; i < 16; i++)
        {
            try
            {
                process.Refresh();
                if (process.HasExited)
                    return;

                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    ShowWindow(process.MainWindowHandle, 9);
                    SetForegroundWindow(process.MainWindowHandle);
                    return;
                }
            }
            catch { return; }

            Thread.Sleep(50);
        }
    }

    static string ResolveAppExecutable()
    {
        string[] candidates =
        {
            Path.Combine(Root, "app", "ChatGPT.exe"),
            Path.Combine(Root, "app", "Codex.exe")
        };

        foreach (string candidate in candidates)
            if (File.Exists(candidate))
                return candidate;

        return candidates[0];
    }

    static void AppendLine(string path, string line)
    {
        try
        {
            File.AppendAllText(
                path,
                DateTimeOffset.Now.ToString("o") + " " + line + Environment.NewLine,
                Encoding.UTF8);
        }
        catch { }
    }

    static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}

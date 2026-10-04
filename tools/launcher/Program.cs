using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        string folder = AppDomain.CurrentDomain.BaseDirectory;
        string runtimeFolder = Path.Combine(folder, "runtime");
        string executable = Path.Combine(runtimeFolder, "ICEY.exe");
        string main = Path.Combine(runtimeFolder, "resources", "app", "src", "main.cjs");
        if (!File.Exists(executable) || !File.Exists(main))
        {
            MessageBox.Show("运行文件不完整。请保留“启动艾希.exe”和同目录的 runtime 文件夹。", "艾希启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        try
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = executable;
            info.WorkingDirectory = runtimeFolder;
            info.UseShellExecute = false;
            StringBuilder commandLine = new StringBuilder();
            foreach (string arg in args)
            {
                if (commandLine.Length > 0) commandLine.Append(' ');
                commandLine.Append(Quote(arg));
            }
            info.Arguments = commandLine.ToString();
            Process.Start(info);
        }
        catch (Exception error)
        {
            MessageBox.Show("无法启动艾希：" + error.Message, "艾希启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string Quote(string value)
    {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\')
            {
                slashes++;
                continue;
            }
            if (character == '"')
            {
                result.Append('\\', slashes * 2 + 1);
                result.Append('"');
                slashes = 0;
                continue;
            }
            result.Append('\\', slashes);
            slashes = 0;
            result.Append(character);
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }
}

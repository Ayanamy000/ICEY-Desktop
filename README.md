# ICEY 桌面伙伴

一款面向 Windows 的 ICEY 同人桌宠与桌面助手。她会在桌面上跑动、互动和播放挥刀动画；终端风格面板提供对话、项目工作区、定时任务、记忆、桌面感知、声音输出与插件管理。本项目使用 Electron，模型接口兼容 OpenAI Chat Completions。

> 这是非官方同人项目。源码包包含从本机《ICEY》资源导出的角色动画帧，以及程序代码、文档和图标；不包含个人数据、游戏安装文件或可执行发布版。动画素材与程序代码的权利来源不同。将压缩包公开上传或分发前，请确认自己有权公开使用这些素材。当前项目尚未附带代码许可证，维护者应在公开发布时明确许可方式。

## 功能

- 透明桌宠：左右移动、拖动、互动；文件移入回收站后播放挥刀与碎裂效果。
- 智能对话：连接自己的模型服务，支持温度、上下文预算、多模态屏幕感知与主动交流设置。
- 工作区：为项目选择本机文件夹。保存授权后，艾希可在该文件夹内读取、新建、修改、复制、移动和删除内容。删除使用 Windows 回收站；解除绑定即可停止后续操作。
- 定时任务：每次运行都调用模型判断，可处理提醒、天气、文字与授权工作区内的文件；保存结果、失败原因和执行记录。支持立即运行与接续上次结果。
- 本地记忆：SQLite 保存对话、项目分组、偏好和任务记录；每周一 09:00（北京时间）整理上周内容，支持查看依据、修正和删除。
- 扩展接口：可安装受限 JSON 插件，提供文字、天气和文件技能，不执行插件里的任意脚本。

工作区内的文件读写不再逐项确认，请只绑定愿意交由助手处理的文件夹。读取的文本会按任务需要发送给所配置的模型服务。工作区外的文件操作仍需在操作卡片中确认。任务只在应用和电脑运行时执行，模型、天气和语音服务由使用者自行配置。

## 环境要求

- Windows 10/11 x64
- Node.js 22 或更新版本、npm
- 源码包内已有运行所需的角色动画帧与图标；替换资源时可使用相同目录结构
- 可选：支持 Chat Completions 的模型服务；没有模型时仅提供有限的本地回复，定时任务需要模型连接

## 从源码运行

```powershell
npm ci
npm start
```

源码包已经带有角色动画帧与图标。首次启动不会从仓库获得任何用户密钥或历史记录；应用会在当前 Windows 用户的 `%APPDATA%/icey-desktop-companion/` 创建本机数据文件。若这台电脑以前运行过该应用，开发版会继续使用同一份本机数据。

在「环境配置」选择服务商、填写模型 ID 与 API 密钥后保存。随后可在左上角创建工作区、选文件夹，再通过对话或「任务队列」交给艾希处理。API 密钥使用 Electron `safeStorage` 交由操作系统加密；对话和记忆数据库本身未单独加密。

## 角色资源

源码包包含全部现有动画帧、动作清单、托盘图和打包图标：

```text
src/assets/tray.png
src/assets/animations/manifest.json
src/assets/animations/Idle/000.png ...
src/assets/animations/Run/000.png ...
src/assets/animations/Atk1/000.png ...
src/assets/animations/Atk2/000.png ...
src/assets/animations/Atk3/000.png ...
build/icon.ico                 # 打包时使用
```

`manifest.json` 格式为 `{ "animations": { "Idle": { "duration": 1, "count": 30 }, ... } }`；每个动作的 PNG 从 `000.png` 开始连续编号，透明画布为 640×480。`tools/export-frames.ps1` 和 `tools/render-assets.cjs` 保留了资源处理参考流程，但依赖额外的 Spine 运行时、游戏资源和 Playwright，不是开箱即用的下载器。

## 构建

```powershell
npm run build
```

构建脚本生成 `dist/ICEY-Desktop-1.0.0/`。其中的小型 `启动艾希.exe` 只启动同目录的 `runtime/ICEY.exe`，分发时须保留整个文件夹。构建需要 `build/icon.ico`；若没有预编译的 `build/launcher.exe`，脚本会尝试使用 Windows .NET Framework 编译 `tools/launcher/Program.cs`。`npm run release` 额外生成干净的便携版 ZIP 和 SHA256 文件。

本仓库还提供 `npm run check` 与 `npm test`，以及 `tools/` 中的界面验证脚本。部分界面脚本需要另行安装 Playwright。此次源码打包未运行功能测试。

## 目录

| 路径 | 用途 |
| --- | --- |
| `src/main.cjs`、`src/preload.cjs` | Electron 主进程与受限页面接口 |
| `src/renderer/` | 桌宠与终端界面 |
| `src/services/` | 模型、任务、工作区文件、记忆和其他服务 |
| `src/prompts/` | 艾希的角色提示词 |
| `src/extensions/` | 内置扩展注册入口 |
| `docs/` | 插件接口、记忆和设计说明 |
| `tools/`、`tests/` | 构建工具与测试源码 |

## 数据与隐私

用户数据保存在 `%APPDATA%/icey-desktop-companion/`，不进入 GitHub 源码包或 `dist` 构建包。目录包含配置、加密密钥、SQLite 记忆数据库和已安装插件。数据库中的对话、任务结果与记忆是本机明文；备份前应退出程序。屏幕截图只在获授权时发送给所配置的多模态模型，应用不将截图写入记忆数据库。每周回顾和文件读取也会使用所配置的模型服务。

更多细节见 [记忆与工作区](docs/记忆与工作区.md)、[插件与技能接口](docs/插件与技能接口.md) 和 [发行说明](docs/发行说明.md)。

## 参与开发

欢迎提交可复现的问题、设计建议和代码改进。请在问题中写明 Windows 版本、启动方式、复现步骤与预期行为；不要上传 API 密钥、个人对话或截图中的私密内容。提交改动时请说明功能变化及验证方式。插件和文件操作相关改动应保留工作区范围限制与操作结果记录。

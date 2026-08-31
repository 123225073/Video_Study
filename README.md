# 风沙AI学习平台

把 YouTube、B 站、本地视频或音频变成可检索、可回放、可整理、可输出的个人学习资料。

这是一个 Windows 优先、本地优先的视频学习工具。它把导入、字幕获取、本地转录、时间轴逐字稿、统一学习笔记、流式 AI 总结、可展开思维导图、AI 生图和 Obsidian 输出收进同一个学习工作台，尽量减少在播放器、文档和 AI 对话框之间来回切换。

当前版本：`3.4.0`

> 本项目基于开源项目 [VidBee](https://github.com/nexmoe/VidBee) 改造，保留 MIT 许可证及上游版权声明。风沙版重点增加个人视频学习、学习输出和本机浏览器伴侣能力。

## 核心功能

### 视频与逐字稿

- 粘贴 YouTube、B 站及其他 yt-dlp 支持的视频链接，或导入本地音视频。
- 优先读取已有字幕，也可使用 Whisper、SenseVoice 等模型在本机转录。
- 搜索逐字稿，点击时间戳跳回对应播放位置。
- 保留重新转录和人工校对历史，可恢复旧版本。
- 导出 TXT、Markdown、JSON、SRT、VTT 等格式。

### 学习工作台

- 宽屏采用“AI 学习拓展 / 视频与原始逐字稿 / 学习笔记”三栏布局；左右栏可以收起，分隔线可以拖动调宽；窄屏再切换观看、笔记和输出场景。
- 右侧只保留一个大的 Markdown 学习笔记本。用户选中的逐字稿会以可点击时间链接和引用格式追加到同一个笔记本，不再维护独立的原文备注列表。
- 选中逐字稿可精确到字词进行复制、高亮、加入笔记、写心得、问 AI 或进入“一图胜千言”，并可随时跳回原始视频证据；浮动工具栏支持拖动，点击空白处自动隐藏。
- 本地视频可截取当前画面并加入学习输出。
- 原始逐字稿不被 AI 润色结果覆盖；人工校对也保留历史和恢复入口。

### AI 学习工作流

- 内置 Mermaid 思维导图、精华速览、完整总结、模板总结、基于原文的问答、文字大纲、播客脚本、翻译润色和 AI 生图。
- 总结与思维导图默认可在逐字稿完成后自动运行，其余能力按需调用。
- 所有文字 AI 结果都在主进程持续执行，以流式 Markdown 显示；切换页面不会中断，用户也可以主动停止或重新生成。
- Mermaid 使用内置思维导图提示词，生成后先做语法与渲染校验；通过后显示可逐层展开/收起、缩放并可跳回时间证据的交互式思维导图，历史流程图会安全转换为树形视图。
- “一图胜千言”采用“用途 / 风格 / 比例 / 一个需求 → 可选的流式提示词优化 → 图片模型异步生成 → 本地预览/导出”的链路。生成时持续显示阶段和真实等待时长，切换功能不会丢失任务；成图可点击放大、缩放和拖动查看。默认图片模型为 `gpt-image-2`，也可在设置中修改。
- 每个工作流都有可直接使用的默认系统提示词，并允许在设置中修改或恢复默认值。
- 支持项目原有的 OpenAI、DeepSeek、Anthropic、Google、Ollama、LM Studio 等模型服务。
- AI 历史以非破坏方式追加，保留生成时间和版本。

### Obsidian 输出

- 把学习文稿、笔记、AI 结果和图片写入指定 Obsidian Vault。
- 使用受管理区域更新已导出的内容，避免静默覆盖普通同名笔记。
- 校验目录穿越、Windows 保留名称、非法路径和符号链接越界。

### 浏览器学习伴侣

- Chrome / Edge Manifest V3 扩展，支持 YouTube、B 站和通用 HTML5 视频页面。
- 主动读取当前播放时间、可用字幕和用户选中文字，并发送到桌面学习台。
- 可记录时间点或截取当前视频画面。
- 只连接 `127.0.0.1`，使用一次性配对码和本机 Bearer Token；没有常驻网页脚本。

浏览器伴侣的协议、权限和安装说明见 [apps/extension/README.md](apps/extension/README.md)。

## 运行要求

### 普通使用

- Windows 10/11 x64。
- 本地转录需要额外磁盘空间；模型会在首次使用时下载。
- 在线视频下载能力受平台规则、登录状态、地区和 Cookies 有效期影响。
- AI 功能需要用户自行配置模型服务；也可以配置 Ollama 或 LM Studio 等本地服务。

### 开发环境

- Node.js：版本以仓库根目录 `.node-version` 为准。
- pnpm / Corepack。
- Windows 打包需要 PowerShell。

## 安装与运行

安装依赖并启动桌面开发版：

```powershell
corepack enable
pnpm install
pnpm run dev
```

构建桌面端：

```powershell
pnpm run build
```

生成 Windows 安装包、免安装版和便携目录压缩包：

```powershell
pnpm run build:win
```

构建浏览器伴侣：

```powershell
pnpm run build:extension
pnpm run zip:extension
```

## 推荐使用流程

1. 粘贴视频链接，或从首页导入本地媒体。
2. 使用来源字幕或本地模型生成逐字稿。
3. 进入“学习资料库”，打开资料并点击时间戳边看边记。
4. 让总结、思维导图在转录完成后自动生成，或从“学习输出”按需生成其他学习内容。
5. 选中逐字稿进行高亮、追加到学习笔记、问 AI 或生成分享图片，再按自己的表达习惯修改。
6. 导出字幕、Markdown、PNG，或安全写入 Obsidian。

完整的非开发者使用说明见 [风沙AI学习平台-使用说明.md](风沙AI学习平台-使用说明.md)。

## 质量验证

```powershell
pnpm run check
pnpm --filter ./apps/desktop run test:learning
pnpm --filter ./apps/desktop run test:ai-image
pnpm --filter ./apps/desktop run test:quit-security
pnpm --filter ./apps/desktop run test:e2e:learning
pnpm --filter ./apps/desktop exec tsx scripts/test-security-boundaries.ts
node apps/desktop/scripts/test-local-api-security.mjs
node apps/desktop/scripts/test-local-api-shutdown-contract.mjs
Get-ChildItem apps/extension/tests -Filter *.test.mjs | ForEach-Object { node --experimental-strip-types --test $_.FullName }
pnpm run build:extension
```

`test:learning` 覆盖学习数据迁移、统一笔记追加与并发保存、损坏文件恢复、提示词更新、严格 Mermaid 解析、交互式思维导图、转录源恢复和 Obsidian 路径安全等场景。生图协议测试覆盖流式局部图、兼容回退、停止、替换任务、远程图片本地化、SSRF 防护和敏感信息脱敏。端到端脚本会验证创建首页、学习资料库、宽屏三栏收起与调宽、工具栏拖动与空白隐藏、统一笔记即时恢复、思维导图逐层展开、一图胜千言、紧凑窗口以及浏览器伴侣的本机配对协议。

## 数据与隐私

- 设置、数据库和学习笔记默认保存在 `%APPDATA%\fengsha-video-learning\`。
- 本地转录不会把媒体上传到第三方转录服务。
- 当已启用的自动工作流或用户按需生成内容时，逐字稿、所选片段和相关笔记会发送给用户配置的模型服务；使用本地模型服务时数据仍留在本机环境。
- 浏览器扩展只有在用户点击并执行采集时才临时读取当前标签页。
- `.gitignore` 排除了构建产物、测试用户目录、媒体、日志、密钥和本地数据。

## 当前边界

- 桌面端采用“导入链接或文件后学习”的主流程，不是在网页视频上持续覆盖双语字幕的悬浮插件。
- 当前 AI 翻译以完整学习产物呈现，尚未逐句写回播放器形成实时双语字幕覆盖。
- 网盘 OAuth 导入、应用内录制和纯空白笔记目前是明确标注的能力预留；本地上传、链接解析和浏览器助手已可使用，不会用假成功占位。
- 对外分享和共享知识库已保留数据边界，但当前版本不发布或同步用户内容。
- 浏览器伴侣可以主动采集当前字幕、时间点和画面，但不会持续监听浏览历史。
- DRM、跨域 iframe、浏览器保护页或平台 DOM 更新可能让网页字幕不可读取；此时仍可把页面链接发送到桌面端。
- 自动更新已关闭，避免连接上游 VidBee 发布通道；风沙版需要手动覆盖安装新版本。
- 本仓库不提交 Windows 安装包、模型、下载媒体、测试截图或真实用户数据。

## 仓库结构

- `apps/desktop`：Electron 桌面端。
- `apps/extension`：Chrome / Edge 浏览器学习伴侣。
- `apps/web`、`apps/api`：上游保留的 Web 与 API 应用。
- `packages`：共享 UI、下载与基础模块。

## 许可证与归属

本项目使用 [MIT License](LICENSE)。原始 VidBee 代码版权归原作者及贡献者所有；新增的风沙视频学习功能在相同许可证下发布。

Windows 安装包内含独立运行的 FFmpeg GPLv3 构建。许可证、构建来源、哈希和对应源码提供说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)；打包流程会把 FFmpeg 随附许可证复制到最终安装目录。

仓库：[github.com/123225073/Video_Study](https://github.com/123225073/Video_Study)

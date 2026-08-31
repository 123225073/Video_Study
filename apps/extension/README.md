# 风沙浏览器学习伴侣

这是「风沙视频学习台」的 Chrome / Edge Manifest V3 伴侣扩展。它只在用户点击扩展并明确执行操作时读取当前标签页，不注册常驻网页脚本，也不会自动上传浏览记录。

## 能做什么

- 识别通用 HTML5 视频、YouTube 和 B站页面。
- 展示页面标题、平台、视频时长、当前播放时间和当前可用字幕。
- 将页面发送到桌面学习台。
- 记录当前时间点、所选文字和字幕上下文。
- 截取当前可见的视频区域；发送前先在浏览器内裁剪，不上传整页截图。
- 用户点击“停止本次采集”后立即清空弹窗内读取结果。扩展没有持续采集会话。

## 隐私与权限

扩展只申请三个浏览器权限：

- `activeTab`：用户点击扩展后，临时访问当前标签页。
- `scripting`：在本次授权的页面中执行一次性视频/字幕提取函数。
- `storage`：在浏览器本机保存配对令牌。

唯一的主机权限是 `http://127.0.0.1/*`，用于连接本机桌面程序。扩展不拥有任意网站的永久读取权限，没有常驻 content script，也不会连接互联网服务器。

配对令牌存储于 `chrome.storage.local`。首次使用时，需要先在桌面学习台的“设置 → 浏览器伴侣”查看一次性配对码。收到 `401` 或 `403` 后，扩展会自动删除失效令牌。

## 本机桥接协议

桌面程序监听 `127.0.0.1:27100-27120`。扩展优先检查上次配对端口，失败后并行扫描标准端口范围。

### 状态检查

```http
GET /companion/v1/status
```

已配对时携带 Authorization；响应示例：

```json
{ "ok": true, "pairedClientCount": 1, "app": "Fengsha Video Learning" }
```

### 配对

```http
POST /companion/v1/pair
Content-Type: application/json

{ "code": "824196", "clientName": "风沙浏览器学习伴侣" }
```

响应：`{ "token": "...", "port": 27100 }`。

### 主动采集

```http
POST /companion/v1/capture
Authorization: Bearer <token>
Content-Type: application/json
```

请求字段：

```json
{
  "action": "open | time-marker | frame",
  "pageUrl": "https://...",
  "title": "视频标题",
  "currentTimeSeconds": 123.45,
  "durationSeconds": 600,
  "platform": "youtube | bilibili | other",
  "captionText": "当前字幕或可用字幕片段",
  "captionLanguage": "zh-CN",
  "captionCues": [{ "startSeconds": 120, "endSeconds": 126, "text": "..." }],
  "selectedText": "用户当前选择的文字",
  "screenshotDataUrl": "data:image/jpeg;base64,..."
}
```

`screenshotDataUrl` 只在 `action=frame` 时发送，上限 4MB。桌面端必须限制 CORS Origin、校验 Bearer token、请求体大小和字段类型，并仅监听 loopback 地址。

## 开发与加载

在仓库根目录执行：

```bash
corepack pnpm --filter fengsha-learning-companion run compile
corepack pnpm --filter fengsha-learning-companion run build
node --experimental-strip-types --test apps/extension/tests/*.test.mjs
```

桌面端品牌图标更新后，可运行 `apps/extension/scripts/generate-brand-icons.ps1` 同步生成扩展所需的 16/32/48/128 像素图标。

Chrome / Edge 加载未打包扩展：

1. 打开 `chrome://extensions` 或 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `apps/extension/.output/chrome-mv3`。
5. 启动桌面学习台，在设置页生成配对码，再打开一个视频网页点击扩展图标。

## 页面兼容说明

- 通用站点从最大可见的 `<video>` 读取播放状态，并读取标准 `TextTrack` 字幕。
- YouTube 与 B站额外识别页面标题、可见字幕和已渲染的逐字稿节点。
- 受 DRM、跨域 iframe、浏览器保护页或站点 DOM 更新影响时，扩展会保留页面链接采集，同时明确提示视频/字幕不可用。

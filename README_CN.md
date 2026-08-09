# pi-deepseek-vision

[English](README_EN.md) | 中文

## 项目简介

`pi-deepseek-vision` 是适用于 Pi 0.84.1 的视觉预处理扩展。它使用 Pi 中已有的视觉模型分析当前可见上下文中的图片，将图片替换为编号标记和纯文本分析，再调用目标 DeepSeek 模型。DeepSeek 模型本身始终保持 text-only。

## 功能特性

- 默认支持 `deepseek-v4-pro` 和 `deepseek-v4-flash`，并可通过配置修改目标模型列表。
- 处理 Pi `user` 和 `toolResult` 消息中的 `ImageContent`。
- 保持同一消息内的图片顺序，并通过一次 VLM 请求联合分析多张图片。
- 复用 Pi 的模型注册、认证和 provider 路由，不需要单独配置 API endpoint 或 API key。
- 支持中文、英文和自动语言选择；默认使用 `auto`。
- 使用有界的进程内 LRU 缓存，避免相同图片组和任务上下文被重复分析。
- 把图片内的文字和指令视为不可信数据，只分析可见内容，不执行图片中的指令。
- 视觉预处理失败时采用 fail-closed 行为，不会把未处理图片交给 DeepSeek。

## 前置条件

- Node.js 22.19.0 或更高版本。
- Pi 0.84.1。
- 一个已在 Pi 中注册、已配置认证并声明支持 `image` 输入的视觉模型。

## 安装

### 从本地路径安装

在项目根目录之外执行，并把路径替换为实际的绝对路径：

```bash
pi install /absolute/path/to/pi-deepseek-vision
```

### 从 GitHub 仓库安装

```bash
pi install git:github.com/<owner>/pi-deepseek-vision
```

仓库 owner 目前未在项目中确定。请把 `<owner>` 替换为实际的 GitHub 用户名或组织名；不要原样执行带占位符的命令。

## 首次配置

扩展只读取以下固定的全局配置文件：

```text
~/.pi/agent/deepseek-vision.json
```

如目录不存在，先创建目录，再用编辑器创建配置文件：

```bash
mkdir -p ~/.pi/agent
$EDITOR ~/.pi/agent/deepseek-vision.json
```

把 `visionModel.provider` 和 `visionModel.id` 替换为 Pi 中已有视觉模型的 provider 和 model ID。完整配置示例：

```json
{
  "visionModel": {
    "provider": "your-vision-provider",
    "id": "your-vision-model"
  },
  "targetModels": [
    "deepseek-v4-pro",
    "deepseek-v4-flash"
  ],
  "language": "auto",
  "maxAnalysisChars": 20000,
  "cache": {
    "capacity": 128,
    "ttlSeconds": 900
  }
}
```

### 字段说明

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `visionModel` | 是 | 无 | Pi 中已有的视觉模型。扩展只使用这一个 VLM。 |
| `visionModel.provider` | 是 | 无 | 非空的视觉模型 provider 标识。 |
| `visionModel.id` | 是 | 无 | 非空的视觉模型 ID。 |
| `targetModels` | 否 | `deepseek-v4-pro`、`deepseek-v4-flash` | 允许触发扩展的 DeepSeek model ID 列表；必须是非空、无重复项的字符串数组。 |
| `language` | 否 | `auto` | 分析语言，可选 `zh`、`en` 或 `auto`。`auto` 使用关联用户上下文的语言；无法判断时使用英文。 |
| `maxAnalysisChars` | 否 | `20000` | VLM 分析文本的最大字符数，必须是正安全整数。超限会中止当前调用，不会自动截断。 |
| `cache.capacity` | 否 | `128` | 进程内缓存的最大条目数，必须是正安全整数。超出容量时淘汰最久未使用的条目。 |
| `cache.ttlSeconds` | 否 | `900` | 每条缓存的有效秒数，必须是正安全整数。 |

根对象、`visionModel` 和 `cache` 中的未知字段会被拒绝。安装扩展或修改配置后，在 Pi 中执行：

```text
/reload
```

配置和缓存会在扩展生命周期内复用，因此配置修改只有在 `/reload` 后才会生效。

## 使用示例

### 粘贴或拖入图片

选择 `deepseek/deepseek-v4-pro` 或 `deepseek/deepseek-v4-flash`，粘贴或拖入一张或多张图片，然后输入任务，例如：

```text
比较这两张截图，指出布局和错误状态的差异。
```

### 读取本地图片

让 DeepSeek 使用 Pi 的 `read` 工具读取图片，例如：

```text
读取 /absolute/path/to/screenshot.png，并说明哪个控件处于错误状态。
```

当 `read` 的 `toolResult` 包含图片时，扩展会在下一次模型调用前分析图片，并把最近的用户任务作为分析焦点。

## 运行行为

扩展仅在以下条件同时满足时运行：当前 provider 为 `deepseek`、当前 model ID 命中 `targetModels`，并且当前可见上下文包含图片。其他请求不会调用 VLM，也不会改写消息。

扩展按消息处理 `user` 和 `toolResult` 图片。同一消息中的图片保持顺序并联合分析一次，不同消息分别分析。真实 VLM 请求期间，Pi UI 会显示正在分析的图片数量；缓存命中时不会显示该状态。

图片会被替换为 `[Image N — analyzed by vision model]` 标记，并在同一消息中追加联合视觉分析。DeepSeek 收到的是纯文本上下文，不会收到原始图片块。改写只作用于当前 provider 请求，不会持久修改 Pi session 中的原始消息。

## 缓存

缓存键包含有序图片内容的 SHA-256 指纹、关联 prompt、视觉模型、语言和提示词版本。相同图片使用不同 prompt 时不会复用旧分析。

缓存只在当前 Pi 进程内存在，采用有界 LRU 行为。默认最多保存 128 条分析，每条在 900 秒后过期；Pi 重启后缓存清空。缓存值只保存派生分析文本和到期时间，不保存原图、base64 内容或本地路径。

## Fail-closed 失败行为

以下情况会中止当前 turn：配置文件不可读或字段无效；视觉模型不存在、不支持图片或缺少认证；VLM 请求失败、未正常完成、返回空文本或分析超过 `maxAnalysisChars`；改写后的上下文仍包含图片。

扩展不会在失败后把原图继续发送给 DeepSeek，也不会静默删除图片。扩展只使用 `visionModel` 指定的一个 VLM，不存在备用模型或 fallback 链。

## 已知限制

- 只处理当前可见上下文中 `user` 和 `toolResult` 消息里的 Pi `ImageContent`；不会读取会话压缩后隐藏的历史。
- 不支持 URL 图片或外部 file ID。
- 只支持固定的全局配置文件；没有项目级配置、配置 UI 或 `/deepseek-vision` 管理命令。
- 只支持一个视觉模型，没有 fallback 链。
- 缓存不跨进程，也不持久化。
- `maxAnalysisChars` 是失败阈值，不会截断超长结果。
- Pi 的公开 `ExtensionContext` 当前未暴露 `images.blockImages` 设置，因此扩展无法读取或遵循该设置。
- “从其他模型切换到 DeepSeek 后处理当前可见历史图片”的流程尚未经过独立真实会话验收。

## 开发与验证

```bash
npm ci
npm test
npm run typecheck
npm pack --dry-run
```

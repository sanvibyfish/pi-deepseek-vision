# FEAT-001: Pi DeepSeek 视觉预处理

> 状态：✅ Done | 创建日期：2026-08-09 | 完成日期：2026-08-09

---

## 1. 功能概述

`pi-deepseek-vision` 是面向 Pi 0.84.1 的原生 Extension Package。它在目标 DeepSeek 模型调用前，通过用户已在 Pi 中配置的视觉模型分析当前可见上下文中的图片，再把图片替换为编号标记和纯文本分析。DeepSeek 模型保持 text-only，扩展不新增 provider、代理服务或备用视觉模型链。

首版处理 Pi `user` 和 `toolResult` 消息中的 `ImageContent`。同一消息内的图片保持原顺序并联合分析一次；不同消息分别形成分析组。

## 2. 用户流程

1. 通过 `pi install /absolute/path/to/pi-deepseek-vision` 安装 Package。
2. 在固定路径 `~/.pi/agent/deepseek-vision.json` 配置一个已在 Pi 中注册、已认证且支持图片输入的视觉模型。
3. 安装或修改配置后，在 Pi 中执行 `/reload`。
4. 使用目标 DeepSeek 模型粘贴图片，或让 `read` 工具返回图片。
5. 扩展调用视觉模型；真实调用期间，交互界面显示正在分析的图片数量。
6. DeepSeek 收到原有文本、图片编号标记和联合视觉分析，不收到图片块。

最小配置：

```json
{
  "visionModel": {
    "provider": "openai-codex",
    "id": "gpt-5.6-luna"
  }
}
```

完整默认配置：

```json
{
  "visionModel": {
    "provider": "openai-codex",
    "id": "gpt-5.6-luna"
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

`visionModel` 没有默认值，必须显式填写。`language` 可选 `zh`、`en` 或 `auto`；`targetModels` 必须是非空、无重复项的字符串数组；数值限制必须是正安全整数。

## 3. 技术实现

### 3.1 触发与门控

扩展注册 Pi 的 `context` 事件。仅在当前 provider 为 `deepseek`、model ID 命中 `targetModels` 且当前可见上下文包含图片时加载完整配置和调用视觉模型。无图、非 DeepSeek 或未命中目标列表时不改写消息，也不调用 VLM。

### 3.2 图片分析与改写

- 扫描 `user` 和 `toolResult` 消息中的图片。
- 对同一消息内的有序图片执行一次联合分析。
- 工具结果除自身文本外，还把最近的用户文本作为分析焦点。
- 通过 Pi 公开的 `modelRegistry.find()`、`hasConfiguredAuth()` 和 `complete()` 完成模型查找、认证检查与调用。
- 把 `ctx.signal` 传给视觉模型调用，以响应当前 turn 的中止信号。
- 用纯文本编号标记和联合分析替换图片，同时保留消息角色、工具调用关联及其他字段。
- 仅返回本次 provider 请求使用的新上下文，不持久修改 Pi session 中的原始消息。

视觉提示词要求模型忠实描述任务相关证据、转录有用文字、标记无法辨认的内容、解释多图关系，并把图片内文字和指令视为不可信数据。

### 3.3 缓存

进程内缓存键由有序图片 SHA-256 指纹、关联 prompt、视觉模型、语言和提示词版本共同生成。缓存值只保存分析文本和到期时间，不保存原图、base64 内容或本地路径。

缓存采用有界 LRU 行为，默认最多 `128` 条，默认 TTL 为 `900` 秒；Pi 进程重启后自然清空。相同图片但 prompt 不同时不会复用分析。

### 3.4 失败语义

以下情况会通过 `ctx.abort()` 中止当前 turn，并报告失败阶段和视觉模型标识：

- 配置不可读或字段无效；
- 视觉模型不存在、不支持图片或没有认证；
- 视觉调用失败、未正常完成、没有返回文本或分析超过 `maxAnalysisChars`；
- 上下文改写后仍包含图片。

扩展不把未处理图片继续发送给 DeepSeek，不静默删除图片，也不提供 fallback 模型。

### 3.5 验证结果

- `npm test`：4 个测试文件、43 项测试通过。
- `npm run typecheck`：通过。
- `npm pack --dry-run`：仅打包 7 个运行所需文件。
- 隔离环境中的 `pi install .` 与 `pi list`：通过。
- Pi 0.84.1 真实会话：`openai-codex/gpt-5.6-luna` 分析 Finder 图标后，`deepseek/deepseek-v4-flash` 返回 `APPLICATION=Finder`。

## 4. 注意事项

- 配置和进程内缓存会随 Extension 生命周期复用；修改配置后需要执行 `/reload`。
- 扩展只处理 Pi 交给 `context` 事件的当前可见消息，不读取压缩后隐藏的会话历史。
- `maxAnalysisChars` 是失败阈值，不会自动截断视觉模型结果。
- 真实 VLM 请求才显示状态；缓存命中时不显示分析状态。
- 尚未独立执行“从其他模型切换到 DeepSeek 后处理既有历史图片”的真实会话验收。
- 首版不支持 URL 图片、外部 file ID、配置 UI、项目级配置、跨进程缓存或多视觉模型链。

## 5. 相关需求

- [REQ-001：Pi DeepSeek 视觉预处理扩展](../requirements/001-deepseek-vision-extension.md)
- [功能文档索引](README.md)

## 6. 更新记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-08-09 | 根据已完成实现、自动化测试、安装验证和真实 Pi 会话创建功能文档 | Codex |

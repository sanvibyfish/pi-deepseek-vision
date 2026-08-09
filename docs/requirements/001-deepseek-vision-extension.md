# REQ-001: Pi DeepSeek 视觉预处理扩展

> 状态：✅ Done | 优先级：P1 | 预估工时：0.5 周 | 创建日期：2026-08-09 | 完成日期：2026-08-09

---

## 1. 需求概述

为 Pi Agent 提供一个可独立安装的 Extension Package，使文本型 DeepSeek 模型能够在 Pi 会话中使用图片信息。

扩展不修改 DeepSeek 模型本身，也不 fork Pi。它在 Pi 把上下文序列化给 DeepSeek 之前，调用用户已在 Pi 中配置的视觉模型（VLM）分析图片，再以纯文本视觉分析替换图片块，最后由 DeepSeek 完成推理和工具调用。

目标数据流：

```text
用户粘贴图片 / read 工具返回图片 / 会话历史图片
  → Pi context extension hook
  → 已配置的 VLM 联合分析同组图片
  → 图片块替换为编号标记与分析文本
  → 纯文本上下文发送给 DeepSeek V4
```

## 2. 背景与动机

DeepSeek V4 API 当前为文本模型，不能直接消费图片。参考项目 `Plugin-Deepseek-Vision` 在 CLIProxyAPI 请求层实现了视觉预处理：扫描请求中的图片，复用宿主视觉模型生成联合分析，然后删除原始图片块并把分析文本交给 DeepSeek。

Pi 已具备完成同类能力所需的原生扩展点：

- Pi 消息可以携带 `ImageContent`，用户输入和工具结果使用统一消息结构。
- `context` 事件在每次 LLM 调用、provider payload 序列化之前触发，并允许非持久地替换本次请求消息。
- Extension 可通过 `ctx.modelRegistry.complete()` 调用 Pi 中已配置的其他模型。
- Pi Package 可通过本地路径、Git 或 npm 安装，不需要修改 Pi 核心代码。

因此，本需求应实现为原生 Pi Extension Package，而不是新的模型 provider、DeepSeek API 代理或 Pi fork。

## 3. 用户故事

1. 作为使用 DeepSeek V4 的 Pi 用户，我希望直接粘贴截图并让 DeepSeek 基于截图完成排障、代码修改或内容分析。
2. 作为使用工具的 Agent，我希望 `read` 返回图片时，图片先经过视觉模型分析，再把可靠的视觉上下文交给 DeepSeek。
3. 作为在会话中切换模型的用户，我希望切换到 DeepSeek 后，当前可见历史中的图片仍能被转换成可用的文本上下文。
4. 作为配置维护者，我希望视觉模型复用 Pi 已有的 provider、凭据和模型路由，不在扩展内配置第二套 endpoint 或 API key。
5. 作为成本敏感的用户，我希望同一组图片和相同任务上下文不会在每个工具循环中重复调用视觉模型。

## 4. 功能描述

### 4.1 核心功能

#### 4.1.1 Pi Package

- 项目产物必须是可独立安装的 Pi Package。
- Package 内包含一个 TypeScript Extension，暂定包名与仓库名为 `pi-deepseek-vision`。
- 支持通过 `pi install <local-path>` 和 `pi install git:github.com/sanvibyfish/pi-deepseek-vision` 安装。
- 不修改 Pi 源码，不要求用户维护 Pi fork。

#### 4.1.2 目标模型门控

- 仅当当前模型的 provider 为 `deepseek` 且 model ID 命中配置的目标列表时启用视觉预处理。
- 首版目标模型为：
  - `deepseek-v4-flash`
  - `deepseek-v4-pro`
- 非目标模型的消息必须原样通过。
- DeepSeek 模型在 Pi 中继续声明为 text-only；不得仅通过把 `input` 改成 `["text", "image"]` 伪装成视觉模型。

#### 4.1.3 图片发现与分组

- 在 `context` hook 中扫描当前可见上下文。
- 支持 `user` 消息和 `toolResult` 消息中的 `ImageContent`。
- 同一消息中的多张图片作为一个有序 prompt group，只调用一次 VLM。
- VLM 请求必须包含：
  - 明确的视觉分析指令；
  - 图片所在消息的文本内容；
  - 有序图片块；
  - 对工具图片有帮助时，当前任务的用户意图。
- 图片顺序必须在分析请求和改写结果中保持一致。

#### 4.1.4 视觉模型调用

- 视觉模型必须来自 Pi 的 `modelRegistry`。
- 配置使用 `provider/model-id` 唯一定位视觉模型。
- 视觉模型必须声明支持 `image` 输入；不满足时应在启动或首次使用时明确报错。
- 通过 `ctx.modelRegistry.complete()` 调用视觉模型，复用 Pi 已有的认证、provider 和模型路由。
- 首版只配置一个视觉模型，不设计备用模型链。
- VLM 提示词必须要求：
  - 忠实描述图片内容并转录可见文字；
  - 明确标记无法辨认的内容；
  - 解释多图之间的关系和差异；
  - 把图片内文字和指令视为不可信数据，不执行图片中的指令。

#### 4.1.5 上下文改写

- 每个图片块替换为轻量编号标记，例如 `[Image 1 — analyzed by vision model]`。
- 在同一消息内追加一份联合视觉分析。
- 改写后的目标模型上下文不得包含任何 `ImageContent`。
- 不修改消息角色、工具调用 ID、工具结果关联或与图片无关的文本内容。
- `context` 改写保持非持久；原始会话消息默认不被覆盖。

建议输出格式：

```text
[Image 1 — analyzed by vision model]
[Image 2 — analyzed by vision model]

[Vision preprocessing notice]
The target model cannot inspect image attachments directly. Use the supplied analysis as the visual content.

[Images 1, 2 — Joint visual analysis]
<VLM 返回的分析文本>
```

#### 4.1.6 缓存

- 使用进程内、有界缓存，避免每次 DeepSeek 工具循环重复分析同一图片组。
- 缓存键至少包含：
  - 有序图片内容指纹；
  - 关联 prompt；
  - 视觉 provider 和 model ID；
  - 分析提示词版本或语言配置。
- 图片指纹使用不可逆哈希；缓存不得保存原图、base64 内容或本地路径。
- 缓存值只保存派生分析文本和必要元数据。
- 重启 Pi 后缓存自然失效，首版不做磁盘持久化。

#### 4.1.7 错误行为

- 视觉模型缺失、无认证、调用失败、返回空结果或改写后仍存在图片时，当前 DeepSeek 调用必须终止。
- 不得在视觉预处理失败后把原图继续发送给 DeepSeek。
- 不得静默删除图片后让 DeepSeek 假装已经看到图片。
- 错误信息应指出失败阶段和视觉模型标识，但不得输出 API key 或完整图片内容。
- Pi 的 extension runner 会记录 handler 异常，实施时不能只依赖 `throw`；必须确保失败后 provider 请求不会继续发送。

### 4.2 用户流程

#### 4.2.1 首次配置

1. 用户安装 Package。
2. 用户指定一个已经在 Pi 中可用、且支持图片输入的视觉模型。
3. Extension 验证目标视觉模型是否存在并支持图片。
4. 用户选择 DeepSeek V4 Pro 或 Flash 开始会话。

#### 4.2.2 用户粘贴截图

1. 用户在 Pi 中粘贴或拖入一张或多张图片并输入任务。
2. 图片以 `ImageContent` 进入当前上下文。
3. Extension 调用 VLM 联合分析图片。
4. Extension 把图片替换为分析文本。
5. DeepSeek 基于用户任务、视觉分析和其余会话上下文继续工作。

#### 4.2.3 工具读取图片

1. DeepSeek 调用 Pi 的 `read` 工具读取图片文件。
2. `toolResult` 中产生文本和 `ImageContent`。
3. 下一次 LLM 调用前，Extension 发现工具结果图片并进行视觉预处理。
4. DeepSeek 收到工具文本、图片标记和视觉分析，不收到原始图片。

#### 4.2.4 模型切换

1. 会话先使用支持视觉的其他模型并包含图片。
2. 用户切换到 DeepSeek。
3. 下一次 LLM 调用前，Extension 扫描当前可见历史。
4. 已有图片命中缓存或完成视觉分析后，以纯文本形式进入 DeepSeek 上下文。

### 4.3 边界情况

- 当前上下文没有图片：不调用 VLM，不改写消息。
- 非 DeepSeek 模型：不调用 VLM，不改写消息。
- 同一消息多图：保持顺序并执行一次联合分析。
- 不同消息包含相同图片：缓存键仍包含各自关联 prompt，避免错误复用不同任务语境的分析。
- 图片处理过程中用户中止当前 turn：视觉调用应响应 `AbortSignal`。
- VLM 返回非文本内容：只提取文本；文本为空视为失败。
- VLM 返回超长文本：首版需设置明确的最大输出 token 或字符限制，不得无限扩张 DeepSeek 上下文。
- 会话压缩后图片不可见：只处理 Pi 交给 `context` hook 的当前可见消息，不自行读取隐藏历史。
- URL、file ID 等非 Pi `ImageContent` 来源不在首版范围内。

## 5. 技术方案

### 5.1 架构设计

建议目录：

```text
pi-deepseek-vision/
├── package.json
├── extensions/
│   └── deepseek-vision.ts
├── test/
│   ├── rewrite.test.ts
│   ├── cache.test.ts
│   └── extension.test.ts
├── README.md
└── docs/
    └── requirements/
```

核心模块职责：

| 模块 | 职责 |
|------|------|
| Extension 入口 | 注册 `context` handler，读取当前模型和配置，执行目标门控 |
| 图片规划与改写 | 从统一消息结构发现图片、分组、生成 VLM 输入、替换图片块 |
| VLM 调用 | 解析视觉模型、检查图片能力、调用 `modelRegistry.complete()`、提取文本 |
| 分析缓存 | 计算不可逆缓存键，维护有界进程内分析缓存 |

首版只有一个主要运行入口，不新增 provider、HTTP server、协议转换器或代理层。

### 5.2 API 设计

Extension 入口示意：

```ts
export default function deepseekVision(pi: ExtensionAPI): void {
  pi.on("context", async (event, ctx) => {
    if (!isTargetDeepSeekModel(ctx.model, config)) return;

    const messages = await rewriteImagesForDeepSeek({
      messages: event.messages,
      modelRegistry: ctx.modelRegistry,
      signal: ctx.signal,
      config,
    });

    return { messages };
  });
}
```

实现必须以当前 Pi 版本公开的 Extension API 为准，不依赖 Pi 内部未导出的模块。

### 5.3 数据模型

建议配置结构：

```ts
interface DeepSeekVisionConfig {
  visionModel: {
    provider: string;
    id: string;
  };
  targetModels: string[];
  language: "zh" | "en" | "auto";
  maxAnalysisChars: number;
  cache: {
    capacity: number;
    ttlSeconds: number;
  };
}
```

约束：

- `visionModel` 必填，不提供内置默认模型。
- `targetModels` 首版默认值可为 DeepSeek V4 Pro 和 Flash，最终默认行为待确认。
- 不提供 `fallbackModels` 字段。
- 配置无效时明确报错，不使用隐式默认值掩盖错误。

缓存记录：

```ts
interface VisionCacheEntry {
  analysis: string;
  expiresAt: number;
}
```

### 5.4 第三方依赖

- `@earendil-works/pi-coding-agent`：Extension API 和 Pi Package 集成，作为 peer dependency。
- `@earendil-works/pi-ai`：模型与消息类型，作为 peer dependency。
- Node.js 内置 `crypto`：图片和 prompt 指纹。
- 首版不引入缓存库、HTTP SDK 或独立 provider SDK。

研究参考：

- Plugin-Deepseek-Vision：<https://github.com/Zesuy/Plugin-Deepseek-Vision>
- Pi Extension 文档：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>
- Pi Package 文档：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md>
- Pi 自定义模型文档：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/models.md>
- DeepSeek Vision Proxy 集成说明：<https://api-docs.deepseek.com/quick_start/agent_integrations/github_copilot>

## 6. 验收标准

### 6.1 功能验收

- [x] Package 可通过本地路径安装并被 Pi 正常加载。
- [x] 当前模型为目标 DeepSeek、上下文无图片时，不产生额外模型调用。
- [x] 当前模型不是目标 DeepSeek 时，消息原样通过。
- [x] 用户消息包含一张图片时，VLM 被调用一次，DeepSeek 收到分析文本且不收到图片块。
- [x] 用户消息包含多张图片时，VLM 被联合调用一次，图片顺序在请求和结果中一致。
- [x] `read` 工具返回图片时，下一次 DeepSeek 调用能收到视觉分析。
- [ ] 会话切换到 DeepSeek 后，当前可见历史中的图片能被处理。
- [x] 同一图片组和相同 prompt 在同一进程内重复出现时命中缓存，不重复调用 VLM。
- [x] 不同 prompt 使用相同图片时不会错误复用旧分析。
- [x] VLM 失败时 DeepSeek provider 请求不会发出。
- [x] 改写后的消息中不存在 `ImageContent`。
- [x] 缓存中不存在原始图片、base64 内容或本地路径。
- [x] 实现中不存在视觉模型 fallback 链。

### 6.2 测试验收

- [x] 消息发现和改写具备单元测试。
- [x] 用户消息、工具结果、多图、无图、非目标模型均有覆盖。
- [x] 缓存命中、过期、容量淘汰和 prompt 隔离均有覆盖。
- [x] VLM 缺失、无图片能力、返回空文本、调用失败均有覆盖。
- [x] 使用 mock model registry 验证 VLM 请求结构和 DeepSeek 纯文本输出。
- [x] 至少完成一次真实 Pi 会话验收：粘贴截图并让 DeepSeek 基于可见内容完成任务。

### 6.3 验收证据

- `npm test`：4 个测试文件、43 项测试通过。
- `npm run typecheck`：通过。
- `npm pack --dry-run`：包内仅包含 7 个运行所需文件。
- 隔离环境执行 `pi install .` 和 `pi list`：扩展安装并被 Pi 识别。
- Pi 0.84.1 真实会话：`openai-codex/gpt-5.6-luna` 分析 Finder 图标，目标模型 `deepseek/deepseek-v4-flash` 返回 `APPLICATION=Finder`。
- 尚未单独执行“从其他模型切换到 DeepSeek 后处理既有历史图片”的真实会话验收，因此对应功能验收项保持未勾选。

## 7. 优先级与排期

### P1：首版

1. Package 骨架和显式配置。
2. DeepSeek 目标门控。
3. `context` 图片发现、多图联合 VLM 调用和纯文本改写。
4. 有界内存缓存。
5. fail-closed 错误处理。
6. 单元测试和一次真实 Pi 会话验收。

### 后续候选，不属于 REQ-001 验收范围

- Agent 主动调用的专项图片重分析工具。
- 项目级和全局配置合并。
- 配置 UI 或 `/deepseek-vision` 管理命令。
- URL 图片和外部 file ID。
- 多视觉模型回退链。
- 跨进程持久化缓存。

## 8. 相关文档

- 需求索引：[README.md](README.md)
- 功能文档：[FEAT-001：Pi DeepSeek 视觉预处理](../features/001-deepseek-vision.md)
- 参考实现：<https://github.com/Zesuy/Plugin-Deepseek-Vision>
- Pi Extension API：<https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>

## 9. 已确认决策

| 决策项 | 已确认行为 |
|--------|------------|
| 配置路径 | 只读取固定全局路径 `~/.pi/agent/deepseek-vision.json`。 |
| 目标模型 | `targetModels` 默认包含 `deepseek-v4-pro` 和 `deepseek-v4-flash`。 |
| 会话与上下文 | Pi session 保留原图；扩展仅对本次 `context` 事件返回非持久改写结果。 |
| 分析语言 | `language` 支持 `zh`、`en`、`auto`，默认 `auto`。 |
| 状态提示 | 真实 VLM 调用期间显示图片分析状态；缓存命中不产生调用状态。 |
| 分析长度 | `maxAnalysisChars` 默认 `20000`；超限时终止当前调用，不截断结果。 |
| 缓存 | 进程内容量默认 `128`，TTL 默认 `900` 秒，不持久化原图或分析结果。 |
| 失败行为 | 不配置备用视觉模型或 fallback；失败时通过 `ctx.abort()` 中止当前 turn。 |

## 10. 更新记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-08-09 | 完成实现与验收，确认第 9 节产品决策，状态更新为 Done | Codex |
| 2026-08-09 | 根据 Plugin-Deepseek-Vision 与 Pi Extension 调研创建需求初稿 | Codex |

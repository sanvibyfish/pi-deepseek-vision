# pi-deepseek-vision

English | [中文](README_CN.md)

## Overview

`pi-deepseek-vision` is a vision preprocessing extension for Pi 0.84.1. It uses a vision model already available in Pi to analyze images in the current visible context, replaces them with numbered markers and plain-text analysis, and then calls the target DeepSeek model. The DeepSeek model itself always remains text-only.

## Features

- Targets `deepseek-v4-pro` and `deepseek-v4-flash` by default, with a configurable target model list.
- Processes `ImageContent` in Pi `user` and `toolResult` messages.
- Preserves image order within a message and jointly analyzes multiple images in one VLM request.
- Reuses Pi's model registry, authentication, and provider routing; no separate API endpoint or API key is required.
- Supports Chinese, English, and automatic language selection; the default is `auto`.
- Uses a bounded in-process LRU cache to avoid analyzing the same image group and task context repeatedly.
- Treats text and instructions inside images as untrusted data; it analyzes visible content without executing image-borne instructions.
- Fails closed when vision preprocessing fails, so unprocessed images are never passed to DeepSeek.

## Prerequisites

- Node.js 22.19.0 or later.
- Pi 0.84.1.
- A vision model registered in Pi, with authentication configured and `image` input support declared.

## Installation

### Install from a local path

Run this outside the project root and replace the path with the actual absolute path:

```bash
pi install /absolute/path/to/pi-deepseek-vision
```

### Install from a GitHub repository

```bash
pi install git:github.com/<owner>/pi-deepseek-vision
```

The repository owner is not currently established in this project. Replace `<owner>` with the actual GitHub username or organization; do not run the placeholder unchanged.

## First-time configuration

The extension reads only this fixed global configuration file:

```text
~/.pi/agent/deepseek-vision.json
```

If the directory does not exist, create it and then open the configuration file in an editor:

```bash
mkdir -p ~/.pi/agent
$EDITOR ~/.pi/agent/deepseek-vision.json
```

Replace `visionModel.provider` and `visionModel.id` with the provider and model ID of a vision model already available in Pi. Complete configuration example:

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

### Field reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `visionModel` | Yes | None | A vision model already available in Pi. The extension uses only this VLM. |
| `visionModel.provider` | Yes | None | Non-empty provider identifier for the vision model. |
| `visionModel.id` | Yes | None | Non-empty model ID for the vision model. |
| `targetModels` | No | `deepseek-v4-pro`, `deepseek-v4-flash` | DeepSeek model IDs allowed to trigger the extension; it must be a non-empty string array without duplicates. |
| `language` | No | `auto` | Analysis language: `zh`, `en`, or `auto`. `auto` uses the language of the associated user context, or English when unclear. |
| `maxAnalysisChars` | No | `20000` | Maximum VLM analysis length in characters; it must be a positive safe integer. Exceeding it aborts the current call instead of truncating the analysis. |
| `cache.capacity` | No | `128` | Maximum number of in-process cache entries; it must be a positive safe integer. The least recently used entry is evicted when capacity is exceeded. |
| `cache.ttlSeconds` | No | `900` | Cache lifetime in seconds for each entry; it must be a positive safe integer. |

Unknown fields in the root object, `visionModel`, or `cache` are rejected. After installing the extension or changing the configuration, run this command in Pi:

```text
/reload
```

Configuration and cache state are reused for the extension lifecycle, so configuration changes take effect only after `/reload`.

## Usage examples

### Paste or drop images

Select `deepseek/deepseek-v4-pro` or `deepseek/deepseek-v4-flash`, paste or drop one or more images, and enter a task such as:

```text
Compare these two screenshots and identify differences in layout and error state.
```

### Read a local image

Ask DeepSeek to use Pi's `read` tool on an image, for example:

```text
Read /absolute/path/to/screenshot.png and explain which control is in an error state.
```

When the `read` `toolResult` contains an image, the extension analyzes it before the next model call and uses the latest user task as the analysis focus.

## Runtime behavior

The extension runs only when all of these conditions are met: the current provider is `deepseek`, the current model ID is listed in `targetModels`, and the current visible context contains an image. Other requests do not call the VLM or rewrite messages.

The extension processes images in `user` and `toolResult` messages one message at a time. Images in the same message retain their order and are jointly analyzed once; separate messages are analyzed separately. During a real VLM request, the Pi UI shows the number of images being analyzed; a cache hit does not show that status.

Images are replaced with `[Image N — analyzed by vision model]` markers, and joint visual analysis is appended to the same message. DeepSeek receives a text-only context and never receives the original image blocks. The rewrite applies only to the current provider request and does not persistently modify the original messages in the Pi session.

## Cache

The cache key includes SHA-256 fingerprints of the ordered image content, the associated prompt, vision model, language, and prompt version. The same image under a different prompt does not reuse an older analysis.

The bounded LRU cache exists only in the current Pi process. By default, it stores up to 128 analyses, each expiring after 900 seconds; restarting Pi clears it. Cache values store only derived analysis text and expiration time, never original images, base64 content, or local paths.

## Fail-closed behavior

The current turn is aborted when the configuration file is unreadable or invalid; the vision model is missing, lacks image support, or lacks authentication; the VLM request fails, does not complete normally, returns no text, or exceeds `maxAnalysisChars`; or the rewritten context still contains an image.

The extension never forwards original images to DeepSeek after a failure and never silently deletes them. It uses only the single VLM specified by `visionModel`; there is no backup model or fallback chain.

## Known limitations

- Only Pi `ImageContent` in `user` and `toolResult` messages in the current visible context is processed; history hidden by session compaction is not read.
- URL images and external file IDs are not supported.
- Only the fixed global configuration file is supported; there is no project-level configuration, configuration UI, or `/deepseek-vision` management command.
- Only one vision model is supported, with no fallback chain.
- The cache is neither cross-process nor persistent.
- `maxAnalysisChars` is a failure threshold and does not truncate oversized results.
- Pi's public `ExtensionContext` does not currently expose the `images.blockImages` setting, so the extension cannot read or honor that setting.
- The flow that switches from another model to DeepSeek and processes images in the current visible history has not been independently validated in a real session.

## Development and verification

```bash
npm ci
npm test
npm run typecheck
npm pack --dry-run
```

# pi-deepseek-vision

`pi-deepseek-vision` 是适用于 Pi 0.84.1 的视觉预处理扩展。它让文本型 DeepSeek 模型能使用当前上下文中的图片信息，同时保持 DeepSeek 模型本身为 text-only。

## 前置条件

- Node.js 22.19.0 或更高版本
- Pi 0.84.1
- 一个已经在 Pi 中配置、已认证并声明支持 `image` 输入的视觉模型

## 安装

从本地目录安装：

```bash
pi install /absolute/path/to/pi-deepseek-vision
```

从 Git 仓库安装：

```bash
pi install git:github.com/<owner>/pi-deepseek-vision
```

安装或更新扩展后，在 Pi 中执行 `/reload`。

## 配置

扩展只读取固定的全局配置文件：

```text
~/.pi/agent/deepseek-vision.json
```

创建该文件，并把 `visionModel.provider` 和 `visionModel.id` 改成 Pi 中已有的视觉模型标识：

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

`visionModel` 必填且没有内置默认值。其余字段可省略，默认值与上例一致：`language` 可选 `zh`、`en` 或 `auto`，所有数值限制必须为正整数，`targetModels` 必须是非空且无重复项的字符串数组。修改配置后执行 `/reload`。

## 行为

扩展仅在当前 provider 为 `deepseek`、model ID 命中 `targetModels` 且当前可见上下文含图片时运行。它按消息发现 `user` 和 `toolResult` 图片，把同一消息内的图片有序地交给已配置的视觉模型联合分析，再把图片块替换为编号标记和一份纯文本分析。原始会话消息不会被持久改写。

重复的图片组、关联文本和分析设置会命中进程内缓存。缓存最多保留 `capacity` 条派生文本并在 `ttlSeconds` 后过期；它不保存原图、base64 内容或本地路径，Pi 重启后缓存清空。

## 失败语义

配置无效、视觉模型不存在或不支持图片、认证缺失、视觉调用失败、返回空文本、分析超过字符限制，或改写结果仍含图片时，当前 DeepSeek 调用会终止。扩展不会把原图继续发送给 DeepSeek，也不会静默删除图片。只使用配置的一个视觉模型，不存在备用模型或 fallback 链。

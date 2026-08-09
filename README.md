# pi-deepseek-vision

`pi-deepseek-vision` is a vision preprocessing extension for Pi 0.84.1. It uses a configured vision model to turn images in the current context into text before a text-only DeepSeek model is called.

`pi-deepseek-vision` 是面向 Pi 0.84.1 的视觉预处理扩展。它在调用纯文本 DeepSeek 模型前，使用已配置的视觉模型把当前上下文中的图片转换为文本分析。

- [中文文档](README_CN.md)
- [English documentation](README_EN.md)

## 安装 / Installation

本地路径 / Local path:

```bash
pi install /absolute/path/to/pi-deepseek-vision
```

GitHub（请替换 `<owner>`）/ GitHub (replace `<owner>`):

```bash
pi install git:github.com/<owner>/pi-deepseek-vision
```

安装后创建 `~/.pi/agent/deepseek-vision.json`，再在 Pi 中执行 `/reload`。完整配置和使用说明请进入上方对应语言文档。

After installation, create `~/.pi/agent/deepseek-vision.json`, then run `/reload` in Pi. See the language-specific documentation above for the complete configuration and usage guide.

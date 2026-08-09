# 功能文档索引

## 状态说明

| 状态 | 标识 | 说明 |
|------|------|------|
| 待评审 | 🔵 Draft | 初稿，待讨论确认 |
| 已确认 | 🟢 Ready | 已确认，可进入开发 |
| 进行中 | 🟡 In Progress | 正在开发中 |
| 已完成 | ✅ Done | 已上线，文档需记录完成日期 |
| 已搁置 | ⏸️ On Hold | 暂时搁置 |

## 文档列表

| 编号 | 名称 | 状态 | 文档 |
|------|------|------|------|
| FEAT-001 | Pi DeepSeek 视觉预处理 | ✅ Done（2026-08-09） | [001-deepseek-vision.md](001-deepseek-vision.md) |

## 分类

### 模型能力扩展

- [FEAT-001：Pi DeepSeek 视觉预处理](001-deepseek-vision.md)

## 依赖关系

- FEAT-001 实现 [REQ-001：Pi DeepSeek 视觉预处理扩展](../requirements/001-deepseek-vision-extension.md)。
- 运行依赖 Pi 0.84.1 的公开 Extension、Package 和 Model Registry API。
- 运行依赖用户已在 Pi 中配置并认证一个支持图片输入的视觉模型。

## 更新记录

| 日期 | 变更 |
|------|------|
| 2026-08-09 | 创建功能索引并登记 FEAT-001 |

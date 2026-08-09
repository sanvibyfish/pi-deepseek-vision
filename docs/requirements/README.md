# 需求文档索引

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
| REQ-001 | Pi DeepSeek 视觉预处理扩展 | ✅ Done（2026-08-09） | [001-deepseek-vision-extension.md](001-deepseek-vision-extension.md) |

## 分类

### 模型能力扩展

- [REQ-001：Pi DeepSeek 视觉预处理扩展](001-deepseek-vision-extension.md)

## 依赖关系

- REQ-001 无其他项目内需求依赖。
- 实现依赖 Pi 公开的 Extension、Package 和 Model Registry API。
- 运行依赖用户已在 Pi 中配置一个支持图片输入的视觉模型。
- REQ-001 的交付功能记录见 [FEAT-001：Pi DeepSeek 视觉预处理](../features/001-deepseek-vision.md)。

## 更新记录

| 日期 | 变更 |
|------|------|
| 2026-08-09 | REQ-001 完成实现与验收，状态更新为 Done，并关联 FEAT-001 |
| 2026-08-09 | 创建需求索引并登记 REQ-001 |

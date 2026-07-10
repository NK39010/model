# ggtree Web 工具与 iTOL 功能差距

本清单以用户保存的 iTOL 页面（2026-07-10）为参照。目标是明确当前项目状态，不能把“页面出现入口”视为功能完成。

状态：`完成`、`部分`、`缺失`、`不纳入`。

## 核心架构

| 能力 | 当前状态 | 说明 |
|---|---|---|
| 浏览器即时树绘制 | 缺失 | 当前由 R/ggtree 生成 SVG；iTOL 使用 JavaScript/Paper.js Canvas。 |
| 大树增量绘制与空间命中 | 缺失 | 当前没有 Canvas 空间索引或窗口化。 |
| 权威发表级导出 | 完成 | SVG/PDF/PNG 由同一套 ggtree 参数生成。 |
| 轻量预览 | 部分 | 只生成 SVG/layout，但仍需启动 R。 |
| 稳定节点模型 | 完成 | Python Tree Model、clade ID、parent/children 已建立。 |

## 输入格式

| 能力 | 当前状态 |
|---|---|
| Newick | 完成 |
| Nexus | 缺失 |
| PhyloXML | 缺失 |
| Jplace | 缺失 |
| NHX / MrBayes metadata | 缺失 |
| QIIME 2 QZA | 缺失 |

## Basic controls

| 能力 | 当前状态 |
|---|---|
| Rectangular | 完成 |
| Circular | 完成 |
| Fan | 完成 |
| Slanted | 缺失 |
| Unrooted equal-angle | 缺失 |
| Unrooted equal-daylight | 缺失 |
| 使用/忽略枝长 | 完成 |
| 整树旋转、反转 | 缺失 |
| 圆形 arc 与 rotation | 部分：只有 fan open angle |
| 标签显示、字号、颜色、偏移、对齐 | 完成 |
| 字体族、粗体、斜体、背景、多样式 | 缺失 |
| 分支颜色、宽度 | 完成 |
| 直线/曲线、祖先渐变 | 缺失 |
| 标签连接线样式 | 部分：R 固定 dotted |

## Advanced controls

| 能力 | 当前状态 |
|---|---|
| 横向/纵向缩放因子 | 部分：只有 x expand 与页面缩放 |
| Leaf sorting | 缺失 |
| 节点 ID/标签显示 | 缺失 |
| 枝长标签 | 缺失 |
| Bootstrap 文字/符号/颜色/宽度映射 | 部分：文字、圆点、阈值 |
| 内外节点符号自定义 | 部分：统一内部节点点 |
| 自动折叠 | 缺失 |
| 单叶间距 | 缺失 |
| 长枝截断 | 缺失 |
| 时间尺度 | 缺失 |
| Colored ranges | 缺失 |

## 树结构操作

| 能力 | 当前状态 |
|---|---|
| 搜索 tip/clade | 完成：列表搜索 |
| 画布直接点击分支/节点 | 缺失 |
| Collapse/expand | 完成：列表选择后操作 |
| Rotate children | 完成：列表选择后操作 |
| Reroot at clade | 完成 |
| Midpoint root | 完成 |
| Prune | 缺失 |
| Delete/move node | 缺失 |
| Copy node ID/descendant labels | 缺失 |
| 节点 metadata 编辑 | 缺失 |
| Undo/redo/reset structural edits | 缺失 |

## Datasets 与注释

| 能力 | 当前状态 |
|---|---|
| Tip metadata CSV/TSV | 完成 |
| 序列名 + 物种名双环标签 | 完成 |
| Color strip | 缺失 |
| Binary symbols | 缺失 |
| Heatmap | 缺失 |
| Simple/multi bar | 缺失 |
| Gradient | 缺失 |
| Pie chart | 缺失 |
| Symbols | 缺失 |
| Text labels | 部分：序列/物种双标签 |
| Protein domains | 缺失 |
| Connections | 缺失 |
| Images | 缺失 |
| MSA track | 缺失 |
| Dataset legend | 缺失 |
| Dataset reorder/group/toggle | 缺失 |
| 文件拖放模板导入 | 缺失 |

## 工具栏与工作区

| 能力 | 当前状态 |
|---|---|
| Zoom in/out/fit/center | 完成 |
| Tree info | 完成 |
| Search entry | 完成 |
| Annotation entry | 完成：打开 Datasets |
| Hover popup | 缺失 |
| Hover clade highlight | 缺失 |
| Manual annotation | 缺失 |
| Keyboard shortcuts | 缺失 |
| 命名视图 | 完成：浏览器本地 |
| 默认视图/项目默认 | 缺失 |
| Undo/reset menus | 缺失 |

## Export

| 能力 | 当前状态 |
|---|---|
| SVG/PDF/PNG 全图 | 完成 |
| Style JSON | 完成 |
| Newick 导出 | 部分：结果文件中存在 input tree，未提供专用入口 |
| Nexus/PhyloXML/EPS/PS | 缺失 |
| Screen area vs full image | 缺失 |
| 导出边距/文件名 | 缺失 |
| 内部节点 ID 选项 | 缺失 |
| 后台导出队列 UI | 部分：通用 job 状态 |

## 完成定义

“基础对齐完成”只要求：

1. Newick 输入、三种主要布局、枝长、标签、支持度和基础样式稳定。
2. 画布缩放/平移/适应、节点搜索、选择、折叠、旋转和定根可用。
3. 至少具备 color strip、binary、heatmap、bar 四类注释轨道和图例。
4. 预览与 SVG/PDF/PNG 导出使用同一数据与样式规范。
5. 具备撤销/重做、命名视图和结构状态恢复。
6. 通过小树、中树和大树分级性能验收。

完整复制 iTOL 的所有功能不属于本项目的合理完成定义，也不应复制其专有脚本。其余能力按项目实际科研需求逐项增加。

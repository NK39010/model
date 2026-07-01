# Documents how to run and extend the modular bioinformatics backend.

# Bio Tool Backend

这是一个最小模块化生物信息后端示例。当前已经包含：

```text
reference_similarity_table
pairwise_similarity_matrix
ncbi_refseq_lookup
ncbi_blast_lookup
sequence_parts_parse
mafft_alignment
MSA_quality
```

所有工具统一通过任务接口调用：

```text
POST /api/jobs
```

请求格式：

```json
{
  "tool_name": "reference_similarity_table",
  "payload": {}
}
```

## 启动

安装依赖：

```bash
uv sync
```

启动最小网页和 API：

```bash
uv run api
```

如果端口 `8000` 被占用，服务会自动尝试后续端口。也可以手动指定：

```bash
uv run api 8010
```

Windows PowerShell：

```powershell
uv run api
```

打开终端打印的地址：

```text
http://127.0.0.1:8000
```

前端现在优先使用 React 构建产物：

```text
frontend/dist/index.html
```

后端 `GET /` 会优先读取并返回这个文件。如果还没有构建 React 前端，则回退到旧静态页面：

```text
frontend/index.html
```

React 源码位于：

```text
frontend/react/
```

首次安装或修改前端后运行：

```bash
cd frontend
pnpm install
pnpm run build
```

## 本地工具配置

部分工具会调用本机安装的命令行程序。推荐把这些程序链接或复制到 uv 虚拟环境里，让 `uv run` 自动通过 `.venv/bin` 或 `.venv\Scripts` 找到它们。项目启动时也会读取根目录 `.env`，用于必要时覆盖本机路径；`.env` 不会提交到仓库。

首次配置：

```bash
cp .env.example .env
```

### IQ-TREE

`iqtree_phylogeny` 需要真实 IQ-TREE 可执行文件。后端查找顺序是：

```text
IQTREE_BINARY -> iqtree3 -> iqtree2 -> iqtree
```

macOS Apple Silicon 推荐：

```bash
brew install iqtree3
```

然后把 IQ-TREE 包装进 uv 虚拟环境：

```bash
uv run python scripts/link_iqtree_to_venv.py
```

这会在 macOS/Linux 写入：

```text
.venv/bin/iqtree3
```

Windows 会写入：

```text
.venv\Scripts\iqtree3.exe
```

Windows 上如果还没有安装 IQ-TREE，运行同一个脚本会自动从官方 GitHub Releases 下载最新 Windows zip，解压到：

```text
.venv\tools\iqtree\
```

然后把 `iqtree3.exe` 放进 `.venv\Scripts`。因此 Windows 初始化可以直接执行：

```powershell
uv sync
uv run python scripts\link_iqtree_to_venv.py
uv run api
```

若脚本不能创建符号链接，会退回复制 exe。

如果不想放进虚拟环境，也可以在 `.env` 写绝对路径：

```text
IQTREE_BINARY=/opt/homebrew/bin/iqtree3
IQTREE_BINARY="C:\Program Files\IQ-TREE\iqtree3.exe"
```

## 接口

```text
GET  /
GET  /api/tools
POST /api/jobs
GET  /api/jobs/{job_id}
```

## 后端结构

```text
backend/app/main.py
  只负责启动 HTTP 服务并挂载请求处理器

backend/app/api/
  API 路由和 HTTP 请求处理

backend/app/web/
  网页资源加载

backend/app/services/
  任务编排和文件写入等业务服务

backend/app/tools/
  具体生物信息工具模块

frontend/
  dist/            React 构建产物，后端优先服务
  react/           React + Vite + TypeScript 源码
  index.html       旧静态页面，作为回退
```

## 测试

```bash
uv run python -m unittest discover backend/app/tests
```

## Windows exe / 安装包构建

建议在 Windows 环境构建和测试 exe：

```powershell
.\scripts\build_windows_exe.ps1
```

生成目录：

```text
dist\BioToolBackend\BioToolBackend.exe
```

运行 exe 后终端会显示本地访问地址，例如：

```text
http://127.0.0.1:8000
```

如果需要生成安装包，先安装 Inno Setup，然后运行：

```powershell
.\scripts\build_windows_exe.ps1 -Installer
```

安装包输出：

```text
dist\installer\BioToolBackendSetup.exe
```

## 命令行示例

不启动网页，直接通过 `JobService` 调用工具：

```bash
uv run python backend/app/examples/run_tools.py
```

## 新增工具模块

新增模块放在：

```text
backend/app/tools/{module_name}/
```

建议包含：

```text
__init__.py
manifest.py
schemas.py
runner.py
parser.py
```

然后在：

```text
backend/app/tools/registry.py
```

注册新的 Runner。

公共文件写入请用：

```text
backend/app/services/file_service.py
```

公共配置请用：

```text
backend/app/core/config.py
```

## PyMOL 后端控制

`pymol_control` 用于把 PyMOL 作为后端渲染/分析引擎接入。本项目不会把 PyMOL GUI 直接嵌入网页，而是让前端操作面板提交白名单操作，后端生成安全 `.pml` 脚本并调用 PyMOL 输出图片、脚本和日志。

运行前需要安装 PyMOL，并确保命令行能找到 `pymol`，或显式指定：

```bash
export PYMOL_BIN=/path/to/pymol
uv run api
```

请求示例：

```json
{
  "tool_name": "pymol_control",
  "payload": {
    "structure_text": "ATOM ...",
    "structure_file_name": "receptor.pdb",
    "operation": "render_basic",
    "style": "cartoon",
    "background": "white"
  }
}
```

当前支持的白名单操作：

```text
render_basic
highlight_ligand_pocket
color_chains
```

## GenBank 零件解析

`sequence_parts_parse` 用于将 GenBank 文本解析成前端可展示的零件数组，并自动补全未注释区间为 `linker`。

请求示例：

```json
{
  "tool_name": "sequence_parts_parse",
  "payload": {
    "file_text": "LOCUS ...",
    "format": "genbank"
  }
}
```

输出核心结构：

```json
{
  "record_id": "DEMO0001.1",
  "topology": "circular",
  "sequence_length": 60,
  "parts": [
    {
      "id": "part_0001",
      "type": "promoter",
      "label": "P_demo",
      "start": 0,
      "end": 10,
      "length": 10
    },
    {
      "id": "part_0002",
      "type": "linker",
      "label": "Linker 11-20",
      "start": 10,
      "end": 20,
      "length": 10
    }
  ]
}
```

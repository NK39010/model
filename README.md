# Documents how to run and extend the modular bioinformatics backend.

# Bio Tool Backend

这是一个最小模块化生物信息后端示例。当前已经包含：

```text
reference_similarity_table
pairwise_similarity_matrix
ncbi_refseq_lookup
sequence_parts_parse
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
PYTHONPATH=backend .venv/bin/python backend/app/main.py
```

如果端口 `8000` 被占用，服务会自动尝试后续端口。也可以手动指定：

```bash
PYTHONPATH=backend .venv/bin/python backend/app/main.py 8010
```

打开终端打印的地址：

```text
http://127.0.0.1:8000
```

网页文件位于：

```text
frontend/index.html
```

后端 `GET /` 会读取并返回这个文件。

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
  静态网页
```

## 测试

```bash
PYTHONPATH=backend .venv/bin/python -m unittest discover backend/app/tests
```

## 命令行示例

不启动网页，直接通过 `JobService` 调用工具：

```bash
PYTHONPATH=backend .venv/bin/python backend/app/examples/run_tools.py
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

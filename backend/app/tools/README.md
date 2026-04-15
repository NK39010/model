# Documents the contract for adding new backend tool modules.

每个新工具模块建议放在：

```text
backend/app/tools/{module_name}/
  __init__.py
  manifest.py
  schemas.py
  runner.py
  parser.py
```

最低要求：

```text
1. 在 schemas.py 里定义输入解析和校验
2. 在 runner.py 里实现继承 ToolRunner 的 Runner
3. 在 manifest.py 里写清工具元信息
4. 在 backend/app/tools/registry.py 注册 Runner
5. 在 backend/app/tests/ 里加 mock 测试
```

Runner 必须实现：

```python
validate_input(payload)
run(payload, workdir)
parse_result(workdir)
```

模块内不要直接写 API 路由、不要直接管理 job_id、不要写入 `workdir` 外部目录。结果文件建议至少包含：

```text
input.json
job.json
result.json
```

额外结果可以按工具类型写入：

```text
*.csv
*.txt
*.gb
*.fasta
```

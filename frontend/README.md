# Frontend

当前使用 React + Vite + TypeScript 前端：

```text
frontend/react/
```

构建后输出：

```text
frontend/dist/
```

后端在 `GET /` 时会优先读取 `frontend/dist/index.html`，如果 dist 不存在，则回退到旧静态页面：

```text
frontend/index.html
```

常用命令：

```bash
cd frontend
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run build
pnpm run preview
```

开发服务器默认由 Vite 提供；生产运行时由后端直接服务 `frontend/dist/`。

前端调用的后端 API：

```text
GET  /api/tools
POST /api/jobs
GET  /api/jobs/{job_id}
GET  /api/jobs/{job_id}/files/{file_name}
```

模块边界要求见项目根目录 `AGENTS.md`。MAFFT 和 MSA_quality 必须保持独立模块，工作流衔接只能通过 App 编排或共享 API/util 完成。

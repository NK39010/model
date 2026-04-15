# Documents the lightweight frontend served by the backend entry point.

当前前端是一个无构建步骤的静态页面：

```text
frontend/index.html
```

后端入口：

```text
backend/app/main.py
```

会在 `GET /` 时读取并返回这个文件。

以后如果需要继续拆分，可以演进为：

```text
frontend/
  index.html
  styles.css
  app.js
```

或者替换成 React / Vue / Next.js 等独立前端工程。只要继续调用这些 API 即可：

```text
GET  /api/tools
POST /api/jobs
GET  /api/jobs/{job_id}
```

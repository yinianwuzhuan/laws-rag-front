# Laws Agent · 法律智能咨询前端

法律智能咨询系统的 Vue 3 前端。提供多轮法律咨询、批量文档上传、自由检索，以及检索和生成评测的可视化工作台。

> **在线体验：** [https://laws-agent.ccwu.cc](https://laws-agent.ccwu.cc)  
> **前端仓库：** [laws-rag-front](https://github.com/yinianwuzhuan/laws-rag-front)（本仓库）  
> **后端仓库：** [laws-rag-backend](https://github.com/yinianwuzhuan/laws-rag-backend)

本项目与后端保持**两个独立 Git 仓库**，不要求合并代码。前端负责交互与结果展示；后端负责法律文档解析、Qdrant 混合检索、Agent 问答及评测计算。浏览器统一请求同源 `/api`，开发环境由 Vite 转发，Docker 部署时由 Nginx 转发。

## 页面与能力

| 页面 | 路径 | 功能 |
| --- | --- | --- |
| 法律咨询 | `/chat` | 多轮会话、流式回答，以及问题规划、检索、补查等过程展示 |
| 文件上传 | `/upload` | Markdown 文件预览、批量选择与拖拽上传，展示逐文件入库结果 |
| 自由检索测评 | `/query` | 自定义问题；切换 Dense/BM25/Hybrid、问题重写与 Reranker，查看各路候选和排名变化 |
| RAG 检索评测 | `/evaluation` | 选择黄金评测集与 Dev/Test 范围，查看逐题结果、汇总指标和下载报告 |
| RAG 生成评测 | `/generation-evaluation` | 比较黄金上下文与真实检索上下文的生成质量，查看 Judge 评分和报告 |

这些页面依赖后端 API 和对应的法律语料。刚启动一个空 Qdrant 时，咨询和检索不会自动获得示例法条；语料导入方式请参阅[后端 README](https://github.com/yinianwuzhuan/laws-rag-backend#导入法律语料)。

## 法律知识库来源

前端不内置法律文档，展示内容来自后端已导入的知识库。基础法律语料参考 [ImCa0/just-laws](https://github.com/ImCa0/just-laws) 整理的 Markdown 法律文档及其法条结构；更多法律文件由项目作者从[国家法律法规数据库](https://flk.npc.gov.cn/search)检索、下载 DOCX，在仓库之外转换和清洗为带官方来源、文档类型、公布与施行日期、效力状态等元数据的 Markdown，再通过后端解析、去重并写入 Qdrant。这部分扩展语料包括行政法规、监察法规、司法解释、法律解释及有关决定等，实际覆盖以导入的数据为准。

两个仓库都不随代码提供完整语料或 Qdrant 数据；DOCX 采集与 Markdown 转换也不是前端功能。具体处理链、导入方法和来源说明见[后端 README 的“法律语料来源与处理”](https://github.com/yinianwuzhuan/laws-rag-backend#法律语料来源与处理)。感谢 Just Laws 原项目；复用其内容时请遵守[原项目 MIT 许可](https://github.com/ImCa0/just-laws/blob/master/LICENSE)。国家法律法规数据库是文档来源，不代表其对本项目的背书；使用时请核查官方现行文本。

## 技术栈

- Vue 3、Vite 5、Vue Router
- Element Plus、Axios、Sass
- Markdown 渲染与 SSE 流式事件处理
- Docker 多阶段构建、Nginx 同源反向代理

```text
浏览器 ── /api ──► Vite 开发代理 / 生产 Nginx ──► Spring Boot 后端
   │                                            │
   └── 页面状态、流式展示、评测图表与报告下载       └── 检索、模型、Agent、Qdrant
```

## 本地启动

建议使用 Node.js 20 和 npm。先启动[后端项目](https://github.com/yinianwuzhuan/laws-rag-backend)及其 Qdrant，再在本仓库执行：

```bash
npm ci
npm run dev
```

打开 `http://localhost:3000`。[`vite.config.js`](vite.config.js) 将 `/api` 请求代理到 `http://localhost:8081`；如果后端运行在其他地址，请修改该代理目标。前端开发环境不需要在浏览器中配置任何 AI 密钥。

检查构建结果：

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`，不应提交至 Git。

## Docker 与接口代理

本仓库的 [`Dockerfile`](Dockerfile) 使用 Node 构建静态资源，并在运行阶段由 Nginx 提供页面与 `/api/` 反向代理。[`nginx.conf`](nginx.conf) 是运行时模板，需要传入：

| 环境变量 | 用途 | 示例 |
| --- | --- | --- |
| `PORT` | 容器内 Nginx 监听端口 | `80` |
| `BACKEND_URL` | **容器能访问到的**后端根地址，不带末尾斜杠 | `http://backend:8081` |

如果前后端服务位于同一个 Docker Compose 网络，前端可使用 `BACKEND_URL=http://backend:8081`（其中 `backend` 是实际服务名）。主机端口可映射为 `8080:80`：左边是宿主机端口，右边是容器端口。若分属不同 Compose 项目，应先配置共享网络或使用容器可达的后端地址；容器中的 `localhost` 不代表宿主机或另一个容器。

浏览器始终请求同源 `/api`，因此 `BACKEND_URL` 由 Nginx 使用，不是暴露给浏览器的 AI 密钥配置。SSE 路径关闭了代理缓冲，以便展示流式咨询过程。

## 自动部署

[GitHub Actions 工作流](.github/workflows/deploy.yml) 在推送 `master` 后构建前端镜像，推送到 GHCR，并通过 SSH 登录服务器执行 `docker compose pull frontend` 和 `docker compose up -d --no-deps frontend`。后端由[另一个仓库的独立工作流](https://github.com/yinianwuzhuan/laws-rag-backend/blob/master/.github/workflows/deploy.yml)部署，两个服务可以分别发布。

自动部署需要自行在 GitHub 仓库 Secrets 中配置 `SERVER_HOST`、`SERVER_PORT`、`SERVER_USER`、`SERVER_SSH_KEY` 和 `DEPLOY_PATH`，并在服务器准备 Compose 文件、镜像拉取权限及运行时的 `PORT`、`BACKEND_URL`。这些实际值不要写进 README 或源码。

## 使用与安全说明

- 在线回答用于法律信息参考，不替代律师针对具体事实提供的正式意见；重要时效、地方标准和效力状态应进一步核实。
- 前端不应保存 OpenRouter、通义、Judge 或服务器 SSH 凭据；调用外部 AI 与法律数据服务应在后端完成。
- 文件上传和大规模评测可能产生成本。面向公网开放前，应在后端增加身份验证、限流与配额控制。
- 仓库中的 `.env.example` 仅为配置示例，不包含真实密钥。不要将 `.env`、构建产物或用户数据提交到 Git。
- 如计划允许第三方复制、修改或再分发代码，请另行添加明确的 `LICENSE` 文件。

## 相关项目

- [laws-rag-backend：法律数据、混合检索、Agent 与评测 API](https://github.com/yinianwuzhuan/laws-rag-backend)
- [在线体验：laws-agent.ccwu.cc](https://laws-agent.ccwu.cc)

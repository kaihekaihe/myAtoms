# AtomLab · 智能体驱动的应用生成工作台

> 用一句话描述需求，AtomLab 通过三阶段智能体流水线现场生成一个可真实使用的管理应用——
> 看板（可拖拽）/ 表格 / 卡片视图、统计卡片、数据增删改查、版本历史与恢复、免登录分享、CSV 导出。

本项目为 ROOT/Atoms「AI Native 研发」笔试交付。设计与取舍详见 [说明文档.md](./说明文档.md)。

## ✨ 功能一览

| 能力 | 说明 |
| --- | --- |
| 三智能体生成流水线 | 需求分析师 → 应用架构师 → 蓝图质检员，每阶段一次真实 LLM 调用，步骤实时落库、界面回放 |
| AppBlueprint 结构化规格 | 6 种字段类型 × 3 种视图（看板支持拖拽换列）× 统计卡片（count/sum/avg/ratio） |
| 真实交互与持久化 | 记录存 SQLite（WAL），服务端校验（必填/枚举/数值），重启数据不丢 |
| 注册/登录 | scrypt 密码哈希 + httpOnly Cookie 会话（7 天），数据按账号隔离 |
| 版本历史与恢复 | 每次生成产出蓝图版本快照，一键恢复（恢复 = 新版本，不动业务数据） |
| 免登录分享 | 发布生成只读分享链接，任何人打开即可查看当前数据 |
| CSV 导出 | 一键导出全部记录（带 BOM，Excel 直接打开不乱码） |
| 降级规则引擎 | 未配置 LLM Key 或 LLM 不可用时自动降级为内置模板引擎，界面明确标注 |

## 🚀 快速开始

环境要求：Node.js ≥ 18（本机验证于 Node 22）。

```bash
git clone git@github.com:kaihekaihe/myAtoms.git atomlab && cd atomlab
npm install
cp .env.example .env    # 填入 LLM Key（可跳过：不填则降级规则引擎）
npm run dev             # 打开 http://localhost:3000
```

生产方式：`npm run build && npm start`。

### LLM 配置（OpenAI 兼容接口均可）

| 供应商 | LLM_BASE_URL | LLM_MODEL | 备注 |
| --- | --- | --- | --- |
| 智谱（推荐·免费） | `https://open.bigmodel.cn/api/paas/v4` | `glm-5.3-flash` | 免费并发额度，bigmodel.cn 注册即得 Key；强制思考但正文自动分离，无需额外参数 |
| Gemini（免费层） | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` | 海外 |
| Groq（免费层） | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | 海外，速度快 |

任意 OpenAI 兼容端点均可（自建推理服务等），直接填对应 `LLM_BASE_URL` / `LLM_MODEL`；
供应商特有的请求参数可用 `LLM_EXTRA_BODY`（JSON）注入，见 `.env.example`。

## 📦 部署

三条路径均可。注意：生成任务在进程内异步执行、SQLite 需要持久磁盘，
因此**必须使用持久化运行时**（Docker / Railway / VPS），不适用 Vercel 类 serverless。

### 1. Docker（推荐）

```bash
docker compose up -d --build
# 打开 http://<host>:3000
# LLM 等变量写在同目录 .env（变量名与 docker-compose.yml 一致）
# 备份：docker cp atomlab:/data/atomlab.db ./backup-$(date +%F).db
```

### 2. Atoms 平台（上传 → 构建 → 发布）

在 Atoms 中选择 Upload Folder 上传本目录（排除 `node_modules` / `.next` / `data`），
在平台环境配置中填入 LLM 变量，构建并发布。

### 3. 任意持久 Node 运行时（Railway / 云主机）

```bash
npm ci
npm run build
DB_PATH=/data/atomlab.db LLM_API_KEY=*** LLM_BASE_URL=... LLM_MODEL=... npm run start
```

## 🗂 目录结构

```
src/
├── app/
│   ├── page.tsx                     # 入口：按登录态重定向
│   ├── login/ register/             # 注册登录
│   ├── studio/                      # 工作台（项目列表 + 三栏布局）
│   ├── share/[token]/               # 免登录只读分享页（SSR 渲染真实数据）
│   └── api/                         # 14 条 REST 路由（见下）
├── components/
│   ├── Studio.tsx                   # 工作台编排：轮询任务、派生对话、CRUD
│   ├── AppCanvas.tsx                # 蓝图运行时渲染器（table/kanban/cards/stats/表单）
│   ├── TracePanel.tsx               # 生成轨迹回放（三阶段步骤 + 耗时 + 备注）
│   ├── ChatPanel.tsx VersionsPanel.tsx Sidebar.tsx fields.tsx
└── lib/
    ├── db.ts                        # better-sqlite3 单例 + 7 表 schema（WAL）
    ├── blueprint.ts                 # AppBlueprint 类型 / 归一化 / 校验 / diff / CSV / 统计
    ├── llm.ts                       # OpenAI 兼容客户端（JSON 容错提取 / 自动重试 / 降级钩子）
    ├── auth.ts                      # scrypt + Cookie 会话
    ├── agents/pipeline.ts           # 三智能体流水线（核心）
    ├── agents/local.ts              # 降级规则引擎（5 套模板 + 增量补丁）
    └── api.ts shared-types.ts       # 路由工具 / 前后端共享类型
```

## 🔌 API 一览

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/register` `/api/auth/login` `/api/auth/logout` `/api/auth/me` | POST/GET | 账号体系 |
| `/api/projects` | GET/POST | 项目列表 / 新建 |
| `/api/projects/[id]` | GET/PATCH/DELETE | 项目详情（含蓝图+记录+版本）/ 改名 / 删除 |
| `/api/projects/[id]/generate` | POST | 触发生成（fire-and-forget，立即返回 runId） |
| `/api/runs/[runId]` | GET | 查询任务状态与步骤轨迹（前端 1.2s 轮询） |
| `/api/projects/[id]/records` | GET/POST | 记录列表 / 新增（服务端校验） |
| `/api/projects/[id]/records/[rid]` | PATCH/DELETE | 更新（看板拖拽 = 改分组字段）/ 删除 |
| `/api/projects/[id]/versions` | GET | 版本列表 |
| `/api/projects/[id]/versions/[vid]/restore` | POST | 恢复（创建新版本，不动数据） |
| `/api/projects/[id]/publish` | POST | 发布/获取分享 token |
| `/api/projects/[id]/export` | GET | CSV 导出 |
| `/api/share/[token]` | GET | 免登录分享数据（对应 `/share/[token]` 页面） |
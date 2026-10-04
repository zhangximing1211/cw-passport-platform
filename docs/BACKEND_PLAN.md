# 后端开发方案

> 现状：前端是纯 SPA（`app/CwPlatform.tsx`），所有业务数据是写死的常量，登录走 `localStorage`，无任何后端。
> 目标：在**不更换部署平台**的前提下，给现有 Cloudflare Workers 加上 API、数据库和文件存储，逐步替换前端的演示数据。

## 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 运行时 | Cloudflare Workers | 已有部署链路（`wrangler deploy`），静态资源和 API 同一个 Worker、同源，无 CORS |
| Web 框架 | Hono | 专为 Workers 设计，轻量，路由/中间件/校验齐全 |
| 数据库 | Cloudflare D1（SQLite） | 本地 `wrangler dev` 自带模拟，不需要 Docker |
| ORM / 迁移 | Drizzle ORM + drizzle-kit | 类型安全，迁移文件可提交 Git |
| 校验 | Zod（`@hono/zod-validator`） | 请求体/查询参数校验，类型可与前端共享 |
| 文件存储 | Cloudflare R2 | 合规文件、材料照片 |
| 测试 | Vitest + `@cloudflare/vitest-pool-workers` | 在真实 Workers 运行时里跑测试 |
| AI 撮合（后期） | Workers AI（Embedding）+ Vectorize | 取代前端 `buildMatches` 中的「RAG」伪实现 |

目标目录结构：

```text
worker/
├── index.ts            # Hono app 入口，挂载 /api/*，其余交给静态资源
├── db/schema.ts        # Drizzle 表定义
├── routes/             # auth.ts, passports.ts, transfers.ts, listings.ts, matches.ts, stats.ts
├── services/           # 业务逻辑（ID 生成、状态机、撮合评分等）
├── middleware/         # auth、错误处理、审计日志
└── lib/                # 密码哈希、分页、CSV 等工具
migrations/             # drizzle-kit 生成的 SQL
shared/                 # 前后端共享的 Zod schema / 类型
```

## 核心数据模型

```text
organizations ─┬─ users ── sessions
               │
passports ─────┼─ passport_events        (生命周期时间线：Generated → Collected → Sorted → Processed → Cross-border → Reuse)
   │           │
   ├── transfers ── transfer_events       (Created → Docs Submitted → Inspection → Compliance → Cleared → Transport → Received)
   │       └── documents (R2)
   │
   └── listings ── listing_photos (R2)
           │
demands ── company_profiles
   │
matches (listing × demand, score, reasons)
trades  (listing, demand, buyer, seller, price, status, tx_hash)
audit_logs
```

设计要点：
- **数量拆成数值 + 单位**（`quantity_value REAL`, `quantity_unit TEXT`），不要沿用前端的 `"320 t"` 字符串，否则无法做筛选、汇总和撮合计算。
- **时间统一存 ISO 8601 / UTC**，展示格式交给前端。
- **业务编号**（`DPP-HK-2026-00428`、`CBT-HK-SZ-2026-0128`、`LST-…`）由后端按「前缀-地区-年份-序号」生成，用一张 `id_sequences` 表保证不重复。
- 状态字段用枚举 + 状态机校验，不允许任意跳转。

## 分阶段计划

### 阶段 0：后端脚手架（约 1 周）— 本地已完成，待创建线上 D1

已完成（2026-09-27）：Hono + D1 + Drizzle 脚手架、`passports` 表及迁移、演示数据种子、`GET /api/health`、`GET /api/passports`（筛选、搜索、排序、分页）、`GET /api/passports/:id`、Vitest（10 个用例）、Vite 代理。前端的登记册、快速预览抽屉、总览「最近护照」和 CSV 导出已改为读取 API；API 不可用时回退到演示数据。

尚未完成：在 Cloudflare 创建线上 D1，并把 `database_id` 填进 `wrangler.jsonc`，然后执行 `wrangler d1 migrations apply cw-passport-db --remote`。原计划种子数据包含 transfers、listings 等，这部分移到各自的阶段一并处理。

原始任务清单：
- 安装 `hono`、`drizzle-orm`、`drizzle-kit`、`zod`、`@hono/zod-validator`、`vitest`、`@cloudflare/vitest-pool-workers`。
- `wrangler.jsonc` 增加 `"main": "worker/index.ts"`、D1 绑定，并设置 `assets.run_worker_first: ["/api/*"]`，只让 API 请求进 Worker。
- `vite.config.ts` 增加 `server.proxy: { "/api": "http://localhost:8787" }`，本地前端 + `wrangler dev` 联调。
- 统一错误响应格式 `{ error: { code, message } }`，统一分页格式 `{ items, total, page, pageSize }`。
- 编写种子脚本：把 `CwPlatform.tsx` 里的 PASSPORTS / TRANSFERS / LISTINGS / DEMANDS / COMPANY_KB / TRADES 导入 D1。
- `GET /api/health` + 第一个测试跑通。

**验收**：`npm run dev` 能通过 `/api/health` 访问后端；`wrangler d1 migrations apply --local` 可重复执行；测试通过。

### 进度（2026-09-28，本地）

除 agent 外，平台业务功能已全部完成并在本地验证：

- **后端**：账户（注册、登录、限流、停用、个人资料、修改密码、找回密码）；监管身份由管理员授予；护照、转运、刊登、需求、公司档案、交易的查询和全部写操作，包括修改、删除、取消、下架；文件（R2）；站内通知；审计日志查询；统计；CSV 导出。
- **业务规则**：交易售罄 → 刊登下架、护照完成；转运接收 → 护照完成；护照完成 → 刊登不能再售。部分成交暂不处理。
- **前端**：所有页面读取真实数据，筛选和分页生效；所有操作都有界面；中英文双语；URL 带记录编号。
- **测试**：84 个后端测试；`npm run test:e2e` 浏览器端到端走查，共 20 步全部通过。

仍需在上线时处理（不属于代码功能缺失）：

- 在 Cloudflare 创建线上 D1 和 R2，执行迁移，部署；绑定自定义域名。
- 接入真实邮件服务（`worker/services/mailer.ts`）和真实区块链（`worker/services/chain.ts`）。
- 部分成交、撮合 agent：按计划后续进行。

### 阶段 1：认证与机构账户（约 1–1.5 周）
- 表：`organizations`、`users`、`sessions`、`password_reset_tokens`。
- 密码哈希：WebCrypto PBKDF2（Workers 原生支持，无需 bcrypt 原生模块）。
- 会话：HttpOnly + Secure + SameSite=Lax Cookie，服务器端 session 表。
- 接口：`POST /api/auth/register`、`/login`、`/logout`、`GET /api/auth/me`、`POST /api/auth/forgot`、`/reset`。
- 角色（对应注册页的 User type）：Generator / Transporter / Processor / Regulator / Admin，写一个 `requireRole()` 中间件。
- 前端：`AuthScreen` 改为调用 API，删除 `localStorage` 存密码的逻辑；侧边栏的「Alex Leung」改为 `/me` 返回的用户。

**验收**：刷新页面仍保持登录；错误密码有速率限制；数据库里没有明文密码。

### 阶段 2：数码护照核心（约 1.5–2 周）
- 表：`passports`、`passport_events`。
- 接口：
  - `GET /api/passports`：服务器端筛选（category / project / status / location）、关键字搜索、排序、分页。前端工具栏里现在不起作用的下拉框都要能用上。
  - `GET /api/passports/:id`：详情，包括生命周期时间线和关联的 transfer / listing。
  - `POST /api/passports`：对应「Register Passport」弹窗，由后端生成 ID。
  - `POST /api/passports/:id/events`：记录生命周期事件，同时更新 `stage`。
  - `GET /api/passports/export.csv`：导出改由服务器生成。
- 审计日志：所有写操作记录 who / what / when。

**验收**：Registry、Passport Detail、Quick Preview 抽屉全部读真实数据；新登记的护照刷新后仍在。

### 阶段 3：跨境转运与合规文件（约 1.5 周）
- 表：`transfers`、`transfer_events`、`documents`。
- 状态机：Preparing → In Transit → Completed，合规状态 Pending Review → Verified → Cleared。
- R2 上传：`POST /api/transfers/:id/documents`（限制文件类型和大小），`GET` 时返回短期签名链接或经 Worker 代理下载。
- 转运状态变化时自动给对应护照写入 `Cross-border` 生命周期事件。

**验收**：Cross-border 列表与详情页（现在写死 CBT-HK-SZ-2026-0128）改为按 ID 读取；文件可上传、下载。

### 阶段 4：资源市场：刊登、需求与公司档案（约 1.5 周）
- 表：`listings`、`listing_photos`、`demands`、`company_profiles`。
- 接口：刊登 CRUD + 照片上传；买方需求 CRUD；公司档案。
- 刊登必须关联一本已验证的护照（业务规则在后端校验）。

**验收**：Seller Listings 的网格/表格和筛选都读真实数据；Listing Detail 按 ID 加载（现在固定为 `LISTINGS[0]`）。

### 阶段 5：AI 撮合与交易（约 2 周）
- 先把前端的 `buildMatches()` 评分规则（品类 +40、地区 +25、数量 +20、评级 ×3）原样移到 `services/matching.ts`，并写单元测试锁定行为。
- 新刊登或新需求产生时重新计算撮合，结果写入 `matches` 表。
- `trades` 表 + 接口：由某条 match 发起交易 → In Progress → Completed → Settled。
- 进阶：用 Workers AI 生成公司需求描述的 embedding 存入 Vectorize，把原来的字符串拼接「RAG」换成真实的语义检索。

**验收**：Match & Trades 页的 KPI、需求汇总、撮合列表、交易表全部来自 API。

### 阶段 6：总览统计与告警（约 1 周）
- `GET /api/stats/overview`：KPI、材料流动各阶段计数与吨数、品类分布、同比变化（配合顶部的日期范围下拉框）。
- `GET /api/alerts`：来源数据不完整的护照、待审的跨境文件、即将过期的认证、待验证的刊登。前端 Overview 里这 4 类目前是写死的。

### 阶段 7：NFT / 上链（可选，约 2 周）
- 先定义 `ChainService` 接口，并实现一个 **Mock**，返回模拟的 tx hash，使「Mint → List」流程先在后端跑通。
- 再接测试网（例如用 viem 调用 Polygon Amoy 上的 ERC-721 合约），照片放 IPFS。私钥通过 `wrangler secret put` 管理。
- 需要先和项目方确认：是否真的要上链？上哪条链？谁支付 gas？

### 阶段 8：生产化（持续进行）
- 速率限制、输入长度限制、安全响应头。
- GitHub Actions：lint + test + 迁移检查，合并到 main 后自动部署。
- D1 Time Travel 备份策略、R2 生命周期规则。
- 绑定自定义域名（**`*.workers.dev` 在中国大陆通常无法访问**，面向内地用户必须用自定义域名）。
- 日志与监控：Workers Logs / Tail。

## 前端对接方式

后端每完成一个阶段，就把对应视图的常量替换为 API 调用：
1. 新增 `src/api/client.ts`，统一封装 `fetch`（带 cookie，统一错误处理）。
2. 类型从 `shared/` 引用，前后端共用同一份 Zod schema。
3. `CwPlatform.tsx` 目前有 600+ 行，建议对接时顺便按视图拆分到 `app/views/`。

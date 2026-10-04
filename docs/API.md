# CW Passport API 参考

后端是一个运行在 Cloudflare Workers 上的 Hono 应用，入口为 [worker/index.ts](../worker/index.ts)，所有路由都在 [worker/routes/](../worker/routes/)。请求与响应的 TypeScript 类型定义在 [shared/api.ts](../shared/api.ts)，前后端共用。

- **本地地址**：`http://localhost:3000/api`（经 Vite 代理），或直接访问 `http://localhost:8787/api`
- **手动调用**：用 VS Code 的 REST Client 扩展打开 [docs/api.http](api.http)
- **自动化测试**：[worker/test/](../worker/test/)，运行 `npm run test:api`

## 通用约定

| 项目 | 说明 |
| --- | --- |
| 认证 | 登录后服务器写入 HttpOnly Cookie `cw_session`（7 天）。除 `/api/health` 和 `/api/auth/*`（`/me`、`/password` 除外）外，所有接口都要求登录，未登录返回 `401 UNAUTHENTICATED` |
| 写请求 | `POST` / `PATCH` / `PUT` / `DELETE` 必须带 `Content-Type: application/json`；文件上传用 `multipart/form-data`，并带 `X-Requested-With` 请求头。否则返回 `415 JSON_REQUIRED`（CSRF 防护） |
| 错误格式 | `{"error": {"code": "PASSPORT_NOT_FOUND", "message": "...", "details": ...}}` |
| 分页 | 列表参数 `page`（默认 1）、`pageSize`（默认 20，最大 100）；返回 `{"items": [...], "total", "page", "pageSize"}` |
| 数量 | `{"value": 320, "unit": "t"}` |
| 时间 | 时间戳为 ISO 8601 UTC（如 `2026-09-16T02:42:00.000Z`），日期为 `YYYY-MM-DD` |
| 权限字段 | 详情接口返回 `viewer: {"canManage", "canRegulate"}`，交易返回 `viewer: {"isBuyer", "isSeller"}`，前端据此决定显示哪些按钮 |
| 导出 | 列表接口多数有对应的 `/export.csv`，接受相同的筛选参数，最多 10,000 行，UTF-8 带 BOM |

### 角色与权限

| 角色 | 如何获得 | 能做什么 |
| --- | --- | --- |
| `member` 成员 | 注册即得 | 管理自己创建的记录，以及记录上机构与自己机构相同的记录 |
| `regulator` 监管机构 | 管理员授予（注册时选 Regulatory Agency 只是申请） | 成员的权限 + 验证护照、记录检验 / 合规审核 / 放行、查看全部审计日志和所有合规文件 |
| `admin` 管理员 | 种子数据中的 `demo` | 全部操作 + 用户管理 |

---

## 1. 健康检查与账户 `/api/health`、`/api/auth`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 公开 | 服务与数据库状态 `{"status":"ok","db":"ok"}` |
| POST | `/auth/register` | 公开 | 注册。body：`username`（3–32，字母数字 . _ -）、`email`、`password`（≥8）、`company`、`userType`、`contact?`、`phone?`。返回 `{user, regulatorRequested}`。选 `Regulatory Agency` 时通知管理员审核 |
| POST | `/auth/login` | 公开 | body：`username`（账户名或邮箱）、`password`。成功写入 Cookie |
| POST | `/auth/logout` | 公开 | 作废当前会话 |
| POST | `/auth/forgot` | 公开 | body：`identifier`。无论账户是否存在都返回同一句话；存在时生成 30 分钟有效的重设链接（开发模式下打印在 `npm run dev` 终端的 `[mail]` 日志中） |
| POST | `/auth/reset` | 公开 | body：`token`、`password`。重设成功后该用户所有会话失效 |
| GET | `/auth/me` | 登录 | 当前用户 |
| PATCH | `/auth/me` | 登录 | 修改 `email?`、`contact?`、`phone?` |
| POST | `/auth/password` | 登录 | body：`currentPassword`、`newPassword`。其他设备自动登出 |

登录限流：同一账户 15 分钟内失败 5 次、或同一 IP 失败 20 次后，返回 `429 TOO_MANY_ATTEMPTS`（带 `Retry-After`）。停用的账户返回 `403 ACCOUNT_DISABLED`。

## 2. 数码护照 `/api/passports`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/passports` | 登录 | 列表。筛选：`q`（全文）、`category`、`status`、`stage`、`origin`、`project`；排序 `sort`=`id_desc`（默认）/`id_asc`/`updated_desc`；分页 |
| GET | `/passports/facets` | 登录 | 筛选下拉框的可选值 `{projects, origins, locations}` |
| GET | `/passports/export.csv` | 登录 | 按同样筛选导出 CSV |
| POST | `/passports` | 登录 | 登记护照。body：`material`、`category`（Concrete/Metal/Timber/Glass/Mixed Waste）、`project`、`quantity`、`location`、`origin`（Hong Kong/Macau）、`stage`（Generated/Collected/Sorted/Processing）。ID 由服务器生成（`DPP-HK-2026-00462`），状态 Pending |
| GET | `/passports/:id` | 登录 | 详情，含 `viewer` |
| PATCH | `/passports/:id` | 创建者 / 管理员 | 修改 `material`、`category`、`project`、`quantity`、`location`。仅 Pending 状态可改；验证后只有管理员可改；已完成不可改 |
| DELETE | `/passports/:id` | 创建者 / 管理员 | 仅 Pending 且没有转运和刊登时可删除 |
| GET | `/passports/:id/events` | 登录 | 生命周期事件，按时间排序 |
| POST | `/passports/:id/events` | 创建者 / 管理员 | 记录事件。body：`stage`（Collected/Sorted/Processing/Completed）、`place`、`actor?`、`occurredAt?`、`location?`。阶段只能前进，时间不能早于上一事件、不能是未来。记录 Completed 时护照完成，其刊登自动下架 |
| POST | `/passports/:id/verify` | 监管机构 | Pending/Processing → Verified，通知创建者 |
| GET / POST | `/passports/:id/documents` | 见第 6 节 | 列出 / 上传文件 |

## 3. 跨境转运 `/api/transfers`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/transfers` | 登录 | 列表（按出发日期倒序）。筛选：`q`、`status`、`compliance`、`origin`、`destination`、`passportId`、`queue=regulatory`（下一步需监管机构处理的转运）。每条含 `stepsCompleted` |
| GET | `/transfers/export.csv` | 登录 | 导出 |
| POST | `/transfers` | 护照创建者 / 管理员 | 创建。body：`passportId`、`destination`（Shenzhen/Dongguan/Zhuhai/Foshan/Guangzhou/Zhongshan）、`departureDate`（不早于今天）、`transportType`（Road Freight/River Barge/Sea Freight）、`quantityValue?`。前提：护照已验证、处于 Sorted/Processing、没有未完成的转运 |
| GET | `/transfers/:id` | 登录 | 详情，含 `events` 和 `viewer` |
| POST | `/transfers/:id/events` | 见下表 | 记录下一步。body：`step`、`note?`、`occurredAt?` |
| POST | `/transfers/:id/cancel` | 转运机构 / 管理员 | 仅 Preparing 状态可取消。body：`reason?` |
| GET / POST | `/transfers/:id/documents` | 见第 6 节 | 合规文件 |

七个步骤必须依次记录：

| # | 步骤 | 执行者 | 前提 / 联动 |
| --- | --- | --- | --- |
| 1 | Created | 创建时自动 | — |
| 2 | Documentation Submitted | 转运机构 | 至少已上传一份文件；通知所有监管机构 |
| 3 | Inspection | 监管机构 | — |
| 4 | Customs / Compliance Review | 监管机构 | 合规状态 → Verified |
| 5 | Cleared | 监管机构 | 合规状态 → Cleared；通知转运机构 |
| 6 | Transport | 转运机构 | 转运 → In Transit；护照 → Cross-border 阶段，位置更新为口岸 |
| 7 | Received | 转运机构 | 转运 → Completed；**护照 → Completed**，位置为目的地，刊登下架；通知转运机构 |

## 4. 资源刊登 `/api/listings`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/listings` | 登录 | 列表。筛选：`q`、`category`、`status`、`mintStatus`、`passportId`、`region`（Hong Kong/Macau）、`minQty`、`maxQty`、`availability`（now/upcoming）、`active=true`（隐藏已下架）。每条含 `available`（剩余可售量） |
| GET | `/listings/export.csv` | 登录 | 导出 |
| POST | `/listings` | 护照创建者 / 管理员 | 创建草稿。body：`passportId`、`category?`、`quantityValue?`、`location?`、`availableFrom?`。前提：护照已验证且未完成，且没有在售刊登。ID 与 NFT 编号共用序号（`LST-HK-2026-0237` / `NFT-CON-0237`） |
| GET | `/listings/:id` | 登录 | 详情，含 `viewer`、`available` |
| POST | `/listings/:id/mint` | 卖方 / 管理员 | draft → minted，生成交易哈希（目前为模拟链） |
| POST | `/listings/:id/publish` | 卖方 / 管理员 | minted → listed，买方可下单 |
| POST | `/listings/:id/delist` | 卖方 / 管理员 | 手动下架。进行中的交易仍可完成 |
| GET / POST | `/listings/:id/documents` | 见第 6 节 | 材料照片、规格 |

护照完成后，禁止铸造、上架、新建刊登和新交易（`409 PASSPORT_COMPLETED`）。

## 5. 市场：需求、公司档案、撮合、交易

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/demands` | 登录 | 买方需求。筛选：`q`、`category`、`region`、`mine=true` |
| GET | `/demands/export.csv` | 登录 | 导出 |
| POST | `/demands` | 登录 | 发布需求。body：`industry`、`region`、`category`、`quantity`、`deadline`、`contact`、`company?`（仅管理员可代其他公司发布）。公司没有档案时自动创建一份基本档案。ID 形如 `DMD-2026-0094` |
| GET | `/demands/:id` | 登录 | 详情 |
| PATCH | `/demands/:id` | 需求所属公司 / 管理员 | 修改 |
| DELETE | `/demands/:id` | 需求所属公司 / 管理员 | 已有交易的需求不可删（`409 DEMAND_IN_USE`） |
| GET | `/companies` | 登录 | 全部公司档案（撮合知识库） |
| GET | `/companies/:name` | 登录 | 单个公司档案 |
| PUT | `/companies/:name` | 本公司成员 / 管理员 | 创建或修改档案。body：`industry`、`region`、`needs`、`capacity`、`history`、`rating?`（仅管理员） |
| GET | `/matches` | 登录 | 撮合结果（在售刊登 × 全部需求，≥55 分，高分在前）。参数：`limit`、`demandId`、`listingId`。每条含 `suggestedQuantity` |
| GET | `/marketplace/summary` | 登录 | 撮合与交易页的汇总数字 |
| GET | `/trades` | 登录 | 交易列表。筛选：`status`、`listingId`、`mine=true` |
| GET | `/trades/export.csv` | 登录 | 导出 |
| POST | `/trades` | 需求所属公司（买方）/ 管理员 | 发起交易。body：`listingId`、`demandId`、`quantityValue`、`priceHkd`。刊登须已上架；数量不超过剩余可售量和需求量。通知卖方 |
| POST | `/trades/:id/complete` | 卖方 / 管理员 | In Progress → Completed，NFT 转给买方（模拟链）。**若刊登因此售罄：刊登下架、护照完成**，并通知卖方 |
| POST | `/trades/:id/settle` | 卖方 / 管理员 | Completed → Settled（确认收款） |
| POST | `/trades/:id/cancel` | 买方 / 卖方 / 管理员 | 仅 In Progress 可取消，释放占用的数量，通知对方 |

撮合评分规则见 [worker/services/matching.ts](../worker/services/matching.ts)：品类相同 +40（否则 +4）、同地区 +25（否则 +12）、数量合适 +20（否则 +6）、买方评级 × 3。

## 6. 文件 `/api/documents`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/{passports|transfers|listings}/:id/documents` | 见下 | 列出记录的文件 |
| POST | `/{passports|transfers|listings}/:id/documents` | 记录管理者；转运还允许监管机构 | multipart 字段：`file`、`kind`（Material Declaration / Transfer Document / Inspection Report / Receiving Certificate / Processing Record / Material Photo / Other）。PDF、PNG、JPEG、WebP，≤10 MB，按文件内容识别真实类型 |
| GET | `/documents/:id` | 见下 | 下载（浏览器内直接打开） |
| GET | `/documents/:id/meta` | 见下 | 文件信息 |
| DELETE | `/documents/:id` | 上传者 / 管理员 | 删除 |

查看权限：刊登的文件（照片、规格）所有登录用户可见；护照和转运的文件只有所属机构和监管机构可见。

## 7. 统计、通知、审计、管理

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/stats/overview?days=30` | 登录 | 总览页数据；`days` 为 30 / 90 / 365，决定趋势的对比窗口 |
| GET | `/stats/transfers` | 登录 | 转运列表页指标卡与路线图（`featured`） |
| GET | `/stats/materials` | 登录 | 按材料汇总的批次数、吨数、各阶段分布 |
| GET | `/notifications` | 登录 | 最近 50 条通知（发给本人、本公司或本人角色）及未读数 |
| POST | `/notifications/:id/read` | 登录 | 标为已读 |
| POST | `/notifications/read-all` | 登录 | 全部标为已读 |
| GET | `/audit` | 管理员 / 监管机构；其他人需指定 `entityType` + `entityId` | 审计日志。筛选：`entityType`、`entityId`、`userId`、`action` |
| GET | `/admin/users` | 管理员 | 用户列表。筛选：`q`、`role`、`pending=true`（等待监管身份的用户） |
| PATCH | `/admin/users/:id` | 管理员 | body：`role?`、`disabled?`。不能停用自己或移除自己的管理员身份，平台至少保留一位管理员；停用会立即登出该用户 |

## 常见错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | 参数缺失或格式错误，`details` 为逐项说明 |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | 未登录 / 账户或密码错误 |
| 403 | `FORBIDDEN` / `REGULATOR_REQUIRED` / `ACCOUNT_DISABLED` | 无权限 / 需要监管身份 / 账户已停用 |
| 404 | `*_NOT_FOUND` | 记录不存在 |
| 409 | `INVALID_STAGE_TRANSITION`、`INVALID_STEP_ORDER`、`DOCUMENTS_REQUIRED`、`PASSPORT_NOT_VERIFIED`、`PASSPORT_COMPLETED`、`TRANSFER_ALREADY_OPEN`、`LISTING_NOT_LISTED`、`INVALID_MINT_STATUS`、`INVALID_TRADE_STATUS` 等 | 业务规则不允许当前操作 |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE`、`JSON_REQUIRED` | 文件过大 / 文件类型不支持、写请求格式不对 |
| 422 | `QUANTITY_EXCEEDS_*` | 数量超过护照、剩余可售量或需求量 |
| 429 | `TOO_MANY_ATTEMPTS` | 登录失败次数过多 |

前端对这些错误码的中英文提示在 [app/ui.tsx](../app/ui.tsx) 的 `ERROR_TEXT` 中。

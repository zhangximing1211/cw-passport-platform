# CW Passport Platform

Construction Waste Digital Passport Platform / 建废数码护照平台。

这是一个面向建筑废弃物数字身份、材料流转追踪、跨境数据交换和 B2B 资源刊登的高保真 Web 平台。当前版本以 UI/UX 原型和演示数据为主，包含平台自身的登录页面、七个核心业务视图、CSV 导出和中英文切换。

## 当前线上环境

| 项目 | 当前状态 |
| --- | --- |
| 正式网址 | <https://construction-waste-passport.site> |
| Sites 备用网址 | <https://construction-waste-passport-2026.ximingzhang.chatgpt.site> |
| 访问模式 | Public，访客不需要经过 ChatGPT 登录 |
| 自定义域名 | Active |
| HTTPS / SSL | Active |
| 数据库 D1 | 未启用 |
| 文件存储 R2 | 未启用 |
| 后端业务 API | 未接入 |

演示账号：

```text
Username: demo
Password: demo1234
```

## 1. 技术架构

```text
Browser
   ↓
Cloudflare / OpenAI Sites
   ↓
Cloudflare Worker (worker/index.ts)
   ↓
Vinext App Router
   ↓
React UI (app/CwPlatform.tsx)
```

主要技术：

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| Node.js | `>=22.13.0` | 本地开发、构建和测试 |
| npm | 随 Node.js 安装 | 依赖管理，项目使用 `package-lock.json` |
| React | `19.2.6` | 前端界面 |
| React DOM | `19.2.6` | 浏览器渲染 |
| Vinext | `1.0.0-beta.2` | Next-compatible 应用运行与构建 |
| Vite | `8.0.13` | 开发服务器和构建系统 |
| TypeScript | `5.9.3` | 类型检查与应用代码 |
| Tailwind CSS | `4.2.1` | CSS 构建依赖；主要视觉样式位于 `app/globals.css` |
| Cloudflare Vite Plugin | `1.37.1` | Cloudflare Worker 本地环境和构建 |
| Wrangler | `4.92.0` | Cloudflare 开发运行依赖 |
| OpenAI Sites Vite Plugin | `0.1.0` | Sites 项目构建与托管集成 |
| Drizzle ORM | `0.45.2` | 预留的 D1 数据访问能力，当前未启用 |
| Drizzle Kit | `0.31.10` | 预留的数据库迁移工具 |

不需要 Python、Docker、Java 或独立 Web 服务器。

## 2. 运行环境要求

### 本地开发电脑

- macOS、Linux 或 Windows；当前项目已在 macOS 上验证。
- Node.js `22.13.0` 或更高版本。
- npm，建议使用随 Node.js 安装的版本。
- 首次安装依赖时需要互联网连接。
- 建议安装较新的 Git；本地查看不强制需要，但 Sites 发布流程需要版本提交。
- 推荐使用当前版本的 Chrome、Edge 或 Safari。

检查环境：

```bash
node --version
npm --version
git --version
```

Node.js 输出必须不低于：

```text
v22.13.0
```

### 线上运行环境

- Cloudflare-compatible Worker runtime。
- `nodejs_compat` 兼容标志。
- Sites 自动提供静态资源和图像处理能力。
- 当前不需要环境变量、D1 数据库或 R2 存储桶。
- `.openai/hosting.json` 保存 Sites 项目关联信息，不保存密码或 API Key。

## 3. 获取并进入项目

本机项目目录：

```text
/Users/zhangximing/Desktop/blockchain /cw-passport-platform
```

父目录 `blockchain ` 的末尾有一个空格，因此终端命令必须保留双引号：

```bash
cd "/Users/zhangximing/Desktop/blockchain /cw-passport-platform"
```

## 4. 安装依赖

项目已经包含 `package-lock.json`，建议使用可重复安装命令：

```bash
npm ci
```

区别：

- `npm ci`：严格按照锁定版本安装，适合首次运行、测试和部署。
- `npm install`：允许更新依赖解析结果，通常只在新增或升级依赖时使用。

安装完成后会生成 `node_modules/`。该目录由 npm 管理，不要手动编辑，也不需要提交到 Git。

## 5. 本地开发运行

启动开发服务器：

```bash
npm run dev
```

终端会打印实际 Local URL，通常为：

```text
http://localhost:3000
```

在浏览器打开该地址即可。修改 `app/` 下的代码后，开发服务器会自动重新编译。

停止服务器：

```text
Control + C
```

如果 3000 端口被占用，可指定其他端口：

```bash
npm run dev -- --port 3001
```

## 6. 构建与本地生产模式

生成生产构建：

```bash
npm run build
```

构建结果位于：

```text
dist/
```

关键产物包括：

```text
dist/server/index.js
dist/client/
dist/.openai/hosting.json
```

不要直接修改 `dist/`，因为每次构建都会重新生成。

构建成功后，可启动本地生产模式：

```bash
npm run start
```

## 7. 代码检查与自动测试

运行代码规范检查：

```bash
npm run lint
```

运行完整测试：

```bash
npm test
```

`npm test` 会先重新构建项目，再检查：

- 根页面能否返回 HTML。
- CW Passport 登录页是否直接渲染。
- 页面中不存在 ChatGPT 登录跳转。
- 网站标题、Open Graph 和 X/Twitter 分享信息是否正确。

建议发布前执行：

```bash
npm run lint
npm test
```

## 8. npm 命令说明

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 生成 Cloudflare-compatible 生产构建 |
| `npm run start` | 在本地运行生产构建 |
| `npm run lint` | 执行 ESLint 检查 |
| `npm test` | 构建并运行渲染测试 |
| `npm run db:generate` | 根据 `db/schema.ts` 生成 Drizzle 迁移；当前不需要执行 |

## 9. 项目目录说明

```text
cw-passport-platform/
├── .openai/
│   └── hosting.json           # Sites 项目、D1 和 R2 逻辑绑定
├── app/
│   ├── CwPlatform.tsx         # 七个业务视图、演示数据和前端交互
│   ├── globals.css            # 完整视觉系统和响应式样式
│   ├── layout.tsx             # HTML 外层、字体和社交分享 metadata
│   └── page.tsx               # 根页面入口
├── db/
│   ├── index.ts               # 可选 D1/Drizzle 访问入口
│   └── schema.ts              # 当前为空的数据表定义
├── drizzle/
│   └── meta/                  # 数据库迁移元数据
├── examples/d1/               # D1 示例，不参与当前平台运行
├── public/
│   ├── og.png                 # 社交分享预览图
│   └── *.svg                  # 静态图标资源
├── tests/
│   └── rendered-html.test.mjs # 服务端渲染测试
├── types/
│   └── cloudflare.d.ts        # Cloudflare 类型声明
├── worker/
│   └── index.ts               # Cloudflare Worker 请求入口
├── drizzle.config.ts          # Drizzle SQLite/D1 迁移配置
├── eslint.config.mjs          # ESLint 配置
├── next.config.ts             # Next/Vinext 配置
├── package.json               # 脚本和直接依赖
├── package-lock.json          # 完整依赖版本锁定
├── postcss.config.mjs         # Tailwind/PostCSS 配置
├── tsconfig.json              # TypeScript 配置
└── vite.config.ts             # Vinext、Sites 和 Cloudflare 构建配置
```

自动生成且不应手动编辑的目录：

```text
node_modules/
dist/
.next/
.vinext/
.wrangler/
```

## 10. 当前应用数据和登录方式

### 业务数据

当前 Passport、Cross-border Transfer 和 Seller Listing 数据均为演示数据，定义在：

```text
app/CwPlatform.tsx
```

目前没有从数据库或外部 API 读取数据。CSV 导出也是在浏览器内把这些演示记录转换成文件。

### 登录状态

当前平台自身的登录、注册和找回密码属于浏览器端原型：

- 演示账号为 `demo / demo1234`。
- 新注册用户保存在浏览器 `localStorage`。
- 模拟用户密码以明文形式保存在当前浏览器。
- 登录结果没有经过服务器验证。
- 清除浏览器数据或换设备后，本地注册账号不会同步。

因此该登录方式只能用于 UI 演示，不能作为正式生产认证系统。正式上线前必须接入后端身份认证、密码哈希、服务器会话和访问控制。

## 11. 环境变量与机密信息

当前版本不要求任何环境变量，也不需要 OpenAI API Key。

`.gitignore` 会忽略 `.env*`。如果未来接入 API：

1. 本地机密信息写入 `.env.local`。
2. 不要把密码、Token 或 API Key 写进 React 组件。
3. 不要提交 `.env.local`。
4. 线上机密信息应通过 Sites 环境变量管理。
5. 浏览器需要读取的变量不应包含服务器机密。

## 12. D1 数据库与 R2 文件存储

当前 `.openai/hosting.json` 为：

```json
{
  "project_id": "appgprj_6aaa7c2eecbc81919d71db6bb5408591",
  "d1": null,
  "r2": null
}
```

含义：

- `project_id`：当前 Sites 项目标识，部署时必须保留原值。
- `d1: null`：当前没有数据库绑定。
- `r2: null`：当前没有对象存储绑定。

不要仅为了消除 `null` 而填写虚构资源。只有在正式增加数据库或上传功能时才配置 D1/R2，并同步更新 schema、迁移和运行环境。

## 13. Sites 部署方式

本项目是 OpenAI Sites / Cloudflare Worker-compatible 工程，不是传统的单个 HTML 文件，也没有 `wrangler.jsonc`。推荐部署流程：

1. 确认 `package-lock.json` 没有意外变更。
2. 执行 `npm ci`。
3. 执行 `npm run lint`。
4. 执行 `npm test`。
5. 确认 `dist/server/index.js` 和 `dist/client/` 已生成。
6. 通过与 `.openai/hosting.json` 关联的 Sites 项目保存并发布版本。
7. 等待部署状态成功。
8. 分别检查 Sites 网址和自定义域名。

不要直接执行未经配置的 `wrangler deploy`；当前项目的发布资源、访问策略和域名由 Sites 管理。

## 14. 自定义域名与 HTTPS

当前自定义域名：

```text
construction-waste-passport.site
```

当前状态：域名、路由和 HTTPS 均为 Active。

Cloudflare DNS 中必须保留当前两条 A 记录和两条验证 TXT 记录：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| A | `@` | `162.159.143.30` |
| A | `@` | `172.66.3.26` |
| TXT | `_openai-site-verification` | `openai-site-verification=ZbJPl4aYaRD-fhh4FjDUxuc_qoW7eoL_KBFrYhfdW7I` |
| TXT | `_cf-custom-hostname` | `9c72a329-29f8-4cfb-85a2-c93fa5e99584` |

注意：

- 不要删除验证 TXT，否则未来重新验证或证书维护可能失败。
- 不要在根域名 `@` 上添加冲突的 A、AAAA 或 CNAME。
- 如果重新创建域名绑定，应使用 Sites 当次返回的新验证记录，而不是盲目复用本文中的旧值。
- DNS 正常但 HTTPS 尚未生效时，应先检查 Sites 域名状态，不要重复创建绑定。

## 15. 发布前检查清单

- [ ] Node.js 版本满足 `>=22.13.0`
- [ ] 使用 `npm ci` 安装锁定依赖
- [ ] `npm run lint` 通过
- [ ] `npm test` 通过
- [ ] 登录页能够显示
- [ ] `demo / demo1234` 能进入平台
- [ ] 七个业务视图能够切换
- [ ] CSV 导出能够生成文件
- [ ] 中英文切换正常
- [ ] `.env*` 和其他机密文件没有进入 Git
- [ ] `.openai/hosting.json` 的 `project_id` 未被替换
- [ ] 正式域名和 HTTPS 均能正常访问

## 16. 常见问题

### `npm ci` 提示 Node.js 版本不满足

升级到 Node.js 22.13.0 或更高版本，再重新执行 `npm ci`。

### `npm run dev` 无法启动

先确认当前目录正确，再执行：

```bash
pwd
node --version
npm ci
npm run dev
```

### 3000 端口被占用

```bash
npm run dev -- --port 3001
```

### 本地注册账号在另一台电脑不存在

这是当前设计的正常结果，因为账号只保存在创建它的浏览器中。正式的跨设备账户必须接入后端数据库和认证服务。

### 自定义域名显示 `pending`

依次检查：

1. 域名是否已经购买并处于 Active。
2. Nameserver 是否正常。
3. 两条 A 记录是否存在。
4. 两条 TXT 验证记录是否完全一致。
5. Sites 中的域名和 SSL 状态是否已经刷新。

### 可以直接双击 HTML 文件运行吗？

不可以。新版是 React/Vinext 工程，需要 `npm run dev`、`npm run start` 或已经发布的在线网址。旧版 `construction-waste-UI.html` 是独立原型，不参与新版运行。

## 17. 生产化前仍需完成

当前版本适合 UI 演示和需求评审。正式生产使用前至少需要：

- 接入真实的 Digital Passport、Cross-border 和 Seller Listing API。
- 使用数据库保存业务记录。
- 使用服务器端身份认证和权限控制。
- 对密码、个人资料和跨境合规数据进行安全处理。
- 增加服务器端输入验证、审计日志、备份和恢复机制。
- 根据实际组织要求完成安全、隐私和合规评审。

## 18. 参考文档

- [Vinext](https://github.com/cloudflare/vinext)
- [Cloudflare Vite Plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Drizzle ORM with D1](https://orm.drizzle.team/docs/get-started/d1-new)

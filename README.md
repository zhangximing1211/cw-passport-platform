# CW Passport Platform

Construction Waste Digital Passport Platform / 建废数码护照平台。

这是一个面向建筑废弃物数字身份、材料流转追踪、跨境数据交换和 B2B 资源刊登的高保真 Web 平台。当前版本以 UI/UX 原型和演示数据为主，包含平台自身的登录页面、七个核心业务视图、CSV 导出和中英文切换。

## 当前线上环境

本项目已从 OpenAI Sites 迁移到**自有 Cloudflare 账号**，由自己控制的 Workers 静态资源托管，不再依赖 OpenAI Sites 的边缘防火墙和 `*.chatgpt.site` 域名。


| 项目           | 当前状态                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Workers 线上网址 | [https://cw-passport-platform.tabe-hk.workers.dev](https://cw-passport-platform.tabe-hk.workers.dev) |
|              |                                                                                                      |
| 托管方式         | Cloudflare Workers 静态资源（Static Assets + SPA 回退）                                                      |
| 访问模式         | Public，访客不需要登录                                                                                       |
| HTTPS / SSL  | Cloudflare 自动提供                                                                                      |
| 数据库 D1       | 未启用                                                                                                  |
| 文件存储 R2      | 未启用                                                                                                  |
| 后端业务 API     | 未接入                                                                                                  |


演示账号：

```text
Username: demo
Password: demo1234
```



## 1. 技术架构

```text
Browser
   ↓
Cloudflare（自有账号）
   ↓
Workers 静态资源（dist/，SPA 回退到 index.html）
   ↓
React SPA（src/main.tsx → app/CwPlatform.tsx）
```

当前是**纯客户端单页应用（SPA）**：Vite 构建产出静态 `dist/`，由 Cloudflare Workers 静态资源托管，没有 Worker 脚本（`main`），所有路由通过 SPA 回退到 `index.html` 在浏览器端处理。

主要技术：


| 组件           | 版本           | 用途                                  |
| ------------ | ------------ | ----------------------------------- |
| Node.js      | `>=22.13.0`  | 本地开发、构建和测试                          |
| npm          | 随 Node.js 安装 | 依赖管理，项目使用 `package-lock.json`       |
| React        | `19.2.6`     | 前端界面                                |
| React DOM    | `19.2.6`     | 浏览器渲染                               |
| Vite         | `8.0.13`     | 开发服务器和构建系统                          |
| TypeScript   | `5.9.3`      | 类型检查与应用代码                           |
| Tailwind CSS | `4.2.1`      | CSS 构建依赖；主要视觉样式位于 `app/globals.css` |
| Wrangler     | `4.92.0`     | Cloudflare Workers 部署与登录            |


不需要 Python、Docker、Java 或独立 Web 服务器。已不再依赖 Vinext、OpenAI Sites Vite Plugin、Cloudflare Vite Plugin 或 Drizzle。

## 2. 运行环境要求



### 本地开发电脑

- macOS、Linux 或 Windows；当前项目已在 macOS 上验证。
- Node.js `22.13.0` 或更高版本。
- npm，建议使用随 Node.js 安装的版本。
- 首次安装依赖时需要互联网连接。
- 建议安装较新的 Git。
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

- Cloudflare Workers 静态资源托管（自有账号）。
- 无需 `nodejs_compat` 等兼容标志（纯静态站点）。
- 当前不需要环境变量、D1 数据库或 R2 存储桶。



## 3. 获取并进入项目

本机项目目录：

```text
/Users/zhangximing/Desktop/blockchain /cw-passport-platform
```

父目录 `blockchain`  的末尾有一个空格，因此终端命令必须保留双引号：

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

在浏览器打开该地址即可。修改 `app/` 或 `src/` 下的代码后，开发服务器会自动重新编译。

停止服务器：

```text
Control + C
```

如果 3000 端口被占用，可指定其他端口：

```bash
npm run dev -- --port 3001
```



## 6. 构建与本地预览

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
dist/index.html               # SPA 入口
dist/assets/index-*.js         # 打包后的 JS
dist/assets/index-*.css        # 打包后的 CSS
dist/favicon.svg, og.png, *.svg  # 静态资源
```

不要直接修改 `dist/`，因为每次构建都会重新生成。

构建成功后，可在本地预览生产构建：

```bash
npm run preview
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


| 命令                          | 作用                                           |
| --------------------------- | -------------------------------------------- |
| `npm run dev`               | 启动本地 Vite 开发服务器                              |
| `npm run build`             | 生成生产构建到 `dist/`                              |
| `npm run preview`           | 在本地预览生产构建                                    |
| `npm run lint`              | 执行 ESLint 检查                                 |
| `npm test`                  | 构建并运行渲染测试                                    |
| `npm run cf-login`          | 通过浏览器登录 Cloudflare 账号（首次部署需要）                |
| `npm run deploy`            | 构建并部署到 Cloudflare Workers（`wrangler deploy`） |
| `npm run deploy:skip-build` | 跳过构建，直接部署已有 `dist/`                          |




## 9. 项目目录说明

```text
cw-passport-platform/
├── app/
│   ├── CwPlatform.tsx         # 七个业务视图、演示数据和前端交互
│   └── globals.css            # 完整视觉系统和响应式样式
├── src/
│   ├── main.tsx               # SPA 入口，挂载 React 到 #root
│   └── vite-env.d.ts          # Vite 类型声明
├── public/
│   ├── og.png                 # 社交分享预览图
│   └── *.svg                  # 静态图标资源
├── tests/
│   └── rendered-html.test.mjs # 构建产物渲染测试
├── index.html                 # Vite SPA HTML 入口
├── vite.config.ts             # Vite 配置（React 插件，端口 3000）
├── wrangler.jsonc             # Cloudflare Workers 静态资源部署配置
├── eslint.config.mjs          # ESLint 配置
├── postcss.config.mjs         # Tailwind/PostCSS 配置
├── tsconfig.json              # TypeScript 配置
├── package.json               # 脚本和依赖
└── package-lock.json          # 完整依赖版本锁定
```

> 旧版遗留目录（`db/`、`drizzle/`、`examples/`、`types/`、`worker/`、`.openai/`）来自迁移前的 Vinext/OpenAI Sites 结构，当前 SPA 不使用它们，可在确认无依赖后清理。

自动生成且不应手动编辑的目录：

```text
node_modules/
dist/
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

当前版本不要求任何环境变量。

`.gitignore` 会忽略 `.env*`。如果未来接入 API：

1. 本地机密信息写入 `.env.local`。
2. 不要把密码、Token 或 API Key 写进 React 组件。
3. 不要提交 `.env.local`。
4. 线上机密信息应通过 `wrangler secret put <NAME>` 管理。
5. 浏览器需要读取的变量不应包含服务器机密。



## 12. 部署到自有 Cloudflare 账号

本项目通过 `wrangler` 部署到你自己的 Cloudflare 账号，不再使用 OpenAI Sites。

### 首次部署：登录 Cloudflare

方式一（浏览器登录）：

```bash
npm run cf-login
```

方式二（API Token，适合 CI 或无浏览器环境）：

1. 到 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) 创建一个「Edit Cloudflare Workers」模板的 Token。
2. 设置环境变量：

```bash
export CLOUDFLARE_API_TOKEN=你的token
```



### 部署

```bash
npm run deploy
```

该命令会先 `npm run build` 生成 `dist/`，再 `wrangler deploy` 把静态资源发布到 Cloudflare Workers。

部署成功后会输出线上地址：

```text
https://cw-passport-platform.tabe-hk.workers.dev
```

> `tabe-hk` 是当前账号的 workers.dev 子域名。如需更改，请在 Cloudflare 控制台 Workers & Pages 设置中操作。



### 部署配置

`wrangler.jsonc` 关键内容：

```jsonc
{
  "name": "cw-passport-platform",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"  // SPA 路由回退到 index.html
  }
}
```

没有 `main` 字段，表示纯静态资源托管，不运行 Worker 脚本。

## 13. 自定义域名

自定义域名 `construction-waste-passport.site` 已在同一 Cloudflare 账号内（作为 Zone）。要把它绑定到这个 Worker：

1. 在 Cloudflare 控制台进入该 Zone。
2. Workers & Pages → 选中 `cw-passport-platform` → Settings → Domains & Routes → Add Custom Domain。
3. 输入 `construction-waste-passport.site`（或子域名如 `app.construction-waste-passport.site`）。
4. Cloudflare 会自动配置 DNS 记录和 HTTPS 证书。

绑定后，访问自定义域名即走你自己的 Cloudflare，与 `*.workers.dev` 共用同一份静态资源。

> 迁移前在 DNS 中的 OpenAI 验证 TXT 记录（`_openai-site-verification`、`_cf-custom-hostname`）和指向 OpenAI 的 A 记录已不再需要，可在确认迁移稳定后清理，避免与新的 Workers 自定义域名记录冲突。



## 14. 发布前检查清单

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
- [ ] `npm run deploy` 成功，`*.workers.dev` 地址可正常访问
- [ ] 自定义域名（如已绑定）和 HTTPS 均能正常访问



## 15. 常见问题



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

### 部署时报错 "You need to register a workers.dev subdomain"

账号还没有 workers.dev 子域名。到 Cloudflare 控制台 Workers & Pages 完成一次性子域名注册，或在自己的终端运行 `npx wrangler deploy` 时交互式选择注册。

### 部署时报错指向不存在的 `dist/server/wrangler.json`

这是旧版 Vinext 部署缓存残留。删除 `.wrangler/deploy` 目录后重新部署：

```bash
rm -rf .wrangler/deploy
npm run deploy
```



### 可以直接双击 HTML 文件运行吗？

不可以。新版是 Vite + React 工程，需要 `npm run dev`、`npm run preview` 或已部署的在线网址。旧版 `construction-waste-UI.html` 是独立原型，不参与新版运行。

## 16. 生产化前仍需完成

当前版本适合 UI 演示和需求评审。正式生产使用前至少需要：

- 接入真实的 Digital Passport、Cross-border 和 Seller Listing API。
- 使用数据库保存业务记录。
- 使用服务器端身份认证和权限控制。
- 对密码、个人资料和跨境合规数据进行安全处理。
- 增加服务器端输入验证、审计日志、备份和恢复机制。
- 根据实际组织要求完成安全、隐私和合规评审。



## 17. 参考文档

- [Vite](https://vite.dev/)
- [Cloudflare Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)
- [Wrangler 配置](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)


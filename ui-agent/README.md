# UI Agent

`ui-agent` 现在支持两种运行形态：

1. 浏览器开发模式：Next.js 页面直接连本地或远端 gateway。
2. Tauri 桌面模式：启动桌面应用时自动拉起内置 gateway，待健康检查通过后进入 UI。

## 环境要求

- Node.js 22+
- `pnpm`
- Rust / Cargo
- Tauri 2 桌面构建环境

## 常用命令

- 安装依赖：`pnpm install`
- 浏览器开发：`pnpm -C ui-agent dev`
- 桌面开发：`pnpm -C ui-agent dev:desktop`
- 类型检查：`pnpm -C ui-agent type-check`
- 静态导出：`pnpm -C ui-agent build:web-static`
- 准备 gateway sidecar：`pnpm -C ui-agent prepare:gateway-sidecar`
- 生成桌面调试包：`pnpm -C ui-agent exec tauri build --debug --bundles app`
- 生成桌面应用包：`pnpm -C ui-agent build:desktop`

## 桌面打包说明

桌面模式采用 `Tauri + OpenClaw gateway sidecar + 静态 ui-agent`：

- `pnpm -C ui-agent build:web-static` 会把前端导出到 `ui-agent/out`
- `pnpm -C ui-agent prepare:gateway-sidecar` 会把以下资源复制到 `ui-agent/src-tauri/resources/runtime`
  - `node`
  - `openclaw/dist`
  - `openclaw.mjs`
  - `package.json`
  - `ui-agent/out`
- Tauri 启动桌面应用后，会先启动本地 gateway
- gateway 健康检查通过后，主界面才会进入 UI

桌面模式默认连接：

- HTTP: `http://127.0.0.1:18789`
- WebSocket: `ws://127.0.0.1:18789`

打包后的 OAuth 回调页会走本地 loopback gateway 提供的静态页面，避免依赖 `tauri://` 之类不可回调的自定义协议。

## 当前产物位置

调试打包命令成功后，macOS `.app` 产物默认位于：

- `ui-agent/src-tauri/target/debug/bundle/macos/Hovi.app`

## 开发建议

- 只改前端逻辑时，优先用 `pnpm -C ui-agent dev`
- 验证桌面启动链路时，用 `pnpm -C ui-agent dev:desktop`
- 验证最终打包结果时，用 `pnpm -C ui-agent exec tauri build --debug --bundles app`

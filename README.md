# Kana Remote

连接远程常驻 Kana Agent 的 Android / Web 客户端。一个 server 对应一个活跃会话。

使用 React、TypeScript、Vite、Ionic React、Capacitor 和 Bun；代码检查与格式化使用 Biome。
首版包含连接设置、当前会话的流式聊天、Markdown / 代码高亮与复制、折叠工具详情、
工具审批、发送 / 排队 / 停止，以及空闲时新建或恢复历史会话。
界面使用中文，跟随系统明暗；思考正文不展示，只显示 Agent 的工作状态。

地址和 token 通过 Capacitor Preferences 保存到本机（明文），重开自动连接。
断线、浏览器重新可见和 Android 回到前台时，重新订阅事件流，用首帧完整快照同步状态。
认证失败会停止自动重连。写操作不会自动重试，发送失败会保留草稿。

## 连接 server

在连接页填写 server 的根地址（可以带反向代理路径前缀，不要添加 `/v1`）和
`KANA_SERVER_TOKEN`。Android 使用 HTTPS 入口；浏览器本地开发也可以使用 HTTP。

本项目只开发客户端，不修改 `../kana`。反向代理需要配置 CORS：

- 允许 Android WebView 来源 `https://localhost`。
- 开发时允许 `http://localhost:5173`、`http://127.0.0.1:5173`；部署 Web 后允许实际站点来源。
- 允许请求头 `Authorization`、`Content-Type`，请求方法 `GET`、`POST`、`OPTIONS`。
- `OPTIONS` 预检直接返回成功，不要求 Bearer token；实际请求仍使用 Bearer 认证。
- 错误响应也应携带 CORS 响应头；`Access-Control-Allow-Origin` 返回匹配的来源。
- 对 `/v1/events` 关闭代理缓冲与缓存，允许长连接，保持 `text/event-stream` 响应类型。

停止只中止当前运行，队列中的指令仍可能继续执行。
断开客户端不会停止 server 上的 Agent，也不会替你处理待审批操作。

## 开发

```sh
bun install
bun dev
```

在浏览器中打开终端显示的地址。

## 检查与格式化

```sh
bun run check
bun run test
bun run format
```

## Web 构建

```sh
bun run build
bun run preview
```

`build` 包含 TypeScript 检查，构建产物位于 `dist/`。

## 代码结构

- `src/api`：HTTP / SSE 和 server 协议类型。
- `src/state`：Zustand 会话投影、连接生命周期、TanStack Query。
- `src/components`：消息、Markdown、工具、审批与会话弹窗。
- `src/pages`：连接页与当前会话页。
- `tests`：事件恢复和传输行为测试。

## Android APK

需要 Node.js 22.12+、Bun、JDK 21 和 Android SDK Platform 36。
Gradle 会按需安装对应的 Build Tools；当前工程使用 35.0.0。
确保 `JAVA_HOME` 和 `ANDROID_HOME` 指向对应安装目录。

```sh
bun run android:apk
```

该命令依次构建 Web、同步到 Android 工程，再通过 Gradle Wrapper 生成可安装的 debug APK。
首次构建会下载项目指定的 Gradle 和 Android 构建依赖。

APK 路径：`android/app/build/outputs/apk/debug/app-debug.apk`。
把 APK 传到手机后手动安装验证。

如果下载构建依赖需要代理，Gradle 需要单独指定代理参数。以本机的 `127.0.0.1:7897` 为例：

```sh
bun run android:sync
./android/gradlew -p android \
  -Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7897 \
  -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7897 \
  assembleDebug
```

只更新 Android 内的 Web 资源时，可以运行 `bun run android:sync`。

应用名称：`Kana Remote`。Android 包名：`io.github.longyijdos.kana.client`。

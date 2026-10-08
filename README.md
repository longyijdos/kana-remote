# Kana Remote

A simple Web and Android frontend for the [Kana server](https://github.com/longyijdos/kana) API, built with React and Capacitor.

Connect to a remote Kana agent with one active session. Supports streaming chat, Markdown and code highlighting, tool details and approvals, session management, and remaining context display.

## Connect

Enter the server base URL (without `/v1`) and its `KANA_SERVER_TOKEN`. Use HTTPS on Android.

Configure CORS on your reverse proxy for `https://localhost` (Android), your Web origin, and local development origins. Allow `Authorization` and `Content-Type`, plus `GET`, `POST`, `DELETE`, and `OPTIONS`. Disable buffering for `/v1/events`.

The server URL and token are saved locally in plaintext for automatic reconnection.

## Development

Requires Bun and Node.js 22.12+.

```sh
bun install
bun dev
```

## Build

```sh
bun run build
```

Web output: `dist/`.

For Android, install JDK 21 and Android SDK Platform 36, then set `JAVA_HOME` and `ANDROID_HOME`.

```sh
bun run android:apk
```

Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

## Releases

Push a `v*` tag matching both `package.json` and Android `versionName` to publish a signed APK and SHA-256 checksum. The release workflow also supports manual runs with an existing tag. Increase Android `versionCode` with each release.

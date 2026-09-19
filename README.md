# NightCode (nightcode_webview)

NightCode is a local AI coding workspace for Android: a native Kotlin shell
(WebView host) around an HTML/JS/CSS chat UI, with direct on-device access to
files, SSH and git — no NDK, no external binaries.

## Features

- **Chat UI** — local single-page interface (`assets/index.html`, `app.js`,
  `style.css`) rendered in a fullscreen WebView, portrait-only.
- **File system bridge** — read/write/list/search/mkdir/rename/delete via
  SAF (`DocumentFile`) exposed to JS through a `@JavascriptInterface` bridge.
- **Workspace & projects** — pick a workspace tree, create/switch between
  projects inside it; selection is persisted and restored on launch.
- **Embedded git** — `git clone` into project folders using JGit (pure Java).
- **SSH** — execute remote commands (`sshExec`) with hosts read from the
  device's SSH config, powered by JSch.
- **HTTP client** — plain and streaming requests routed through Kotlin
  (`httpRequest` / `httpStream`) with a partial wake lock so backgrounded
  sockets aren't killed mid-request.
- **System-intent aware** — opens external URLs in the browser, injects
  window-insets so the UI draws edge-to-edge under system bars.

## Project structure

```
.
├── app/
│   ├── build.gradle.kts          # app module: SDK 26–35, JSch, JGit deps
│   ├── nightcode.jks             # release keystore (test credentials)
│   └── src/main/
│       ├── AndroidManifest.xml   # INTERNET permission, single activity
│       ├── java/com/nightcode/app/
│       │   └── MainActivity.kt   # WebView host + JS bridge (fs, git, ssh, http)
│       ├── assets/
│       │   ├── index.html        # NightCode UI shell
│       │   ├── app.js            # frontend logic
│       │   └── style.css         # styling (dark theme)
│       └── res/
│           ├── values/styles.xml
│           └── xml/backup_rules.xml
├── .github/workflows/build.yml   # CI: builds debug & release APKs
├── build.gradle.kts              # root build script
├── settings.gradle.kts           # single module: :app
└── gradle.properties
```

## Architecture

`MainActivity.kt` owns a single `WebView` that loads `assets/index.html`.
The frontend talks to native code through one injected JS bridge object
exposing namespaced methods (`fs*`, `gitClone`, `sshExec`, `httpRequest`,
`httpStream`, workspace/project pickers, …). Every bridge call is
asynchronous and replies by invoking a JS callback passed as a string.
Native side uses:

- **SAF / DocumentFile** for all file access (no storage permission needed),
- **JSch** for SSH exec,
- **JGit** for repository cloning into SAF-managed folders.

## Build

```bash
./gradlew assembleDebug      # debug APK
./gradlew assembleRelease    # release APK (signed with app/nightcode.jks)
```

CI (`.github/workflows/build.yml`) builds both on every push to `main` and
uploads the APKs as artifacts.

## Requirements

- JDK 17
- Android SDK with compileSdk 35
- minSdk 26 (Android 8.0+)

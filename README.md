# interview-you

Cross-platform desktop app scaffold built with **Tauri + React + TypeScript**.

## Included scaffold

- Chat screen UI for interview practice flow
- Settings screen with API key input for the current app session
- Tauri desktop shell for Windows, macOS, and Linux
- GitHub Actions workflow for cross-platform desktop builds

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri system dependencies for your OS: https://tauri.app/start/prerequisites/

## Local development

```bash
npm install
npm run tauri dev
```

## Production build

```bash
npm run tauri build
```

## CI

Cross-platform build workflow: `.github/workflows/desktop-build.yml`

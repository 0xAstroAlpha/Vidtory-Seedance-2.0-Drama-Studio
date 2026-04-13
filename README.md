<h1 align="center">🎬 Vidtory Drama Studio</h1>

<p align="center">
  <strong>AI-powered storyboard & short film creation tool — from script to screen, fully automated.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-green.svg" alt="License" /></a>
  <a href="https://github.com/0xAstroAlpha/Vidtory-Seedance-2.0-Drama-Studio/releases"><img src="https://img.shields.io/github/v/release/0xAstroAlpha/Vidtory-Seedance-2.0-Drama-Studio" alt="Release" /></a>
  <a href="https://github.com/0xAstroAlpha/Vidtory-Seedance-2.0-Drama-Studio/stargazers"><img src="https://img.shields.io/github/stars/0xAstroAlpha/Vidtory-Seedance-2.0-Drama-Studio" alt="Stars" /></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#web-mode">Web Mode</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#license">License</a>
</p>

---

## Introduction

**Vidtory Drama Studio** is a production-grade AI filmmaking tool. Five interconnected modules cover the entire creative pipeline from script to final cut:

> **📝 Script → 🎭 Characters → 🌄 Scenes → 🎬 Director → ⭐ S-Class (Seedance 2.0)**

Each step's output flows automatically into the next — no manual glue needed. Powered by **Google Gemini** and compatible with any OpenAI-compatible API. Ideal for batch production of short dramas, anime series, trailers, and more.

## Features

### ⭐ S-Class Module — Seedance 2.0 Multi-Modal Creation
- **Multi-shot narrative video generation**: Merge multiple storyboard frames into coherent narrative videos
- Supports `@Image` / `@Video` / `@Audio` multi-modal references (character refs, scene images, first-frame auto-collection)
- Smart prompt construction: Automatic 3-layer fusion (action + camera language + lip-sync dialogue)
- First-frame grid stitching (N×N strategy)
- Seedance 2.0 parameter constraint validation (≤9 images + ≤3 videos + ≤3 audio, prompt ≤5000 chars)

### 📝 Script Analysis Engine
- Intelligent script decomposition into scenes, shots, and dialogue
- Auto-detection of characters, locations, emotions, and camera directions
- Multi-episode / multi-act script structure support

### 🎭 Character Consistency System
- **6-layer identity anchoring**: Ensures the same character looks consistent across different shots
- Character Bible management
- Character reference image binding

### 🖼️ Scene Generation
- Multi-angle joint image generation
- Automatic conversion from scene description to visual prompts

### 🎞️ Professional Storyboard System
- Cinematic camera parameters (shot size, angle, movement)
- Auto layout and export
- Visual style switching (2D / 3D / realistic / stop-motion, etc.)

### 🚀 Batch Production Workflow
- **One-click full pipeline**: Script analysis → Character/Scene generation → Shot splitting → Batch image generation → Batch video generation
- Multi-task parallel queue with automatic retry on failures
- Built for high-volume short drama / anime production

### 🤖 Multi-Provider AI Scheduling
- **Google Gemini** as primary provider (text, image, video, vision)
- **Custom endpoints** — any OpenAI-compatible API proxy
- API Key round-robin load balancing with automatic failover
- Task queue management with retry logic

## Quick Start

### Requirements

- **Node.js** >= 18
- **npm** >= 9

### Install & Run

```bash
# Clone the repo
git clone https://github.com/0xAstroAlpha/Vidtory-Seedance-2.0-Drama-Studio.git
cd Vidtory-Seedance-2.0-Drama-Studio

# Install dependencies
npm install

# Start in Electron desktop mode
npm run dev

# Or start in web browser mode (no Electron needed)
npm run dev:web
```

### Configure API Key

After launching, go to **Settings → API Management**, add your Google Gemini API key (get one at [ai.google.dev](https://ai.google.dev)), and you're ready to go.

## Web Mode

Vidtory can run entirely in the browser — no Electron required:

```bash
# Development
npm run dev:web        # → http://localhost:5180

# Production build
npm run build:web      # → dist-web/
```

| Feature | Desktop (`npm run dev`) | Web (`npm run dev:web`) |
|---------|------------------------|-------------------------|
| Port | 5173 | 5180 |
| Storage | IndexedDB + OPFS | IndexedDB + OPFS |
| AI API calls | `fetch()` | `fetch()` via CORS proxy |
| File export | Native dialog | Browser download |

## Architecture

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 30 |
| Frontend | React 18 + TypeScript |
| Build | electron-vite (Vite 5) |
| State | Zustand 5 |
| UI | Radix UI + Tailwind CSS 4 |
| AI Core | `@opencut/ai-core` (prompt compiler, character bible, task polling) |
| Providers | Google Gemini, Custom OpenAI-compatible |

### Project Structure

```
Vidtory-Seedance-2.0-Drama-Studio/
├── electron/              # Electron main process + Preload
│   ├── main.ts            # Main process (storage, filesystem, protocol)
│   └── preload.ts         # Security bridge
├── src/
│   ├── components/        # React UI components
│   │   ├── panels/        # Main panels (Script, Characters, Scenes, Director, S-Class)
│   │   └── ui/            # Base UI component library
│   ├── stores/            # Zustand global state
│   ├── lib/               # Utilities (AI scheduling, image management, routing)
│   ├── packages/
│   │   └── ai-core/       # AI core engine
│   └── types/             # TypeScript type definitions
├── build/                 # Build resources (icons)
├── vite.web.config.ts     # Standalone web Vite config
└── scripts/               # Build scripts
```

## License

This project uses a **dual license** model:

### Open Source — AGPL-3.0

Licensed under [GNU AGPL-3.0](LICENSE). You are free to use, modify, and distribute, but modified code must be open-sourced under the same license.

### Commercial Use

For closed-source usage or integration into commercial products, see [Commercial License](COMMERCIAL_LICENSE.md).

## Contributing

Contributions welcome! See [Contributing Guide](CONTRIBUTING.md) for details.

## Credits

Forked from [MemeCalculate/moyin-creator](https://github.com/MemeCalculate/moyin-creator) — rebranded and enhanced with Gemini-native AI provider architecture, full English localization, and web deployment support.

---

<p align="center">Made with ❤️ by <a href="https://github.com/0xAstroAlpha">0xAstroAlpha</a></p>

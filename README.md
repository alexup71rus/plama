**Plama** is a local AI client replicating the functionality of ChatGPT, Grok, and Yandex Alice — but fully private and self-hosted.

<img src="./src/assets/logo.svg" alt="Logo" width="100" />

[Download now](https://github.com/alexup71rus/plama/releases)

### 💡 Why Plama?

> A full-featured local AI client with private memory, fast search, flexible prompts, and a clean codebase you can extend freely.

<img src="./src/assets/img.png" alt="Screenshot" width="100%" />

### 🚀 Features

* 💬 Works with local LLMs via **Ollama**
* 🧠 Persistent memory (summarization-based), like GPT
* 🔍 Internet search and check provided links
* ✅ Daily Task Planning & News Digest
* 📄 Upload and analyze text documents (RAG supports `.txt`, more formats planned)
* 🖼️ Supports image input in chat
* ⚡ Quick system prompt snippets
* 🔎 Chat sessions with system prompt filters

### 🚀 In Development

* 📋 Better support for various document formats in RAG
* 🎙️ Voice chat support
* 🚀 Support for third-party API tools (agent/tool calling)
* 🧩 MCP servers support (bring-your-own tools)

### ⚙️ Required Models

Download and configure via Ollama:

1. **Any general model**
2. **RAG model** (used for document-based retrieval and memory)

### 🌐 Optional: SearXNG Search Engine

To enable internet search, you can run SearXNG:

```bash
docker run --restart=always -d -p 8888:8080 \
  -v "./searxng:/etc/searxng:rw" \
  -e "BASE_URL=http://localhost:9090/" \
  -e "INSTANCE_NAME=SearXNG" \
  --name SearXNG searxng/searxng
```

Or:

```bash
docker run -d \
  --name searxng \
  -p 8888:8888 \
  -v ~/searxng-config:/etc/searxng \
  searxng/searxng
```

### 📦 Installation

This is a **monorepo** containing both frontend and backend parts.

First, install dependencies for both root and backend:

```bash
pnpm install
pnpm --prefix backend install
pnpm --prefix backend exec node node_modules/puppeteer/install.js
```

Then, to run the app in development mode:

```bash
pnpm dev
```

Or to launch the Electron app:

```bash
pnpm dev:electron
```

### 🌐 Roadmap

* 🧠 Agent mode (2026)
  * Tool-calling workflow (search, RAG, link fetch, tasks) with structured tool schemas
  * Better “thinking” formats support (e.g. `<think>…</think>`, `<analysis>…</analysis>`, streaming-safe)
  * Guardrails: tool permissioning, rate limits, and clear UI for tool traces
* 🧩 MCP servers integration
  * Connect to one or more MCP servers (stdio / HTTP) and expose their tools to the agent
  * Per-server auth + environment variables, and allow/deny list per tool
  * Tool discovery + versioning + health checks
* 🔍 RAG & indexing
  * Better local document indexing and retrieval quality
  * More formats: PDF/DOCX/MD, and chunking strategies per file type
* 🎤 Voice
  * Optional voice input/output (STT + TTS)
* 🌍 UX
  * Interface multilingual support
* 🧰 Maintenance
  * Migrate deprecated packages (e.g. `apollo-server-express`) to maintained alternatives
  * Planned major upgrades (needs migration work): Vite 7, Vue Router 5, Electron 40, Puppeteer 24, Marked 17, ESLint 10

### 📄 License

[License](https://github.com/alexup71rus/plama/blob/master/LICENSE)

### 📧 Contact

TG: [@alexup71rus](https://t.me/alexup71rus)

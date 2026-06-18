# AveFlow Video – AI TikTok/Reels Video Ad Generator

AveFlow Video is a full-stack monorepo application that automates the creation of viral TikTok-style video ads from any product page URL (like Amazon). It crawls product images/videos, generates an engaging marketing script with Gemini, synthesizes professional narration, and automatically renders a dynamic video using FFmpeg.

---

## Repository Structure

```text
AveFlowVideo/
├── ave-flow-video/           # Frontend (Next.js App Router + Tailwind CSS)
└── ave-flow-video-backend/   # Backend (Python FastAPI + Crawl4AI + FFmpeg)
```

---

## 🛠️ Backend Setup (`ave-flow-video-backend`)

The backend is built with **Python 3.10+ (or 3.11)**, **FastAPI**, **Crawl4AI**, and **FFmpeg**.

### 1. Prerequisites
- **Python**: Make sure Python 3.10 or higher is installed.
- **FFmpeg**: You must have `ffmpeg` and `ffprobe` installed on your system and available in your system's `PATH`.
  - *Windows*: Download from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) and add to System variables.
  - *macOS*: Install via Homebrew: `brew install ffmpeg`
  - *Linux*: Install via APT: `sudo apt install ffmpeg`

### 2. Installation & Run
Navigate to the backend directory:
```bash
cd ave-flow-video-backend
```

Create a virtual environment and activate it:
```bash
# Windows (PowerShell/CMD)
python -m venv .venv
.venv\Scripts\activate

# macOS/Linux
python3 -m venv .venv
source .venv/bin/activate
```

Install the required Python dependencies:
```bash
pip install -r requirements.txt
```
*(Note: If `requirements.txt` is missing, you can run: `pip install fastapi uvicorn crawl4ai beautifulsoup4 pydantic pillow requests`)*

Install Crawl4AI dependencies (Playwright):
```bash
crawl4ai-setup
# or
playwright install
```

### 3. Start the Backend Server
Run the FastAPI application with Uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
The server will start running on [http://localhost:8000](http://localhost:8000).

---

## 💻 Frontend Setup (`ave-flow-video`)

The frontend is built using **Next.js**, **React**, and **Tailwind CSS**.

### 1. Installation
Navigate to the frontend directory:
```bash
cd ave-flow-video
```

Install NPM packages:
```bash
npm install
```

### 2. Running in Development Mode
Run the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## ⚙️ App Configuration (Settings)
When you open the web application at `http://localhost:3000`, click on **Settings** in the top-right corner to configure your API keys:
1. **Gemini API Key**: Required for structured script writing and scene-by-scene planning.
2. **ElevenLabs API Key**: Optional, used to generate high-fidelity AI voiceovers (if disabled, the app uses a standard Free Text-to-Speech engine).
3. **Firecrawl API Key**: Optional, used for scraping pages if direct scraper fallback is needed.

---

## 🚀 Git Setup & Exclusions
A root-level `.gitignore` has been pre-configured to ensure that:
- Node modules, build directories, and environments are ignored.
- Rendered MP4 files, temporary folder structures (`/renders/_tmp/`), and raw logs are excluded to prevent server disk space leak when pushing code.

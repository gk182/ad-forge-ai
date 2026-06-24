# AveFlow Video Backend Agent Guide

This repository is the Python backend for AveFlow Video. Keep guidance here minimal and practical.

## What This Backend Does

- `main.py` exposes the FastAPI app and routes for crawling, voice generation, and rendering.
- `crawlers/amazon.py` parses Amazon product and listing pages.
- `crawlers/app_store.py` parses Apple App Store and Google Play pages.
- `services/gemini_service.py` generates structured video scripts with Gemini.
- `models/video_script.py` defines the structured script schema.
- `renderers/structured_renderer.py` and `renderers/video_renderer.py` build the final MP4 with `ffmpeg`.

## Local Setup

- Use Python 3.10+.
- Install dependencies with `pip install -r requirements.txt`.
- If Playwright is missing browser binaries, run `playwright install`.
- Make sure `ffmpeg` and `ffprobe` are on `PATH`.

## Run Commands

- Start the API server with `uvicorn main:app --reload` from `ave-flow-video-backend/`.
- The app runs on `http://127.0.0.1:8000`.

## Important Routes

- `POST /scrape` crawls a product, app, or landing page and returns normalized media data.
- `POST /render` renders a video from raw assets and a script.
- `POST /render-structured` asks Gemini for a structured script and then renders a full video.
- `POST /voice` generates ElevenLabs audio from text.
- `GET /outputs/renders/{filename}` serves rendered MP4 files.

## Working Rules

- Keep response schemas stable. If you add or rename fields, update the Pydantic models and any consumer code together.
- Preserve fallback behavior. Crawls and renders should degrade gracefully when media is missing or invalid.
- Validate downloaded video files before using them. Some URLs look like video but return HTML or broken assets.
- Keep generated files inside `outputs/` or `outputs/renders/`.
- Prefer small, targeted changes to crawlers, Gemini prompting, or renderer logic over large rewrites.
- Do not commit `.pyc`, `.venv`, or other generated artifacts.

## Testing Checklist

- Run `python3 -m py_compile main.py crawlers/*.py services/*.py renderers/*.py models/*.py` after Python edits.
- Manually test:
  - Amazon product URLs
  - Amazon listing URLs
  - Google Play / App Store URLs
  - `POST /render-structured`
  - `POST /voice`
- Check the console logs for crawl, JSON repair, media validation, and ffmpeg errors.

## Common Pitfalls

- Amazon pages often return malformed or partial media URLs. Prefer validated downloadable URLs.
- App store pages can contain screenshot metadata in several places; keep the existing fallbacks.
- Rendering failures are usually caused by invalid media, missing audio, or ffmpeg not being available.
- Keep text output UTF-8 safe. The app already reconfigures stdout for that reason.

## Style Notes

- Use concise logging with a clear prefix such as `[Crawl]`, `[Render]`, or `[Voice]`.
- Keep models and renderer inputs explicit and strongly typed where possible.
- When adding a new behavior, update the relevant route, schema, and renderer in the same change.

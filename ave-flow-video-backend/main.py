import sys
import asyncio

# Set Windows Event Loop Policy for Playwright subprocesses
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from crawl4ai import *
from crawlers.amazon import parse_amazon_product, parse_amazon_listing, generate_product_markdown, generate_listing_markdown
from renderers.video_renderer import RenderInput, render_video
from services.tts_service import (
    DEFAULT_ELEVENLABS_VOICE,
    DEFAULT_KOKORO_VOICE,
    synthesize_speech_to_base64,
    TtsSynthesisRequest,
)

# Ensure standard output is UTF-8 to prevent console encode errors
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

app = FastAPI(title="AveFlow Video Crawler Backend")

BASE_DIR = Path(__file__).resolve().parent
OUTPUTS_DIR = BASE_DIR / "outputs"
RENDERS_DIR = OUTPUTS_DIR / "renders"
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
RENDERS_DIR.mkdir(parents=True, exist_ok=True)

# Custom response for video streaming with range support
from fastapi.responses import FileResponse
import os
import time
import glob


# ── Auto-cleanup old renders on startup ──────────────────────────────
def _cleanup_old_renders(max_age_seconds: int = 3600):
    """Delete render files older than max_age_seconds (default: 1 hour)."""
    now = time.time()
    count = 0
    for f in RENDERS_DIR.glob("*.mp4"):
        try:
            if now - f.stat().st_mtime > max_age_seconds:
                f.unlink(missing_ok=True)
                count += 1
        except OSError:
            pass
    if count:
        print(f"[Cleanup] Removed {count} old render(s) from {RENDERS_DIR}")

_cleanup_old_renders()


@app.get("/outputs/renders/{filename}")
async def serve_video(filename: str):
    file_path = RENDERS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@app.get("/download/{filename}")
async def download_video(filename: str):
    """Download a rendered video file with a proper filename."""
    file_path = RENDERS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=str(file_path),
        media_type="video/mp4",
        filename=filename,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    )


@app.delete("/cleanup/{filename}")
async def cleanup_video(filename: str):
    """Delete a rendered video to free server disk space."""
    file_path = RENDERS_DIR / filename
    if file_path.exists():
        try:
            file_path.unlink()
            print(f"[Cleanup] Deleted render: {filename}")
            return {"message": f"Deleted {filename}", "deleted": True}
        except OSError as e:
            print(f"[Cleanup] Failed to delete {filename}: {e}")
            return {"message": f"Failed to delete: {e}", "deleted": False}
    return {"message": "File not found or already deleted", "deleted": False}


app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CrawlRequest(BaseModel):
    url: str


class RenderRequest(BaseModel):
    title: str
    script: str
    description: str = ""
    image: str = ""
    screenshots: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    audio_base64: Optional[str] = None
    audio_url: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    target_duration: Optional[float] = None
    cta_text: str = "Tap the link in bio"


class VoiceRequest(BaseModel):
    script: str
    voice_engine: Optional[str] = None
    tts_engine: Optional[str] = None
    elevenlabs_api_key: Optional[str] = None
    elevenlabs_voice_id: str = DEFAULT_ELEVENLABS_VOICE
    kokoro_voice_id: str = DEFAULT_KOKORO_VOICE
    scene_subtitles: list[str] = Field(default_factory=list)


class StructuredRenderRequest(BaseModel):
    title: str
    description: str
    markdown: str
    image: str = ""
    screenshots: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    tone: str = "fun"
    target_duration: float = 30.0
    gemini_api_key: str
    gemini_model: str = "gemini-2.5-flash"
    elevenlabs_api_key: str = ""
    use_free_tts: bool = False
    voice_engine: Optional[str] = None
    kokoro_voice_id: str = DEFAULT_KOKORO_VOICE
    custom_notes: str = ""

@app.post("/scrape")
async def scrape_url(req: CrawlRequest):
    url = req.url
    print(f"[Crawl Started] Target URL: {url}")
    
    # Configure Browser Options
    browser_config = BrowserConfig(
        headless=True,
        verbose=True
    )
    
    # JS Injection: scroll page progressively, trigger lazy-loaded images, click video thumbnails, and play videos
    js_click_video = """
    // 1. Progressive scroll to trigger IntersectionObserver-based lazy loaders
    const scrollStep = Math.max(300, window.innerHeight);
    const maxScroll = document.body.scrollHeight;
    for (let y = 0; y < maxScroll; y += scrollStep) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 300));
    }
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 500));

    // 2. Force lazy-loaded images: convert data-src, data-lazy-src, data-original to src
    document.querySelectorAll('img[data-src], img[data-lazy-src], img[data-original], img[data-srcset]').forEach(img => {
        const lazySrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
        if (lazySrc) img.setAttribute('src', lazySrc);
        const lazySrcset = img.getAttribute('data-srcset');
        if (lazySrcset) img.setAttribute('srcset', lazySrcset);
    });

    // 3. Force lazy-loaded videos: convert data-src on video/source elements
    document.querySelectorAll('video[data-src], video source[data-src]').forEach(el => {
        const lazySrc = el.getAttribute('data-src');
        if (lazySrc) el.setAttribute('src', lazySrc);
    });

    // 4. Click Amazon video thumbnails to trigger lazy-loaded video playback
    const videoThumbs = document.querySelectorAll('#altImages li.videoThumbnail input, #altImages li.videoThumbnail, .video-thumbnail, [data-video-url]');
    videoThumbs.forEach(thumb => {
        try { thumb.click(); } catch (e) {}
    });
    await new Promise(r => setTimeout(r, 2500));

    // 5. Trigger muted playback on all discovered <video> elements to force media stream requests
    document.querySelectorAll('video').forEach(v => {
        try {
            v.muted = true;
            v.play().catch(() => {});
        } catch (e) {}
    });
    await new Promise(r => setTimeout(r, 1500));
    """
    
    # Configure Run Options
    run_config = CrawlerRunConfig(
        scan_full_page=True,        # Automatically scrolls to the bottom of the page
        wait_for_images=True,       # Ensures lazy-loaded images are fully rendered
        delay_before_return_html=2.0, # Extra wait for pending AJAX/network requests
        js_code=js_click_video,     # Execute custom JS to simulate user interactions
        cache_mode=CacheMode.BYPASS # Always request fresh content
    )
    
    intercepted_videos = set()
    
    # Custom Playwright Hook for Network Interception (requests + responses)
    async def log_network_requests(page, context, **kwargs):
        print("\n[Network Hook] Setting up network request interception...")
        def on_request(request):
            req_url = request.url
            if ".mp4" in req_url or ".m3u8" in req_url or ".webm" in req_url or ".mov" in req_url:
                print(f"  -> [Network Intercept VIDEO REQUEST] {req_url[:90]}...")
                intercepted_videos.add(req_url)
        
        def on_response(response):
            content_type = response.headers.get("content-type", "")
            resp_url = response.url
            if "video/" in content_type or "mpegurl" in content_type.lower():
                print(f"  -> [Network Intercept VIDEO RESPONSE] {resp_url[:90]}... (type: {content_type})")
                intercepted_videos.add(resp_url)
        
        page.on("request", on_request)
        page.on("response", on_response)
        return page

    try:
        async with AsyncWebCrawler(config=browser_config) as crawler:
            # Register the network logging / interception hook
            crawler.crawler_strategy.set_hook("on_page_context_created", log_network_requests)
            
            # Run Crawl
            result = await crawler.arun(url=url, config=run_config)
            
            # Ensure outputs folder exists
            os.makedirs("outputs", exist_ok=True)
            
            url_lower = url.lower()
            is_amazon = "amazon.com" in url_lower
            is_app_store = "apps.apple.com" in url_lower or "play.google.com" in url_lower
            
            title = "Unknown Product"
            description = ""
            image = ""
            md_content = ""
            screenshots = []
            videos = []
            
            if is_amazon:
                is_product = "/dp/" in url or "/gp/product/" in url or "/d/" in url
                if is_product:
                    print("\n[Parsing] Detected Amazon Product Detail Page...")
                    parsed_data = parse_amazon_product(result.html, url)
                    md_content = generate_product_markdown(parsed_data)
                else:
                    print("\n[Parsing] Detected Amazon Search/Listing Page...")
                    products = parse_amazon_listing(result.html, url)
                    md_content = generate_listing_markdown(products, url)
                    title = f"Amazon Search Results"
                    description = f"Found {len(products)} products"
                    if products and products[0].get('image'):
                        image = products[0]['image']
                    if products and products[0].get('videos'):
                        videos = products[0].get('videos', [])
                    if products:
                        screenshots = [p['image'] for p in products if p.get('image')]
                if is_product:
                    title = parsed_data.get('title', 'amazon_product')
                    description = parsed_data.get('description', '')
                    images = parsed_data.get('images', [])
                    videos = parsed_data.get('videos', [])
                    if images:
                        image = images[0]
                        screenshots = images
                    
            elif is_app_store:
                print("\n[Parsing] Detected App Store / Google Play Page...")
                from crawlers.app_store import parse_app_store, generate_app_markdown
                parsed_data = parse_app_store(result.html, url, result.media)
                md_content = generate_app_markdown(parsed_data)
                title = parsed_data.get('title', 'app_store_app')
                description = parsed_data.get('description', '')
                screenshots = parsed_data.get('screenshots', [])
                videos = parsed_data.get('videos', [])
                if screenshots:
                    image = screenshots[0]
                
            else:
                print("\n[Parsing] Detected Generic Page...")
                md_content = result.markdown
                title = "Generic Web Page"
                description = ""
                
                # Extract media from crawl4ai's result.media
                if result.media and isinstance(result.media, dict):
                    images_data = result.media.get("images", [])
                    if images_data:
                        # Extract src and filter out empty ones
                        img_urls = [img.get("src") for img in images_data if isinstance(img, dict) and img.get("src")]
                        # Remove duplicates while preserving order
                        seen = set()
                        screenshots = [x for x in img_urls if not (x in seen or seen.add(x))]
                        if screenshots:
                            image = screenshots[0]
                            
                    videos_data = result.media.get("videos", [])
                    if videos_data:
                        vid_urls = [v.get("src") for v in videos_data if isinstance(v, dict) and v.get("src")]
                        seen_vid = set()
                        videos = [x for x in vid_urls if not (x in seen_vid or seen_vid.add(x))]
                
            import urllib.parse
            if image:
                image = urllib.parse.urljoin(url, image)
            screenshots = [urllib.parse.urljoin(url, s) for s in screenshots if s]
            
            # Merge intercepted videos from the network hook
            if intercepted_videos:
                print(f"[Network] Merging {len(intercepted_videos)} intercepted videos into results")
                videos.extend(list(intercepted_videos))
                
            videos = [urllib.parse.urljoin(url, v) for v in videos if v]

            # Write to outputs/result.md ALWAYS
            result_md_path = "outputs/result.md"
            with open(result_md_path, "w", encoding="utf-8") as f:
                f.write(md_content)
            print(f"[SUCCESS] Saved crawl result to {result_md_path}")
            
            # Filter screenshots by dimensions - keep only quality images
            filtered_screenshots = []
            if screenshots:
                from PIL import Image as PILImage
                import io
                print(f"[Image Filter] Checking {len(screenshots)} images for quality...")
                for img_url in screenshots[:15]:
                    try:
                        headers = {'User-Agent': 'Mozilla/5.0'}
                        req_img = urllib.request.Request(img_url, headers=headers)
                        with urllib.request.urlopen(req_img, timeout=10) as response:
                            img_data = response.read()
                            img = PILImage.open(io.BytesIO(img_data))
                            width, height = img.size
                            aspect_ratio = width / max(height, 1)
                            
                            # Keep images: width >= 300, height >= 300, reasonable aspect ratio (especially for mobile screenshots)
                            if width >= 300 and height >= 300 and 0.2 < aspect_ratio < 5.0:
                                filtered_screenshots.append(img_url)
                                
                            if len(filtered_screenshots) >= 8:
                                break
                    except Exception as e:
                        print(f"[Image Filter] Skipped image: {str(e)[:50]}")
                        continue
                print(f"[Image Filter] Kept {len(filtered_screenshots)} quality images")
            # Resolve HLS (.m3u8) URLs to playable MP4 counterparts (especially for Amazon videos)
            resolved_videos = []
            for v in videos:
                if '.hls.m3u8' in v:
                    resolved_videos.append(v.replace('.hls.m3u8', '.mp4.480.mp4'))
                elif '.m3u8' in v:
                    resolved_videos.append(v.replace('.m3u8', '.mp4'))
                else:
                    resolved_videos.append(v)

            # Filter and verify videos — keep only real reachable downloadable URLs
            import concurrent.futures
            
            def check_video_url(v_url):
                try:
                    headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                    req_val = urllib.request.Request(v_url, headers=headers, method='HEAD')
                    with urllib.request.urlopen(req_val, timeout=2.0) as resp:
                        if resp.status in (200, 206):
                            return v_url
                except Exception:
                    try:
                        headers = {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Range': 'bytes=0-100'
                        }
                        req_val = urllib.request.Request(v_url, headers=headers, method='GET')
                        with urllib.request.urlopen(req_val, timeout=2.0) as resp:
                            if resp.status in (200, 206):
                                return v_url
                    except Exception:
                        pass
                return None

            filtered_videos = []
            candidates = [
                v for v in resolved_videos 
                if v and not v.startswith('blob:') and v.startswith(('http://', 'https://'))
            ]
            if candidates:
                print(f"[Video Filter] Verifying {len(candidates)} candidate videos for reachability...")
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    results = executor.map(check_video_url, candidates)
                    for res in results:
                        if res:
                            filtered_videos.append(res)
                print(f"[Video Filter] Kept {len(filtered_videos)} reachable videos out of {len(candidates)}")

            
            # Compute source type and confidence
            source_type = "unknown"
            if is_amazon:
                source_type = "amazon"
            elif is_app_store:
                source_type = "app_store"
            else:
                source_type = "website"
            
            # Simple confidence heuristic based on data completeness
            confidence = 0.5
            if title and title != "Unknown Product" and title != "Generic Web Page":
                confidence += 0.15
            if (filtered_screenshots or screenshots) and len(filtered_screenshots or screenshots) >= 2:
                confidence += 0.15
            if filtered_videos:
                confidence += 0.1
            if md_content and len(md_content) > 200:
                confidence += 0.1
            confidence = min(1.0, confidence)
            
            # Extract reviews if available
            reviews_list = []
            if isinstance(parsed_data, dict):
                reviews_list = parsed_data.get('reviews_list', [])


            return {
                "title": title,
                "description": description,
                "image": image,
                "markdown": md_content,
                "screenshots": filtered_screenshots or screenshots[:8],
                "videos": filtered_videos[:10],
                "sourceType": source_type,
                "confidence": confidence,
                "reviews": reviews_list,
            }
            
    except Exception as e:
        error_msg = str(e) or type(e).__name__
        print(f"[Error during crawl] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/render")
async def render_asset_video(req: RenderRequest):
    try:
        print(f"[Render] Starting video render for: {req.title}")
        output_path = render_video(
            RenderInput(
                title=req.title,
                script=req.script,
                description=req.description,
                image=req.image or None,
                screenshots=req.screenshots or [],
                videos=req.videos or [],
                audio_base64=req.audio_base64,
                audio_url=req.audio_url,
                elevenlabs_api_key=req.elevenlabs_api_key,
                elevenlabs_voice_id=req.elevenlabs_voice_id,
                target_duration=req.target_duration,
                cta_text=req.cta_text or "Tap the link in bio",
            )
        )
        video_url = f"http://127.0.0.1:8000/outputs/renders/{output_path.name}"
        return {
            "videoUrl": video_url,
            "isMock": False,
            "message": "Rendered with ffmpeg storyboard pipeline.",
        }
    except Exception as e:
        error_msg = str(e) or type(e).__name__
        print(f"[Render Error] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/render-structured")
async def render_structured_video(req: StructuredRenderRequest):
    """
    New endpoint: Gemini generates structured script, backend handles everything
    """
    try:
        from services.gemini_service import generate_video_script
        from renderers.structured_renderer import render_video_with_script
        
        print(f"[Structured Render] Generating script with Gemini for: {req.title}")
        
        # Step 1: Call Gemini to generate structured script
        video_script = generate_video_script(
            title=req.title,
            description=req.description,
            markdown=req.markdown,
            screenshots=req.screenshots,
            videos=req.videos,
            tone=req.tone,
            target_duration=req.target_duration,
            gemini_api_key=req.gemini_api_key,
            gemini_model=req.gemini_model,
            custom_notes=req.custom_notes
        )
        
        print(f"[Structured Render] Script generated. Duration: {video_script.total_duration}s, Scenes: {len(video_script.scenes)}")
        
        # Step 2: Render video using structured script
        output_path = render_video_with_script(
            script=video_script,
            cover_image=req.image or None,
            screenshots=req.screenshots,
            videos=req.videos,
            elevenlabs_api_key=req.elevenlabs_api_key,
            title=req.title,
            use_free_tts=req.use_free_tts,
            voice_engine=req.voice_engine,
            kokoro_voice_id=req.kokoro_voice_id,
        )
        
        video_url = f"http://127.0.0.1:8000/outputs/renders/{output_path.name}"
        return {
            "videoUrl": video_url,
            "script": video_script.script_text,
            "duration": video_script.total_duration,
            "voice": video_script.elevenlabs_voice_id,
            "message": "Rendered with Gemini-structured pipeline"
        }
    except Exception as e:
        error_msg = str(e) or type(e).__name__
        print(f"[Structured Render Error] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


@app.post("/voice")
async def generate_voice(req: VoiceRequest):
    try:
        print(f"[Voice] Generating audio for script length: {len(req.script)}")
        result = synthesize_speech_to_base64(
            TtsSynthesisRequest(
                text=req.script,
                engine=req.voice_engine or req.tts_engine or "kokoro",
                elevenlabs_api_key=req.elevenlabs_api_key,
                elevenlabs_voice_id=req.elevenlabs_voice_id,
                kokoro_voice_id=req.kokoro_voice_id,
                scene_subtitles=req.scene_subtitles,
            )
        )
        print("[Voice] Successfully generated audio")
        return result
    except Exception as e:
        error_msg = str(e) or type(e).__name__
        print(f"[Voice Error] {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    # When run directly, start the FastAPI server on port 8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)

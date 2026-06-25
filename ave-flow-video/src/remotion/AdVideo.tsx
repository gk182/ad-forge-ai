import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Video,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  OffthreadVideo,
  useRemotionEnvironment,
} from 'remotion';

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  matched?: boolean;
  isEstimated?: boolean;
  confidence?: number | null;
}
const resolveMediaUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('/cache/')) {
    return staticFile(url.substring(1));
  }
  if (url.startsWith('cache/')) {
    return staticFile(url);
  }
  return url;
};

export interface Scene {
  media_type: 'image' | 'video';
  media_url: string;
  duration: number; // planned duration in seconds
  subtitle: string;
  motion: string; // 'center_zoom' | 'slow_zoom_out' | 'pan_left' | 'pan_right' | 'drift_up' | 'drift_down' | 'ken_burns_tl' | 'ken_burns_br' | 'static'
  transition_type?: 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'zoom_in' | 'none';
  video_start_offset?: number;
  word_timings?: WordTiming[];
  audioUrl?: string;
  audioDuration?: number;

  // Mobile App composition specific fields
  featureLabel?: string;
  featureDescription?: string;
  animation?: 'spring_scale' | 'highlight_pulse' | 'stagger_in' | 'fade_in' | 'slide_up' | 'none';
  transition?: 'fade' | 'slide_left' | 'slide_right' | 'slide_up' | 'zoom_in' | 'none';
}

export interface AdVideoProps {
  title?: string;
  scenes?: Scene[];
  audioUrl?: string;
  audioDuration?: number;
  textColor?: string;
  highlightColor?: string;
  fontFamily?: string;
  layoutType?: 'splitscreen' | 'classic' | 'greenscreen';
  subtitleStyle?: 'bounce' | 'glow' | 'slide_up' | 'rotate' | 'fade';
}

// Media element wrapper applying motion transitions
const SceneMedia: React.FC<{
  scene: Scene;
  durationFrames: number;
  fps: number;
}> = ({ scene, durationFrames, fps }) => {
  const frame = useCurrentFrame();

  const transformStyle = useMemo(() => {
    if (scene.media_type === 'video') return {};

    let scale = 1.0;
    let translateX = 0;
    let translateY = 0;

    switch (scene.motion) {
      case 'center_zoom':
        scale = interpolate(frame, [0, durationFrames], [1.0, 1.15], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'slow_zoom_out':
        scale = interpolate(frame, [0, durationFrames], [1.2, 1.0], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'pan_left':
        scale = 1.15;
        translateX = interpolate(frame, [0, durationFrames], [30, -30], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'pan_right':
        scale = 1.15;
        translateX = interpolate(frame, [0, durationFrames], [-30, 30], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'drift_up':
        scale = 1.15;
        translateY = interpolate(frame, [0, durationFrames], [30, -30], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'drift_down':
        scale = 1.15;
        translateY = interpolate(frame, [0, durationFrames], [-30, 30], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'ken_burns_tl':
        scale = interpolate(frame, [0, durationFrames], [1.0, 1.25], {
          extrapolateRight: 'clamp',
        });
        translateX = interpolate(frame, [0, durationFrames], [0, -40], {
          extrapolateRight: 'clamp',
        });
        translateY = interpolate(frame, [0, durationFrames], [0, -40], {
          extrapolateRight: 'clamp',
        });
        break;
      case 'ken_burns_br':
        scale = interpolate(frame, [0, durationFrames], [1.0, 1.25], {
          extrapolateRight: 'clamp',
        });
        translateX = interpolate(frame, [0, durationFrames], [0, 40], {
          extrapolateRight: 'clamp',
        });
        translateY = interpolate(frame, [0, durationFrames], [0, 40], {
          extrapolateRight: 'clamp',
        });
        break;
      default:
        scale = 1.0;
    }

    return {
      transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
    };
  }, [scene, frame, durationFrames]);

  const env = useRemotionEnvironment();

  const isLikelyVideoUrl = (url: string) => {
    if (!url) return false;
    if (/^data:video\//i.test(url)) return true;
    return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
  };

  if (scene.media_type === 'video' && isLikelyVideoUrl(scene.media_url)) {
    const startFromFrame = Math.round((scene.video_start_offset || 0) * fps);
    const videoUrl = resolveMediaUrl(scene.media_url);

    if (env.isRendering) {
      return (
        <OffthreadVideo
          src={videoUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          trimBefore={startFromFrame}
          muted
        />
      );
    }

    return (
      <Video
        src={videoUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        startFrom={startFromFrame}
        muted
        loop
        delayRenderTimeoutInMilliseconds={120000}
        onError={(err) => {
          console.warn('[Remotion] Video playback error, falling back to static frame.', err);
        }}
      />
    );
  }

  if (scene.media_type === 'video') {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #111827 0%, #000 100%)',
          color: '#fff',
          fontSize: 28,
          fontWeight: 700,
          textAlign: 'center',
          padding: '48px',
        }}
      >
        Video unavailable
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Blurred background for padding */}
      <Img
        src={resolveMediaUrl(scene.media_url)}
        style={{
          position: 'absolute',
          width: '120%',
          height: '120%',
          left: '-10%',
          top: '-10%',
          objectFit: 'cover',
          filter: 'blur(40px) brightness(0.4)',
          ...transformStyle,
        }}
      />
      {/* Foreground image (not stretched, keeps aspect ratio) */}
      <Img
        src={resolveMediaUrl(scene.media_url)}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          ...transformStyle,
        }}
      />
    </div>
  );
};

// Word-level karaoke subtitles with progressive fill inside each spoken word.
const KaraokeSubtitles: React.FC<{
  text: string;
  textColor: string;
  highlightColor: string;
  durationFrames: number;
  alignedWordTimings?: WordTiming[];
  animationStyle?: 'bounce' | 'glow' | 'slide_up' | 'rotate' | 'fade';
}> = ({ text, textColor, highlightColor, durationFrames, alignedWordTimings, animationStyle = 'bounce' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  const wordTimings = useMemo(() => {
    if (Array.isArray(alignedWordTimings) && alignedWordTimings.length > 0) {
      return alignedWordTimings.map((timing) => ({
        word: timing.word,
        start: timing.start * fps,
        end: timing.end * fps,
        matched: timing.matched !== false,
        isEstimated: Boolean(timing.isEstimated),
      }));
    }
    // Longer words should occupy more duration. Base weight = 2 + char length
    const weights = words.map((w) => w.length + 2);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let accumulatedFrames = 0;
    return words.map((word, idx) => {
      const wordWeight = weights[idx];
      const wordDuration = (wordWeight / (totalWeight || 1)) * durationFrames;
      const start = accumulatedFrames;
      const end = accumulatedFrames + wordDuration;
      accumulatedFrames = end;
      return { word, start, end, matched: true, isEstimated: false };
    });
  }, [words, durationFrames, alignedWordTimings, fps]);

  // Group word timings into sequential lines (chunks)
  // Split whenever:
  // 1. Current chunk has 3-4 words (limit to 4 words max)
  // 2. Or total characters in the current line exceeds 24 characters
  const chunks = useMemo(() => {
    const list: typeof wordTimings[] = [];
    let currentChunk: typeof wordTimings = [];
    let currentChars = 0;

    wordTimings.forEach((wt) => {
      if (currentChunk.length >= 4 || currentChars + wt.word.length > 24) {
        if (currentChunk.length > 0) {
          list.push(currentChunk);
        }
        currentChunk = [wt];
        currentChars = wt.word.length;
      } else {
        currentChunk.push(wt);
        currentChars += wt.word.length + 1; // +1 for space
      }
    });

    if (currentChunk.length > 0) {
      list.push(currentChunk);
    }
    return list;
  }, [wordTimings]);

  // Group chunks into pages of 2 lines
  const pages = useMemo(() => {
    const list = [];
    for (let i = 0; i < chunks.length; i += 2) {
      const page = [];
      if (chunks[i]) page.push(chunks[i]);
      if (chunks[i + 1]) page.push(chunks[i + 1]);
      list.push(page);
    }
    return list;
  }, [chunks]);

  // Find the active page based on the current frame
  const activePage = useMemo(() => {
    if (pages.length === 0) return [];
    const active = pages.find((page) => {
      if (page.length === 0) return false;
      const firstChunk = page[0];
      const lastChunk = page[page.length - 1];
      if (firstChunk.length === 0 || lastChunk.length === 0) return false;
      const pageStart = firstChunk[0].start;
      const pageEnd = lastChunk[lastChunk.length - 1].end;
      return frame >= pageStart && frame < pageEnd;
    });
    if (active) return active;
    return pages[0];
  }, [pages, frame]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 40px',
        textAlign: 'center',
        width: '100%',
      }}
    >
      {activePage.map((chunk, chunkIdx) => (
        <div
          key={chunkIdx}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {chunk.map(({ word, start, end, matched, isEstimated }, originalIdx) => {
            const safeDuration = Math.max(1, end - start);
            const progress = frame <= start
              ? 0
              : frame >= end
                ? 1
                : (frame - start) / safeDuration;
            const isActive = progress > 0 && progress < 1;
            let transform = 'scale(1.0)';
            let opacity = 1.0;
            let textGlow = '';
            let filter = 'none';

            if (isActive) {
              const age = frame - start;

              switch (animationStyle) {
                case 'bounce':
                  const scaleVal = interpolate(age, [0, 3], [1.0, 1.15], {
                    extrapolateRight: 'clamp',
                  });
                  transform = `scale(${scaleVal})`;
                  break;
                case 'slide_up':
                  const translateY = interpolate(age, [0, 4], [15, -10], {
                    extrapolateRight: 'clamp',
                  });
                  const finalY = age > 4
                    ? interpolate(age - 4, [0, 4], [-10, 0], { extrapolateRight: 'clamp' })
                    : translateY;
                  transform = `translateY(${finalY}px) scale(1.1)`;
                  break;
                case 'rotate':
                  const angle = originalIdx % 2 === 0 ? -6 : 6;
                  const currentAngle = interpolate(age, [0, 3], [0, angle], {
                    extrapolateRight: 'clamp',
                  });
                  transform = `rotate(${currentAngle}deg) scale(1.15)`;
                  break;
                case 'glow':
                  const pulseScale = interpolate(age, [0, 4], [1.0, 1.2], {
                    extrapolateRight: 'clamp',
                  });
                  transform = `scale(${pulseScale})`;
                  textGlow = `0 0 20px ${highlightColor}`;
                  break;
                case 'fade':
                  transform = 'scale(1.05)';
                  break;
              }
            } else {
              // If fade style, reduce opacity of inactive words
              if (animationStyle === 'fade') {
                opacity = 0.45;
              } else {
                opacity = 0.9;
              }
            }

            if (isEstimated && !matched) {
              filter = 'saturate(0.9)';
            }

            return (
              <span
                key={originalIdx}
                style={{
                  display: 'inline-flex',
                  position: 'relative',
                  margin: '8px 18px',
                  fontSize: '64px',
                  fontWeight: 900,
                  transform,
                  transformOrigin: 'center center',
                  opacity,
                  filter,
                  textShadow: textGlow
                    ? `0 0 20px ${highlightColor}, -4px -4px 0 #000, 4px -4px 0 #000, -4px 4px 0 #000, 4px 4px 0 #000`
                    : `
                    -4px -4px 0 #000,  
                     4px -4px 0 #000,
                    -4px  4px 0 #000,
                     4px  4px 0 #000,
                     0px  4px 8px rgba(0,0,0,0.8)
                  `,
                  transition: 'transform 0.08s ease-out, color 0.05s ease-in-out, opacity 0.1s ease',
                }}
              >
                <span
                  style={{
                    color: textColor,
                    display: 'inline-block',
                  }}
                >
                  {word}
                </span>
                <span
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    color: highlightColor,
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ display: 'inline-block' }}>{word}</span>
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Scene container applying transition styles
const SceneContainer: React.FC<{
  scene: Scene;
  nextScene?: Scene;
  durationFrames: number;
  transitionDuration: number;
  idx: number;
  textColor: string;
  highlightColor: string;
  fontFamily: string;
  layoutType: 'splitscreen' | 'classic' | 'greenscreen';
  subtitleStyle?: 'bounce' | 'glow' | 'slide_up' | 'rotate' | 'fade';
  fps: number;
}> = ({
  scene,
  nextScene,
  durationFrames,
  transitionDuration,
  idx,
  textColor,
  highlightColor,
  fontFamily,
  layoutType,
  subtitleStyle = 'bounce',
  fps,
}) => {
    const frame = useCurrentFrame();
    const env = useRemotionEnvironment();

    const transitionStyle = useMemo(() => {
      // 1. Entry Transition (first 15 frames, if not first scene)
      if (frame < transitionDuration && idx > 0) {
        const transType = scene.transition_type || 'fade';
        if (transType === 'none') return {};

        const t = interpolate(frame, [0, transitionDuration], [0, 1], {
          extrapolateRight: 'clamp',
        });

        switch (transType) {
          case 'fade':
            return { opacity: t };
          case 'slide_left':
            return { transform: `translateX(${interpolate(t, [0, 1], [1080, 0])}px)` };
          case 'slide_right':
            return { transform: `translateX(${interpolate(t, [0, 1], [-1080, 0])}px)` };
          case 'slide_up':
            return { transform: `translateY(${interpolate(t, [0, 1], [1920, 0])}px)` };
          case 'slide_down':
            return { transform: `translateY(${interpolate(t, [0, 1], [-1920, 0])}px)` };
          case 'zoom_in':
            return {
              transform: `scale(${interpolate(t, [0, 1], [0.4, 1.0])})`,
              opacity: t,
            };
          default:
            return {};
        }
      }

      // 2. Exit Transition (last 15 frames, if not last scene)
      const exitFrame = frame - durationFrames;
      if (exitFrame >= 0 && nextScene) {
        const nextTransType = nextScene.transition_type || 'fade';
        if (nextTransType === 'none') return {};

        const t = interpolate(exitFrame, [0, transitionDuration], [0, 1], {
          extrapolateRight: 'clamp',
        });

        switch (nextTransType) {
          case 'fade':
            return { opacity: interpolate(t, [0, 1], [1, 0]) };
          case 'slide_left':
            return { transform: `translateX(${interpolate(t, [0, 1], [0, -1080])}px)` };
          case 'slide_right':
            return { transform: `translateX(${interpolate(t, [0, 1], [0, 1080])}px)` };
          case 'slide_up':
            return { transform: `translateY(${interpolate(t, [0, 1], [0, -1920])}px)` };
          case 'slide_down':
            return { transform: `translateY(${interpolate(t, [0, 1], [0, 1920])}px)` };
          case 'zoom_in':
            return {
              transform: `scale(${interpolate(t, [0, 1], [1.0, 1.6])})`,
              opacity: interpolate(t, [0, 1], [1, 0]),
            };
          default:
            return {};
        }
      }

      return {};
    }, [frame, durationFrames, transitionDuration, idx, scene.transition_type, nextScene]);

    return (
      <AbsoluteFill
        style={{
          overflow: 'hidden',
          ...transitionStyle,
        }}
      >
        {/* Ambient Blurred Background (Removes black sides for mismatching formats) */}
        {layoutType === 'splitscreen' && (
          <div
            style={{
              position: 'absolute',
              width: '120%',
              height: '120%',
              top: '-10%',
              left: '-10%',
              filter: 'blur(40px) brightness(0.4)',
              opacity: 0.7,
              transform: 'scale(1.1)',
            }}
          >
            {scene.media_type === 'video' ? (
              env.isRendering ? (
                <OffthreadVideo
                  src={resolveMediaUrl(scene.media_url)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                />
              ) : (
                <Video
                  src={resolveMediaUrl(scene.media_url)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                  loop
                  delayRenderTimeoutInMilliseconds={120000}
                />
              )
            ) : (
              <Img
                src={resolveMediaUrl(scene.media_url)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        )}

        {/* Main Content Area (Respects layouts) */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: layoutType === 'splitscreen' ? '120px 40px' : '0',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              borderRadius: layoutType === 'splitscreen' ? '24px' : '0px',
              boxShadow:
                layoutType === 'splitscreen'
                  ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                  : 'none',
              border:
                layoutType === 'splitscreen'
                  ? '2px solid rgba(255,255,255,0.1)'
                  : 'none',
            }}
          >
            <SceneMedia scene={scene} durationFrames={durationFrames} fps={fps} />
          </div>
        </div>

        {/* Dark gradient vignette overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '45%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* 3. Subtitles (Only render in active zone, not in extended transition overlap) */}
        {frame < durationFrames && (
          <div
            style={{
              position: 'absolute',
              bottom: layoutType === 'splitscreen' ? '180px' : '220px',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <KaraokeSubtitles
              text={scene.subtitle}
              textColor={textColor}
              highlightColor={highlightColor}
              durationFrames={durationFrames}
              alignedWordTimings={scene.word_timings}
              animationStyle={subtitleStyle}
            />
          </div>
        )}
      </AbsoluteFill>
    );
  };

export const AdVideo: React.FC<AdVideoProps> = ({
  title = '',
  scenes = [],
  audioUrl,
  audioDuration,
  textColor = '#ffffff',
  highlightColor = '#facc15',
  fontFamily = 'Montserrat',
  layoutType = 'classic',
  subtitleStyle = 'bounce',
}) => {
  const { fps } = useVideoConfig();

  // Load custom google font if available in browser context
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
          /\s+/g,
          '+'
        )}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      } catch (e) {
        console.warn('Google Font loading failed:', e);
      }
    }
  }, [fontFamily]);

  // Calculate actual duration of all scenes combined
  const totalPlannedDuration = useMemo(() => {
    return scenes.reduce((sum, scene) => {
      const sceneDur = (audioUrl === 'per-scene' && scene.audioDuration)
        ? Math.max(scene.duration, scene.audioDuration)
        : scene.duration;
      return sum + sceneDur;
    }, 0);
  }, [scenes, audioUrl]);

  // Scaling factor to match audio duration
  const scaleFactor = useMemo(() => {
    if (audioUrl === 'per-scene') return 1;
    if (!audioDuration || totalPlannedDuration === 0) return 1;
    return audioDuration / totalPlannedDuration;
  }, [audioDuration, totalPlannedDuration, audioUrl]);

  // Compute timing for each scene sequence, supporting overlaps
  const sceneTimings = useMemo(() => {
    let currentFrame = 0;
    const transitionFrames = 15; // 0.5 seconds transition

    return scenes.map((scene, idx) => {
      const scenePlannedDuration = (audioUrl === 'per-scene' && scene.audioDuration)
        ? Math.max(scene.duration, scene.audioDuration)
        : scene.duration;

      const durationFrames = Math.max(
        30, // Minimum 1 second per scene
        Math.round(scenePlannedDuration * scaleFactor * fps)
      );

      const startFrame = currentFrame;
      // Normal frame pointer progression
      currentFrame += durationFrames;

      const isLast = idx === scenes.length - 1;
      // Extend the sequence to run into the next sequence's transition window
      const sequenceDuration = durationFrames + (isLast ? 0 : transitionFrames);

      return {
        startFrame,
        durationFrames,
        sequenceDuration,
        scene,
      };
    });
  }, [scenes, scaleFactor, fps, audioUrl]);

  const frame = useCurrentFrame();
  // Total frames is the end of the last scene
  const totalFrames = sceneTimings.length > 0
    ? sceneTimings[sceneTimings.length - 1].startFrame + sceneTimings[sceneTimings.length - 1].durationFrames
    : 1;

  // Bottom progress bar width
  const progressWidth = `${(frame / totalFrames) * 100}%`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#050508',
        fontFamily: `"${fontFamily}", system-ui, sans-serif`,
        overflow: 'hidden',
      }}
    >
      {/* 1. Background Music/Voiceover Track */}
      {audioUrl && audioUrl !== 'per-scene' && <Audio src={resolveMediaUrl(audioUrl)} />}

      {/* 2. Media Layers */}
      {sceneTimings.map(({ startFrame, durationFrames, sequenceDuration, scene }, idx) => {
        const nextScene = scenes[idx + 1];
        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={sequenceDuration}
          >
            {scene.audioUrl && <Audio src={resolveMediaUrl(scene.audioUrl)} />}
            <SceneContainer
              scene={scene}
              nextScene={nextScene}
              durationFrames={durationFrames}
              transitionDuration={15}
              idx={idx}
              textColor={textColor}
              highlightColor={highlightColor}
              fontFamily={fontFamily}
              layoutType={layoutType}
              subtitleStyle={subtitleStyle}
              fps={fps}
            />
          </Sequence>
        );
      })}

      {/* 4. Sleek Top Header Label */}
      {title && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 10,
            padding: '0 40px',
          }}
        >
          <div
            style={{
              background: 'rgba(5, 5, 8, 0.75)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '9999px',
              padding: '16px 36px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
            }}
          >
            <span
              style={{
                color: '#ffffff',
                fontSize: '32px',
                fontWeight: 800,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {title}
            </span>
          </div>
        </div>
      )}

      {/* 5. Progress Bar at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          zIndex: 20,
        }}
      >
        <div
          style={{
            height: '100%',
            width: progressWidth,
            background: `linear-gradient(to right, ${highlightColor}, #ef4444)`,
            boxShadow: `0 0 10px ${highlightColor}`,
            transition: 'width 0.1s linear',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

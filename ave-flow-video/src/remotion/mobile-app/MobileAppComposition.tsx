import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from 'remotion';
import { MobileAppVideoProps, MobileAppScene, MobileAppPreset } from './types';
import { GradientBackground } from './GradientBackground';
import { MobilePhoneMockup } from './MobilePhoneMockup';
import { OutroCTAScene } from './OutroCTAScene';

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

// Word-level karaoke subtitles (rebuilt specifically for the mobile vertical / horizontal layout)
const MobileKaraokeSubtitles: React.FC<{
  text: string;
  textColor: string;
  highlightColor: string;
  durationFrames: number;
  alignedWordTimings?: Array<{ word: string; start: number; end: number }>;
  fps: number;
}> = ({ text, textColor, highlightColor, durationFrames, alignedWordTimings, fps }) => {
  const frame = useCurrentFrame();
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);

  const wordTimings = useMemo(() => {
    if (Array.isArray(alignedWordTimings) && alignedWordTimings.length > 0) {
      return alignedWordTimings.map((timing) => ({
        word: timing.word,
        start: timing.start * fps,
        end: timing.end * fps,
      }));
    }
    const weights = words.map((w) => w.length + 2);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    let accumulatedFrames = 0;
    return words.map((word, idx) => {
      const wordWeight = weights[idx];
      const wordDuration = (wordWeight / (totalWeight || 1)) * durationFrames;
      const start = accumulatedFrames;
      const end = accumulatedFrames + wordDuration;
      accumulatedFrames = end;
      return { word, start, end };
    });
  }, [words, durationFrames, alignedWordTimings, fps]);

  // Group chunks into 4-word segments
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
        currentChars += wt.word.length + 1;
      }
    });

    if (currentChunk.length > 0) {
      list.push(currentChunk);
    }
    return list;
  }, [wordTimings]);

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
          {chunk.map(({ word, start, end }, originalIdx) => {
            const safeDuration = Math.max(1, end - start);
            const progress =
              frame <= start ? 0 : frame >= end ? 1 : (frame - start) / safeDuration;
            const isActive = progress > 0 && progress < 1;
            const scaleVal = isActive
              ? interpolate(frame - start, [0, 3], [1.0, 1.15], {
                  extrapolateRight: 'clamp',
                })
              : 1.0;

            return (
              <span
                key={originalIdx}
                style={{
                  display: 'inline-flex',
                  position: 'relative',
                  margin: '6px 14px',
                  fontSize: '44px',
                  fontWeight: 900,
                  transform: `scale(${scaleVal})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.08s ease-out',
                  textShadow: `
                    -3px -3px 0 #000,  
                     3px -3px 0 #000,
                    -3px  3px 0 #000,
                     3px  3px 0 #000,
                     0px  4px 6px rgba(0,0,0,0.8)
                  `,
                }}
              >
                <span style={{ color: textColor }}>{word}</span>
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
                  <span>{word}</span>
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Scene container applying custom transitions
const SceneContainer: React.FC<{
  scene: MobileAppScene;
  nextScene?: MobileAppScene;
  durationFrames: number;
  transitionDuration: number;
  idx: number;
  textColor: string;
  highlightColor: string;
  primaryColor: string;
  secondaryColor: string;
  fps: number;
  preset: MobileAppPreset;
  allScreenshots: string[];
  logoUrl?: string;
  isLastScene: boolean;
  appName: string;
  tagline: string;
}> = ({
  scene,
  nextScene,
  durationFrames,
  transitionDuration,
  idx,
  textColor,
  highlightColor,
  primaryColor,
  secondaryColor,
  fps,
  preset,
  allScreenshots,
  logoUrl,
  isLastScene,
  appName,
  tagline,
}) => {
  const frame = useCurrentFrame();

  const transitionStyle = useMemo(() => {
    // 1. Entry Transition (first 15 frames, if not first scene)
    if (frame < transitionDuration && idx > 0) {
      const transType = scene.transition || 'fade';
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
      const nextTransType = nextScene.transition || 'fade';
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
  }, [frame, durationFrames, transitionDuration, idx, scene.transition, nextScene]);

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...transitionStyle,
      }}
    >
      {isLastScene ? (
        <OutroCTAScene
          appName={appName}
          tagline={tagline}
          logoUrl={logoUrl}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
        />
      ) : (
        <MobilePhoneMockup
          imageUrl={resolveMediaUrl(scene.imageUrl)}
          animationType={scene.animation}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          featureLabel={scene.featureLabel}
          featureDescription={scene.featureDescription}
          preset={preset}
          sceneIndex={idx}
          durationFrames={durationFrames}
          allScreenshots={allScreenshots}
        />
      )}

      {/* Karaoke Subtitles */}
      {frame < durationFrames && (
        <div
          style={{
            position: 'absolute',
            bottom: isLastScene ? '250px' : '100px',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <MobileKaraokeSubtitles
            text={scene.subtitle}
            textColor={textColor}
            highlightColor={highlightColor}
            durationFrames={durationFrames}
            alignedWordTimings={scene.word_timings}
            fps={fps}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// Fallback Default Scenes if the AI response or input scenes are missing/incomplete
const DEFAULT_SCENES: MobileAppScene[] = [
  {
    imageUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=600&q=80',
    duration: 4,
    subtitle: 'Welcome to your beautiful new mobile app.',
    featureLabel: 'Overview',
    featureDescription: 'A revolutionary experience awaits you on mobile.',
    animation: 'spring_scale',
    transition: 'fade',
  },
  {
    imageUrl: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=600&q=80',
    duration: 4,
    subtitle: 'Discover state of the art feature integrations.',
    featureLabel: 'Features',
    featureDescription: 'Unleash the full power of automation and AI.',
    animation: 'highlight_pulse',
    transition: 'slide_left',
  },
];

export const MobileAppComposition: React.FC<MobileAppVideoProps> = ({
  appName = 'App Studio',
  tagline = 'Generate video ad in seconds',
  logoUrl,
  scenes = [],
  audioUrl,
  audioDuration,
  primaryColor = '#6366f1',
  secondaryColor = '#ec4899',
  textColor = '#ffffff',
  fontFamily = 'Outfit',
  preset = 'hero_floating',
}) => {
  const { fps } = useVideoConfig();

  // Load font dynamically
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
          /\s+/g,
          '+'
        )}:wght@400;700;800;900&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
      } catch (e) {
        console.warn('Font loading failed:', e);
      }
    }
  }, [fontFamily]);

  // Robust fallback: if scenes list is empty, use default mock scenes
  const finalScenes = useMemo(() => {
    return scenes.length > 0 ? scenes : DEFAULT_SCENES;
  }, [scenes]);

  // Calculate timelines
  const totalPlannedDuration = useMemo(() => {
    return finalScenes.reduce((sum, scene) => sum + scene.duration, 0);
  }, [finalScenes]);

  const scaleFactor = useMemo(() => {
    if (!audioDuration || totalPlannedDuration === 0) return 1;
    return audioDuration / totalPlannedDuration;
  }, [audioDuration, totalPlannedDuration]);

  const sceneTimings = useMemo(() => {
    let currentFrame = 0;
    const transitionFrames = 15; // 0.5s transition overlay

    return finalScenes.map((scene, idx) => {
      const durationFrames = Math.max(
        30,
        Math.round(scene.duration * scaleFactor * fps)
      );

      const startFrame = currentFrame;
      currentFrame += durationFrames;

      const isLast = idx === finalScenes.length - 1;
      const sequenceDuration = durationFrames + (isLast ? 0 : transitionFrames);

      return {
        startFrame,
        durationFrames,
        sequenceDuration,
        scene,
      };
    });
  }, [finalScenes, scaleFactor, fps]);

  const frame = useCurrentFrame();
  const totalFrames =
    sceneTimings.length > 0
      ? sceneTimings[sceneTimings.length - 1].startFrame +
        sceneTimings[sceneTimings.length - 1].durationFrames
      : 100;

  const progressWidth = `${(frame / totalFrames) * 100}%`;

  // Gather all screenshots to display on secondary devices (such as cascade, wall, explosion)
  const allScreenshots = useMemo(() => {
    return finalScenes.map((s) => resolveMediaUrl(s.imageUrl));
  }, [finalScenes]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#07070b',
        fontFamily: `"${fontFamily}", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
        overflow: 'hidden',
      }}
    >
      {/* Dynamic backdrop gradient */}
      <GradientBackground
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        durationFrames={totalFrames}
        preset={preset}
      />

      {/* Main Music/Audio track if specified */}
      {audioUrl && <Audio src={resolveMediaUrl(audioUrl)} />}

      {/* Render Scenes sequentially */}
      {sceneTimings.map(({ startFrame, durationFrames, sequenceDuration, scene }, idx) => {
        const nextScene = finalScenes[idx + 1];
        const isLastScene = idx === finalScenes.length - 1;
        return (
          <Sequence
            key={idx}
            from={startFrame}
            durationInFrames={sequenceDuration}
          >
            <SceneContainer
              scene={scene}
              nextScene={nextScene}
              durationFrames={durationFrames}
              transitionDuration={15}
              idx={idx}
              textColor={textColor}
              highlightColor="#facc15" // Yellow highlight text
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              fps={fps}
              preset={preset}
              allScreenshots={allScreenshots}
              logoUrl={logoUrl}
              isLastScene={isLastScene}
              appName={appName}
              tagline={tagline}
            />
          </Sequence>
        );
      })}

      {/* Header Overlay showing App Info */}
      {frame < (sceneTimings[sceneTimings.length - 1]?.startFrame || 0) && (
        <div
          style={{
            position: 'absolute',
            top: '50px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 10,
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 900,
              color: '#ffffff',
              margin: 0,
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            {appName}
          </h1>
          {tagline && (
            <p
              style={{
                fontSize: '18px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.65)',
                margin: '5px 0 0 0',
              }}
            >
              {tagline}
            </p>
          )}
        </div>
      )}

      {/* Global Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '10px',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          zIndex: 20,
        }}
      >
        <div
          style={{
            height: '100%',
            width: progressWidth,
            background: `linear-gradient(to right, ${primaryColor}, ${secondaryColor})`,
            boxShadow: `0 0 10px ${primaryColor}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

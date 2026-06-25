import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, AbsoluteFill } from 'remotion';
import { MobileAnimationType, MobileAppPreset } from './types';
import { useHighlightPulse, useSpringScale, useSlideUp } from './animations';

interface MobilePhoneMockupProps {
  imageUrl: string;
  animationType: MobileAnimationType;
  primaryColor?: string;
  secondaryColor?: string;
  featureLabel?: string;
  featureDescription?: string;
  preset?: MobileAppPreset;
  sceneIndex?: number;
  durationFrames?: number;
  allScreenshots?: string[];
}

interface SinglePhoneBezelProps {
  imageUrl: string;
  bezelStyle: React.CSSProperties;
  spotlightStyle?: React.CSSProperties;
  showGlare?: boolean;
  showGrid?: boolean;
  primaryColor: string;
  animationType?: MobileAnimationType;
  glowOpacity?: number;
  preset?: MobileAppPreset;
  sceneIndex?: number;
  frame?: number;
  durationFrames?: number;
}

const SinglePhoneBezel: React.FC<SinglePhoneBezelProps> = ({
  imageUrl,
  bezelStyle,
  spotlightStyle = { width: '100%', height: '100%', objectFit: 'cover' },
  showGlare = false,
  showGrid = false,
  primaryColor,
  animationType,
  glowOpacity = 0,
  preset = 'hero_floating',
  sceneIndex = 0,
  frame = 0,
  durationFrames = 120,
}) => {
  return (
    <div
      style={{
        width: '380px',
        height: '760px',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...bezelStyle,
      }}
    >
      {/* Dynamic Island / Notch */}
      <div
        style={{
          position: 'absolute',
          top: '15px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '110px',
          height: '28px',
          background: '#000000',
          borderRadius: '20px',
          zIndex: 30,
          border: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      />

      {/* Screenshot / Screen Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <img
          src={imageUrl}
          alt="App Screenshot"
          style={spotlightStyle}
        />

        {/* Premium luxury metallic screen glare reflection */}
        {showGlare && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.08) 50%, transparent 60%)',
              transform: `translateX(${interpolate(frame, [0, durationFrames], [-100, 200])}%)`,
              pointerEvents: 'none',
              zIndex: 25,
            }}
          />
        )}

        {/* Blueprint tech grid overlay */}
        {showGrid && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(99, 102, 241, 0.05) 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              mixBlendMode: 'color-dodge',
              pointerEvents: 'none',
              zIndex: 22,
            }}
          />
        )}

        {/* Pulsing Highlight Pulse Overlay (if highlighted) */}
        {animationType === 'highlight_pulse' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              border: `4px solid ${primaryColor}`,
              borderRadius: '36px',
              boxShadow: `inset 0 0 30px ${primaryColor}`,
              opacity: glowOpacity,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
        )}

        {/* Feature Spotlight indicator ring */}
        {preset === 'feature_spotlight' && (
          <div
            style={{
              position: 'absolute',
              top: sceneIndex % 3 === 0 ? '15%' : sceneIndex % 3 === 1 ? '50%' : '85%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '160px',
              height: '160px',
              border: `4px solid #facc15`,
              borderRadius: '50%',
              boxShadow: `0 0 25px #facc15, inset 0 0 25px #facc15`,
              pointerEvents: 'none',
              zIndex: 28,
              opacity: interpolate(frame, [15, 30, 45, 60], [0, 0.8, 0.3, 0], { extrapolateRight: 'clamp' }),
            }}
          />
        )}
      </div>
    </div>
  );
};

export const MobilePhoneMockup: React.FC<MobilePhoneMockupProps> = ({
  imageUrl,
  animationType,
  primaryColor = '#6366f1',
  secondaryColor = '#ec4899',
  featureLabel,
  featureDescription,
  preset = 'hero_floating',
  sceneIndex = 0,
  durationFrames = 120,
  allScreenshots = [],
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1. Entrance Progress
  const entranceProgress = spring({
    frame,
    fps,
    config: { damping: 15, mass: 0.8, stiffness: 90 },
  });

  // 2. Extra animations based on animationType
  const scaleBonus = useSpringScale({ delay: 10, from: 0.95, to: 1.0, damping: 10 });
  const { scale: pulseScale, glowOpacity } = useHighlightPulse({
    delay: 30,
    minScale: 1.0,
    maxScale: 1.04,
  });

  // 3. Preset-specific animations (rotations, scales, positioning)
  const presetAnimations = useMemo(() => {
    let rx = 0;
    let ry = 0;
    let rz = 0;
    let s = 1.0;
    let tx = 0;
    let ty = 0;

    switch (preset) {
      case 'orbit_reveal': {
        // Y-rotation sweeps continuously Y-rotation from -18° to 18°
        ry = interpolate(frame, [0, durationFrames], [-18, 18]);
        // Slow dolly zoom-in camera style
        s = interpolate(frame, [0, durationFrames], [0.92, 1.06]);
        break;
      }

      case 'screenshot_cascade': {
        // Subtle drift rotation and group bobbing
        ry = Math.sin(frame * 0.04) * 4;
        rx = 6;
        ty = Math.cos(frame * 0.06) * 6;
        s = interpolate(frame, [0, durationFrames], [0.9, 1.02]);
        break;
      }

      case 'tiktok_hook': {
        // Fast snap entry
        const snap = spring({
          frame: frame - 10,
          fps,
          config: { damping: 11, mass: 0.6, stiffness: 140 },
        });
        s = interpolate(snap, [0, 1], [0.4, 1.0]);
        ry = interpolate(snap, [0, 1], [-20, 0]);
        ty = Math.sin(frame * 0.08) * 8;
        break;
      }

      case 'phone_wall': {
        // Wall subtle look-around pan
        ry = Math.sin(frame * 0.03) * 5;
        rx = 4;
        s = 0.98 + Math.sin(frame * 0.05) * 0.02;
        break;
      }

      case 'phone_explosion': {
        // Explosion drift
        ry = interpolate(frame, [0, durationFrames], [-10, 10]);
        rx = 6;
        s = interpolate(frame, [0, durationFrames], [0.92, 1.03]);
        break;
      }

      case 'blueprint_style': {
        // Tech blueprint layout: slightly rotated orthographic flat blueprint angle
        rx = 20;
        ry = -15;
        rz = -4;
        s = interpolate(frame, [0, durationFrames], [0.95, 1.02]);
        break;
      }

      case 'ai_assistant': {
        // Dynamic hover
        ty = Math.sin(frame * 0.06) * 10;
        ry = Math.sin(frame * 0.04) * 6;
        s = 0.98 + Math.sin(frame * 0.05) * 0.02;
        break;
      }

      case 'feature_spotlight': {
        // Pan & zoom: phone shifts slightly, content zooms in
        s = interpolate(entranceProgress, [0, 1], [0.85, 1.0]);
        ry = interpolate(entranceProgress, [0, 1], [10, 0]);
        break;
      }

      case 'premium_luxury': {
        // Very slow, smooth orbit sweep
        ry = interpolate(frame, [0, durationFrames], [-8, 8]);
        rx = Math.sin(frame * 0.03) * 3;
        s = interpolate(frame, [0, durationFrames], [0.96, 1.04]);
        break;
      }

      case 'floating_cards': {
        // Tilted phone to leave room for card overlays
        ry = -12;
        rx = 8;
        ty = Math.sin(frame * 0.05) * 8;
        s = 0.98;
        break;
      }

      case 'cinematic_reveal': {
        // Rises from lower frame
        ty = interpolate(entranceProgress, [0, 1], [40, 0]);
        ry = interpolate(frame, [0, durationFrames], [-15, 8]);
        rx = 5;
        s = interpolate(frame, [0, durationFrames], [0.92, 1.04]);
        break;
      }

      case 'front_flat': {
        // Flat, front-facing phone: no 3D rotation, scaled up for zoom focus
        const bob = Math.sin(frame * 0.08) * 8;
        ty = bob;
        rx = 0;
        ry = 0;
        rz = 0;
        s = interpolate(frame, [0, durationFrames], [1.25, 1.35]);
        break;
      }

      case 'hero_floating':
      default: {
        // Classic floating Apple style: tilt Y by 15deg and bob gently Y
        const bob = Math.sin(frame * 0.08) * 10;
        ty = bob;
        ry = 14 + Math.sin(frame * 0.05) * 1.5;
        s = interpolate(frame, [0, durationFrames], [0.94, 1.04]);
        break;
      }
    }

    return { rx, ry, rz, s, tx, ty };
  }, [frame, durationFrames, preset, fps, entranceProgress]);

  // Combine scaling factors
  const finalScale = useMemo(() => {
    let s = presetAnimations.s;
    if (animationType === 'spring_scale') {
      s = s * scaleBonus;
    } else if (animationType === 'highlight_pulse') {
      s = s * pulseScale;
    }
    // Respect entrance progress for overall visibility (except TikTok which has custom snap entry)
    if (preset !== 'tiktok_hook') {
      const entranceScale = interpolate(entranceProgress, [0, 1], [0.85, 1]);
      s = s * entranceScale;
    }
    return s;
  }, [presetAnimations.s, animationType, scaleBonus, pulseScale, entranceProgress, preset]);

  const opacity = useMemo(() => {
    if (preset === 'tiktok_hook') {
      return interpolate(frame, [10, 20], [0, 1], { extrapolateLeft: 'clamp' });
    }
    return interpolate(entranceProgress, [0, 1], [0, 1]);
  }, [entranceProgress, preset, frame]);

  // Dynamic shadow X-offset based on rotateY
  const shadowDx = useMemo(() => {
    return interpolate(presetAnimations.ry, [-25, 25], [25, -25]);
  }, [presetAnimations.ry]);

  const filterId = useMemo(() => `phone-shadow-${Math.random().toString(36).substring(2, 9)}`, []);

  // Text entrance animation
  const textEntrance = useSlideUp({ delay: 18, distance: 30 });

  // Feature spotlight panning/zooming coordinates inside screenshot
  const spotlightStyle = useMemo(() => {
    if (preset !== 'feature_spotlight') {
      return {
        width: '100%',
        height: '100%',
        objectFit: 'cover' as const,
        transition: 'transform 0.5s ease-out',
      };
    }

    // Spotlight pans coordinates per scene (upper, center, lower)
    const pos = sceneIndex % 3;
    let transformOrigin = '50% 50%';
    let zoomScale = 1.35;

    if (pos === 0) {
      // Focus Top Area
      transformOrigin = '50% 15%';
    } else if (pos === 1) {
      // Focus Middle
      transformOrigin = '50% 50%';
    } else {
      // Focus Bottom CTA
      transformOrigin = '50% 85%';
    }

    // Slowly increase zoom during the scene
    const zoomProgress = interpolate(frame, [0, durationFrames], [1, 1.25]);
    const finalZoom = zoomScale * zoomProgress;

    return {
      width: '100%',
      height: '100%',
      objectFit: 'cover' as const,
      transformOrigin,
      transform: `scale(${finalZoom})`,
    };
  }, [preset, sceneIndex, frame, durationFrames]);

  // Brushed Titanium Bezel for premium luxury or blueprint cyber frame
  const bezelStyle = useMemo(() => {
    if (preset === 'premium_luxury') {
      return {
        background: '#09090b',
        border: '12px solid #2a2a2d',
        borderRadius: '48px',
        boxShadow: 'inset 0 0 15px rgba(255,255,255,0.15), 0 0 1px 1px rgba(255,255,255,0.2)',
      };
    }
    if (preset === 'blueprint_style') {
      return {
        background: 'rgba(15, 43, 76, 0.45)',
        border: `3px dashed ${primaryColor}`,
        outline: '12px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '48px',
        boxShadow: `0 0 30px rgba(99, 102, 241, 0.15)`,
      };
    }
    return {
      background: '#09090b',
      border: '12px solid #1e1e24',
      borderRadius: '48px',
    };
  }, [preset, primaryColor]);

  // Helper values for multi-screenshot presets
  const len = allScreenshots.length;
  const leftImage = len > 0 ? allScreenshots[(sceneIndex - 1 + len) % len] : imageUrl;
  const rightImage = len > 0 ? allScreenshots[(sceneIndex + 1) % len] : imageUrl;
  const farLeftImage = len > 0 ? allScreenshots[(sceneIndex - 2 + len) % len] : imageUrl;
  const farRightImage = len > 0 ? allScreenshots[(sceneIndex + 2) % len] : imageUrl;

  // TikTok Hook banner text helper
  const showTikTokHook = preset === 'tiktok_hook' && sceneIndex === 0 && frame < 60;
  const hookBannerScale = spring({
    frame,
    fps,
    config: { damping: 9, stiffness: 180 },
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '60px',
        width: '100%',
        height: '100%',
        padding: '0 80px',
        zIndex: 5,
        perspective: '1200px',
      }}
    >
      {/* 1. TikTok Hook Banner Overlay */}
      {showTikTokHook && (
        <div
          style={{
            position: 'absolute',
            top: '18%',
            left: '5%',
            right: '5%',
            zIndex: 100,
            transform: `scale(${hookBannerScale})`,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              backgroundColor: '#facc15',
              color: '#000000',
              padding: '16px 36px',
              fontSize: '46px',
              fontWeight: 900,
              textTransform: 'uppercase',
              borderRadius: '8px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              border: '4px solid #000000',
              textAlign: 'center',
              letterSpacing: '1px',
            }}
          >
            🔥 {featureLabel || 'CHECK THIS OUT!'} 🔥
          </div>
        </div>
      )}

      {/* Dynamic SVG Filter definition to avoid box-shadow rendering artifacts in Headless Chrome */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx={shadowDx}
              dy={15}
              stdDeviation={12}
              floodColor="#000000"
              floodOpacity={preset === 'premium_luxury' ? 0.65 : 0.4}
            />
          </filter>
        </defs>
      </svg>

      {/* 3D Rotated Phone Container */}
      <div
        style={{
          transform: `translateY(${presetAnimations.ty}px) rotateX(${presetAnimations.rx}deg) rotateY(${presetAnimations.ry}deg) rotateZ(${presetAnimations.rz}deg) scale(${finalScale})`,
          opacity,
          transformStyle: 'preserve-3d',
          filter: `url(#${filterId})`,
          transition: 'transform 0.05s linear',
          position: 'relative',
        }}
      >
        {/* Render Preset Layout */}
        {preset === 'screenshot_cascade' ? (
          <div style={{ position: 'relative', width: '380px', height: '760px', transformStyle: 'preserve-3d' }}>
            {/* Left phone */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(-180px, 0, -150px) rotateY(20deg) scale(0.85)', opacity: 0.8 }}>
              <SinglePhoneBezel imageUrl={leftImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Right phone */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(180px, 0, -150px) rotateY(-20deg) scale(0.85)', opacity: 0.8 }}>
              <SinglePhoneBezel imageUrl={rightImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Center Phone */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(0, 0, 0)' }}>
              <SinglePhoneBezel
                imageUrl={imageUrl}
                bezelStyle={bezelStyle}
                spotlightStyle={spotlightStyle}
                showGlare={true}
                primaryColor={primaryColor}
                animationType={animationType}
                glowOpacity={glowOpacity}
                preset={preset}
                sceneIndex={sceneIndex}
                frame={frame}
                durationFrames={durationFrames}
              />
            </div>
          </div>
        ) : preset === 'phone_wall' ? (
          <div style={{ position: 'relative', width: '380px', height: '760px', transformStyle: 'preserve-3d' }}>
            {/* Far Left */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(-320px, 0, -240px) rotateY(35deg) scale(0.7)', opacity: 0.6 }}>
              <SinglePhoneBezel imageUrl={farLeftImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Mid Left */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(-160px, 0, -120px) rotateY(20deg) scale(0.85)', opacity: 0.8 }}>
              <SinglePhoneBezel imageUrl={leftImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Far Right */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(320px, 0, -240px) rotateY(-35deg) scale(0.7)', opacity: 0.6 }}>
              <SinglePhoneBezel imageUrl={farRightImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Mid Right */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(160px, 0, -120px) rotateY(-20deg) scale(0.85)', opacity: 0.8 }}>
              <SinglePhoneBezel imageUrl={rightImage} bezelStyle={bezelStyle} primaryColor={primaryColor} />
            </div>
            {/* Center */}
            <div style={{ position: 'absolute', inset: 0, transform: 'translate3d(0, 0, 50px) scale(1.0)', boxShadow: `0 0 40px ${primaryColor}44`, borderRadius: '48px' }}>
              <SinglePhoneBezel
                imageUrl={imageUrl}
                bezelStyle={{ ...bezelStyle, border: `12px solid ${primaryColor}` }}
                spotlightStyle={spotlightStyle}
                showGlare={true}
                primaryColor={primaryColor}
                animationType={animationType}
                glowOpacity={glowOpacity}
                preset={preset}
                sceneIndex={sceneIndex}
                frame={frame}
                durationFrames={durationFrames}
              />
            </div>
          </div>
        ) : preset === 'phone_explosion' ? (
          <div style={{ position: 'relative', width: '380px', height: '760px', transformStyle: 'preserve-3d' }}>
            {/* Exploded Body Backing */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                ...bezelStyle,
                background: 'linear-gradient(135deg, #18181b, #27272a)',
                border: `12px solid ${secondaryColor}cc`,
                transform: `translate3d(0, 0, ${interpolate(entranceProgress, [0, 1], [-140, -40])}px)`,
                opacity: interpolate(entranceProgress, [0, 1], [0.3, 0.9]),
                boxShadow: `0 0 30px ${secondaryColor}33`,
              }}
            >
              <div style={{ flex: 1, background: `radial-gradient(circle, ${primaryColor}22 0%, transparent 80%)`, height: '100%' }} />
            </div>

            {/* Exploded Screen Glass Front */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                transform: `translate3d(0, 0, ${interpolate(entranceProgress, [0, 1], [140, 20])}px)`,
                opacity: interpolate(entranceProgress, [0, 1], [0.3, 1]),
                transformStyle: 'preserve-3d',
              }}
            >
              <SinglePhoneBezel
                imageUrl={imageUrl}
                bezelStyle={{ ...bezelStyle, border: '6px solid rgba(255,255,255,0.3)', background: 'transparent' }}
                spotlightStyle={spotlightStyle}
                showGlare={true}
                primaryColor={primaryColor}
                animationType={animationType}
                glowOpacity={glowOpacity}
                preset={preset}
                sceneIndex={sceneIndex}
                frame={frame}
                durationFrames={durationFrames}
              />
            </div>

            {/* Exploded Floating Brand Badge */}
            <div
              style={{
                position: 'absolute',
                top: '25%',
                right: '-60px',
                width: '120px',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '16px',
                transform: `translate3d(0, 0, ${interpolate(entranceProgress, [0, 1], [220, 80])}px)`,
                opacity: interpolate(entranceProgress, [0, 1], [0, 1]),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
            >
              <span style={{ fontSize: '20px' }}>⚡</span>
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#fff', marginTop: '4px', textTransform: 'uppercase' }}>AI PRO</span>
            </div>
          </div>
        ) : preset === 'ai_assistant' ? (
          <div style={{ position: 'relative', width: '380px', height: '760px', transformStyle: 'preserve-3d' }}>
            {/* Hologram SVG background ring rotating */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '540px',
                height: '540px',
                transform: `translate3d(-50%, -50%, -80px) rotateZ(${frame * 0.8}deg)`,
                pointerEvents: 'none',
                opacity: 0.45,
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke={primaryColor} strokeWidth="1.5" strokeDasharray="6,4" />
                <circle cx="50" cy="50" r="40" fill="none" stroke={secondaryColor} strokeWidth="0.8" strokeDasharray="2,6" />
              </svg>
            </div>
            <SinglePhoneBezel
              imageUrl={imageUrl}
              bezelStyle={{ ...bezelStyle, boxShadow: `0 0 40px ${primaryColor}55` }}
              spotlightStyle={spotlightStyle}
              showGlare={true}
              primaryColor={primaryColor}
              animationType={animationType}
              glowOpacity={glowOpacity}
              preset={preset}
              sceneIndex={sceneIndex}
              frame={frame}
              durationFrames={durationFrames}
            />
          </div>
        ) : preset === 'floating_cards' ? (
          <div style={{ position: 'relative', width: '380px', height: '760px', transformStyle: 'preserve-3d' }}>
            {/* Floating UI Card 1 */}
            <div
              style={{
                position: 'absolute',
                top: '15%',
                left: '-220px',
                width: '240px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                transform: `translate3d(0, ${Math.sin(frame * 0.06) * 12}px, 90px) rotateY(15deg)`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '11px', color: primaryColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>System Alert</span>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>✨ Magic Tool Activated</span>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Ready to transform your assets.</span>
            </div>

            {/* Floating UI Card 2 */}
            <div
              style={{
                position: 'absolute',
                bottom: '15%',
                right: '-220px',
                width: '240px',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '20px',
                transform: `translate3d(0, ${Math.cos(frame * 0.06) * 12}px, 120px) rotateY(-15deg)`,
                boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: '11px', color: secondaryColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Live Stats</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '24px', fontWeight: 900, color: '#fff' }}>99.2%</span>
                <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>+12.4%</span>
              </div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>Efficiency rate optimized.</span>
            </div>

            <SinglePhoneBezel
              imageUrl={imageUrl}
              bezelStyle={bezelStyle}
              spotlightStyle={spotlightStyle}
              primaryColor={primaryColor}
              animationType={animationType}
              glowOpacity={glowOpacity}
              preset={preset}
              sceneIndex={sceneIndex}
              frame={frame}
              durationFrames={durationFrames}
            />
          </div>
        ) : (
          <SinglePhoneBezel
            imageUrl={imageUrl}
            bezelStyle={bezelStyle}
            spotlightStyle={spotlightStyle}
            showGlare={preset === 'premium_luxury' || preset === 'cinematic_reveal'}
            showGrid={preset === 'blueprint_style'}
            primaryColor={primaryColor}
            animationType={animationType}
            glowOpacity={glowOpacity}
            preset={preset}
            sceneIndex={sceneIndex}
            frame={frame}
            durationFrames={durationFrames}
          />
        )}

        {/* Blueprint Style Technical Crosshairs & Dimensions */}
        {preset === 'blueprint_style' && (
          <>
            {/* Height label line */}
            <div
              style={{
                position: 'absolute',
                right: '-35px',
                top: 0,
                bottom: 0,
                width: '1px',
                borderLeft: '1px dashed rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
            >
              <span style={{ transform: 'rotate(90deg)', whiteSpace: 'nowrap' }}>H: 760px</span>
            </div>
            {/* Width label line */}
            <div
              style={{
                position: 'absolute',
                bottom: '-35px',
                left: 0,
                right: 0,
                height: '1px',
                borderTop: '1px dashed rgba(255, 255, 255, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '10px',
                fontFamily: 'monospace',
              }}
            >
              <span>W: 380px</span>
            </div>
          </>
        )}
      </div>

      {/* Feature Label and Description Column (Hide during TikTok hook banner to prevent visual overlap) */}
      {(featureLabel || featureDescription) && !showTikTokHook && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            maxWidth: '500px',
            opacity: textEntrance.opacity,
            transform: `translateY(${textEntrance.translateY}px)`,
          }}
        >
          {featureLabel && (
            <div
              style={{
                background: preset === 'blueprint_style'
                  ? 'rgba(15, 43, 76, 0.8)'
                  : preset === 'premium_luxury'
                  ? 'linear-gradient(135deg, #1f1f22, #2a2a2d)'
                  : `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                border: preset === 'blueprint_style' ? `1px solid ${primaryColor}` : 'none',
                padding: '10px 20px',
                borderRadius: '12px',
                alignSelf: 'flex-start',
                color: '#fff',
                fontSize: '20px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                marginBottom: '20px',
                boxShadow: preset === 'blueprint_style'
                  ? `0 0 15px rgba(99, 102, 241, 0.2)`
                  : `0 4px 20px rgba(99, 102, 241, 0.3)`,
              }}
            >
              {featureLabel}
            </div>
          )}

          {featureDescription && (
            <div
              style={{
                fontSize: '38px',
                fontWeight: 800,
                lineHeight: 1.3,
                color: '#ffffff',
                textShadow: '0 2px 10px rgba(0,0,0,0.3)',
              }}
            >
              {featureDescription}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useMemo } from 'react';
import { useCurrentFrame, interpolate, interpolateColors, AbsoluteFill } from 'remotion';
import { MobileAppPreset } from './types';

interface GradientBackgroundProps {
  primaryColor?: string;
  secondaryColor?: string;
  durationFrames: number;
  preset?: MobileAppPreset;
}

export const GradientBackground: React.FC<GradientBackgroundProps> = ({
  primaryColor = '#6366f1',
  secondaryColor = '#ec4899',
  durationFrames,
  preset = 'hero_floating',
}) => {
  const frame = useCurrentFrame();

  // Interpolated colors driven by useCurrentFrame() to prevent CSS animation bugs in Headless Chrome
  const currentPrimary = useMemo(() => {
    return interpolateColors(
      frame,
      [0, durationFrames / 2, durationFrames],
      [primaryColor, secondaryColor, primaryColor]
    );
  }, [frame, durationFrames, primaryColor, secondaryColor]);

  const currentSecondary = useMemo(() => {
    return interpolateColors(
      frame,
      [0, durationFrames / 2, durationFrames],
      [secondaryColor, primaryColor, secondaryColor]
    );
  }, [frame, durationFrames, primaryColor, secondaryColor]);

  // Luxury Studio Light Sweep
  const lightSweepX = useMemo(() => {
    // Loop the sweep every 120 frames
    const cycle = frame % 120;
    return interpolate(cycle, [0, 120], [-100, 200]);
  }, [frame]);

  // Render different background styles based on preset
  switch (preset) {
    case 'blueprint_style':
      return (
        <AbsoluteFill style={{ backgroundColor: '#0b1d33', zIndex: 0 }}>
          {/* Blueprint Grid lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.08) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              opacity: 0.8,
            }}
          />
          {/* Blueprint major division lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.12) 2px, transparent 2px), linear-gradient(90deg, rgba(255, 255, 255, 0.12) 2px, transparent 2px)',
              backgroundSize: '200px 200px',
              opacity: 0.6,
            }}
          />
          {/* Subtle blueprint center grid */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '800px',
              height: '800px',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              borderRadius: '50%',
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          />
        </AbsoluteFill>
      );

    case 'premium_luxury':
      return (
        <AbsoluteFill style={{ backgroundColor: '#050508', zIndex: 0, overflow: 'hidden' }}>
          {/* Subtle light sweep reflection */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, transparent 30%, rgba(255, 255, 255, 0.015) 45%, rgba(255, 255, 255, 0.04) 50%, rgba(255, 255, 255, 0.015) 55%, transparent 70%)`,
              backgroundSize: '200% 200%',
              transform: `translateX(${lightSweepX - 100}%)`,
              opacity: 0.7,
            }}
          />
          {/* Luxury ambient dark blue/purple glow */}
          <div
            style={{
              position: 'absolute',
              top: '-20%',
              left: '-20%',
              width: '140%',
              height: '140%',
              background: `radial-gradient(circle at center, ${currentPrimary}1c 0%, transparent 70%)`,
              filter: 'blur(100px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'orbit_reveal':
      return (
        <AbsoluteFill style={{ backgroundColor: '#07080f', zIndex: 0, overflow: 'hidden' }}>
          {/* Elegant Dot Grid */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.12) 1.5px, transparent 1.5px)',
              backgroundSize: '32px 32px',
              opacity: 0.8,
            }}
          />
          {/* Orbit rings */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) rotate(${frame * 0.2}deg)`,
              width: '350px',
              height: '650px',
              border: `1.5px solid ${currentPrimary}44`,
              borderRadius: '50%',
              opacity: 0.3,
              boxShadow: `0 0 15px ${currentPrimary}22`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) rotate(${-frame * 0.1}deg)`,
              width: '450px',
              height: '750px',
              border: `1px dashed ${currentSecondary}33`,
              borderRadius: '50%',
              opacity: 0.2,
            }}
          />
          {/* Centered soft circular aura */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '600px',
              height: '600px',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.18,
              filter: 'blur(60px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'screenshot_cascade':
      return (
        <AbsoluteFill style={{ backgroundColor: '#0b0c10', zIndex: 0, overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(45deg, rgba(255, 255, 255, 0.015) 25%, transparent 25%, transparent 75%, rgba(255, 255, 255, 0.015) 75%)`,
              backgroundSize: '60px 60px',
              opacity: 0.8,
              transform: `translateY(${(frame * 0.5) % 60}px)`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '30%',
              left: '20%',
              width: '600px',
              height: '600px',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 75%)`,
              opacity: 0.25,
              filter: 'blur(80px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'tiktok_hook':
      return (
        <AbsoluteFill style={{ backgroundColor: '#000000', zIndex: 0, overflow: 'hidden' }}>
          {/* Fast scaling ambient glows */}
          <div
            style={{
              position: 'absolute',
              top: '-10%',
              right: '-10%',
              width: '80%',
              height: '80%',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.3,
              filter: 'blur(120px)',
              transform: `scale(${interpolate(frame % 30, [0, 15, 30], [1.0, 1.2, 1.0])})`,
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '-10%',
              left: '-10%',
              width: '80%',
              height: '80%',
              background: `radial-gradient(circle, ${currentSecondary} 0%, transparent 70%)`,
              opacity: 0.3,
              filter: 'blur(120px)',
              transform: `scale(${interpolate(frame % 40, [0, 20, 40], [1.2, 1.0, 1.2])})`,
            }}
          />
        </AbsoluteFill>
      );

    case 'phone_wall':
      return (
        <AbsoluteFill style={{ backgroundColor: '#08080c', zIndex: 0, overflow: 'hidden' }}>
          {/* Matrix/Wall Grid */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)`,
              backgroundSize: '80px 80px',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 50% 50%, ${currentPrimary}1c 0%, transparent 80%)`,
            }}
          />
        </AbsoluteFill>
      );

    case 'phone_explosion':
      return (
        <AbsoluteFill style={{ backgroundColor: '#0c070f', zIndex: 0, overflow: 'hidden' }}>
          {/* Burst beams */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15 }}>
            <defs>
              <radialGradient id="rayGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={currentPrimary} stopOpacity="1" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="50%" cy="50%" r="45%" fill="url(#rayGrad)" />
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i * 360) / 8;
              const x2 = 50 + 50 * Math.cos((angle * Math.PI) / 180);
              const y2 = 50 + 50 * Math.sin((angle * Math.PI) / 180);
              return (
                <line
                  key={i}
                  x1="50%"
                  y1="50%"
                  x2={`${x2}%`}
                  y2={`${y2}%`}
                  stroke={currentSecondary}
                  strokeWidth="3"
                  style={{
                    transformOrigin: '50% 50%',
                    transform: `rotate(${frame * 0.1}deg)`,
                  }}
                />
              );
            })}
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '500px',
              height: '500px',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.25,
              filter: 'blur(70px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'ai_assistant':
      return (
        <AbsoluteFill style={{ backgroundColor: '#070a13', zIndex: 0, overflow: 'hidden' }}>
          {/* SVG Neural Network */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.25 }}>
            <line x1="20%" y1="20%" x2="50%" y2="40%" stroke={currentPrimary} strokeWidth="2" strokeDasharray="5,5" />
            <line x1="80%" y1="20%" x2="50%" y2="40%" stroke={currentPrimary} strokeWidth="2" />
            <line x1="50%" y1="40%" x2="30%" y2="70%" stroke={currentSecondary} strokeWidth="2" />
            <line x1="50%" y1="40%" x2="70%" y2="70%" stroke={currentSecondary} strokeWidth="2" strokeDasharray="5,5" />
            <circle cx="20%" cy="20%" r="6" fill={currentPrimary} style={{ opacity: interpolate(frame % 30, [0, 15, 30], [0.3, 1, 0.3]) }} />
            <circle cx="80%" cy="20%" r="6" fill={currentPrimary} style={{ opacity: interpolate(frame % 40, [0, 20, 40], [0.3, 1, 0.3]) }} />
            <circle cx="50%" cy="40%" r="10" fill={currentSecondary} style={{ opacity: interpolate(frame % 50, [0, 25, 50], [0.5, 1, 0.5]) }} />
            <circle cx="30%" cy="70%" r="6" fill={currentSecondary} style={{ opacity: interpolate(frame % 35, [0, 17, 35], [0.3, 1, 0.3]) }} />
            <circle cx="70%" cy="70%" r="6" fill={currentSecondary} style={{ opacity: interpolate(frame % 45, [0, 22, 45], [0.3, 1, 0.3]) }} />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '600px',
              height: '600px',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.15,
              filter: 'blur(80px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'feature_spotlight':
      return (
        <AbsoluteFill style={{ backgroundColor: '#05060a', zIndex: 0, overflow: 'hidden' }}>
          {/* Spotlight overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(circle, transparent 20%, rgba(0, 0, 0, 0.7) 90%)',
              zIndex: 1,
            }}
          />
          {/* Glowing center spotlights */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '400px',
              height: '400px',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 80%)`,
              opacity: 0.35,
              filter: 'blur(50px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'floating_cards':
      return (
        <AbsoluteFill style={{ backgroundColor: '#fafafa', zIndex: 0, overflow: 'hidden' }}>
          {/* Soft light pastel clean canvas */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 30% 30%, ${currentPrimary}11 0%, ${currentSecondary}11 50%, #ffffff 100%)`,
            }}
          />
          {/* Soft floating grids */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        </AbsoluteFill>
      );

    case 'cinematic_reveal':
      return (
        <AbsoluteFill style={{ backgroundColor: '#020204', zIndex: 0, overflow: 'hidden' }}>
          {/* Layered blurred blobs simulating smoke */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              left: `${10 + Math.sin(frame * 0.02) * 15}%`,
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.15,
              filter: 'blur(80px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '20%',
              right: `${10 + Math.cos(frame * 0.02) * 15}%`,
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${currentSecondary} 0%, transparent 70%)`,
              opacity: 0.15,
              filter: 'blur(80px)',
            }}
          />
        </AbsoluteFill>
      );

    case 'front_flat':
      return (
        <AbsoluteFill style={{ backgroundColor: '#06060c', zIndex: 0, overflow: 'hidden' }}>
          {/* Subtle horizontal grid lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
              backgroundSize: '100% 80px',
              opacity: 0.5,
            }}
          />
          {/* Center radial glow behind the phone */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '1000px',
              height: '1000px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${currentPrimary}33 0%, ${currentSecondary}11 40%, transparent 70%)`,
              filter: 'blur(80px)',
              opacity: 0.85,
            }}
          />
          {/* Decorative tech HUD circles */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) scale(1.1)',
              width: '600px',
              height: '600px',
              border: `1px dashed ${currentPrimary}22`,
              borderRadius: '50%',
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%) scale(0.9)',
              width: '600px',
              height: '600px',
              border: `1px solid ${currentSecondary}11`,
              borderRadius: '50%',
              opacity: 0.3,
            }}
          />
        </AbsoluteFill>
      );

    case 'hero_floating':
    default:
      return (
        <AbsoluteFill style={{ backgroundColor: '#0a0a14', zIndex: 0, overflow: 'hidden' }}>
          {/* Ambient light ring pedestal outline */}
          <div
            style={{
              position: 'absolute',
              bottom: '-10%',
              left: '10%',
              right: '10%',
              height: '160px',
              borderRadius: '50%',
              border: `2px solid ${currentPrimary}2b`,
              boxShadow: `0 0 40px ${currentPrimary}33, inset 0 0 20px ${currentSecondary}22`,
              transform: 'rotateX(75deg)',
              opacity: 0.6,
            }}
          />
          {/* Standard mesh gradient ambient circles */}
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '10%',
              width: '800px',
              height: '800px',
              background: `radial-gradient(circle at 50% 50%, ${currentPrimary} 0%, transparent 70%)`,
              opacity: 0.22,
              filter: 'blur(100px)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '10%',
              right: '10%',
              width: '800px',
              height: '800px',
              background: `radial-gradient(circle at 50% 50%, ${currentSecondary} 0%, transparent 70%)`,
              opacity: 0.22,
              filter: 'blur(100px)',
            }}
          />
        </AbsoluteFill>
      );
  }
};

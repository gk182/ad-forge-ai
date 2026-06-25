import React, { useState } from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate, staticFile } from 'remotion';

interface OutroCTASceneProps {
  appName?: string;
  tagline?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export const OutroCTAScene: React.FC<OutroCTASceneProps> = ({
  appName = 'App Studio',
  tagline = 'Create, Edit, Export.',
  logoUrl,
  primaryColor = '#3b82f6',
  secondaryColor = '#8b5cf6',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  // Entrance spring animations (staggered)
  const iconScale = spring({
    frame,
    fps,
    config: { damping: 12 },
    durationInFrames: 30,
  });

  const appNameOpacity = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15 },
    durationInFrames: 25,
  });

  const taglineOpacity = spring({
    frame: frame - 18,
    fps,
    config: { damping: 15 },
    durationInFrames: 25,
  });

  const badgeEntrance = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12 },
    durationInFrames: 30,
  });

  // Badge floating/drifting motion (using sine waves with offset to make them float independently)
  const appleFloatY = Math.sin((frame / fps) * 2.5) * 12;
  const googleFloatY = Math.sin((frame / fps) * 2.5 + Math.PI) * 12;

  const appleFloatX = Math.cos((frame / fps) * 1.5) * 4;
  const googleFloatX = Math.cos((frame / fps) * 1.5 + Math.PI) * 4;

  const safeAppName = appName.trim() || 'App Studio';
  const displayLetter = safeAppName.charAt(0).toUpperCase() || '⭐';

  // Static URLs for the store badges
  const appleStoreBadge = staticFile('applestore.svg');
  const googlePlayBadge = staticFile('googleplay.svg');

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 40px',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        zIndex: 10,
      }}
    >
      {/* Dynamic App Icon Container */}
      <div
        style={{
          transform: `scale(${iconScale})`,
          opacity: interpolate(frame, [0, 10], [0, 1]),
          width: '180px',
          height: '180px',
          borderRadius: '40px',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: `0 20px 50px rgba(0, 0, 0, 0.3), 0 0 40px ${primaryColor}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '35px',
          overflow: 'hidden',
        }}
      >
        {logoUrl && !logoLoadFailed ? (
          <img
            src={logoUrl}
            alt={`${appName} logo`}
            onError={() => setLogoLoadFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '40px',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '84px',
              fontWeight: 800,
              textShadow: '0 4px 10px rgba(0,0,0,0.2)',
            }}
          >
            {displayLetter}
          </div>
        )}
      </div>

      {/* App Name */}
      <h2
        style={{
          opacity: appNameOpacity,
          transform: `translateY(${interpolate(appNameOpacity, [0, 1], [20, 0])}px)`,
          fontSize: '64px',
          fontWeight: 900,
          margin: '0 0 15px 0',
          textAlign: 'center',
          letterSpacing: '-1px',
          background: `linear-gradient(to right, #ffffff, #e2e8f0)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textShadow: '0 10px 30px rgba(0,0,0,0.15)',
        }}
      >
        {safeAppName}
      </h2>

      {/* Tagline */}
      {tagline && (
        <p
          style={{
            opacity: taglineOpacity,
            transform: `translateY(${interpolate(taglineOpacity, [0, 1], [15, 0])}px)`,
            fontSize: '26px',
            fontWeight: 500,
            color: 'rgba(255, 255, 255, 0.7)',
            margin: '0 0 70px 0',
            textAlign: 'center',
            lineHeight: 1.4,
            maxWidth: '450px',
          }}
        >
          {tagline}
        </p>
      )}

      {/* Store Badges Row */}
      <div
        style={{
          opacity: badgeEntrance,
          transform: `scale(${badgeEntrance}) translateY(${interpolate(badgeEntrance, [0, 1], [30, 0])}px)`,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          width: '100%',
        }}
      >
        {/* Apple App Store */}
        <div
          style={{
            transform: `translate(${appleFloatX}px, ${appleFloatY}px)`,
            transition: 'transform 0.1s linear',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            background: 'black',
          }}
        >
          <img
            src={appleStoreBadge}
            alt="Download on App Store"
            style={{
              height: '60px',
              display: 'block',
              borderRadius: '16px',
            }}
            onError={(e) => {
              // Gracefully handle broken badge paths by keeping spacing layout
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        </div>

        {/* Google Play Store */}
        <div
          style={{
            transform: `translate(${googleFloatX}px, ${googleFloatY}px)`,
            transition: 'transform 0.1s linear',
            borderRadius: '16px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            background: 'black',
          }}
        >
          <img
            src={googlePlayBadge}
            alt="Get it on Google Play"
            style={{
              height: '60px',
              display: 'block',
              borderRadius: '16px',
            }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        </div>
      </div>
    </div>
  );
};

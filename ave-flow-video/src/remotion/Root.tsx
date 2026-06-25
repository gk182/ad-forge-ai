import { Composition } from 'remotion';
import { AdVideo, AdVideoProps } from './AdVideo';
import { MobileAppComposition } from './mobile-app/MobileAppComposition';
import { MobileAppVideoProps } from './mobile-app/types';

export const Root: React.FC = () => {
  const defaultProps: AdVideoProps = {
    title: 'Awesome Product Review',
    textColor: '#ffffff',
    highlightColor: '#facc15', // Yellow-400
    fontFamily: 'Montserrat',
    layoutType: 'classic',
    audioUrl: '',
    audioDuration: 15,
    scenes: [
      {
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80',
        duration: 5.0,
        subtitle: 'Introducing the ultimate gadget of the year!',
        motion: 'center_zoom',
      },
      {
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=600&q=80',
        duration: 5.0,
        subtitle: 'Hand-crafted, elegant design, built to last a lifetime.',
        motion: 'slow_zoom_out',
      },
      {
        media_type: 'image',
        media_url: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=600&q=80',
        duration: 5.0,
        subtitle: 'Grab yours now. Link in bio for a special 20% discount!',
        motion: 'pan_left',
      },
    ],
  };

  const defaultMobileAppProps: MobileAppVideoProps = {
    appName: 'FoodFlow App',
    tagline: 'Order your favorite meal in 1-tap',
    primaryColor: '#10b981', // Emerald-500
    secondaryColor: '#3b82f6', // Blue-500
    scenes: [
      {
        imageUrl: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=600&q=80',
        duration: 5,
        subtitle: 'Hungry? Browse from thousands of local restaurants instantly.',
        featureLabel: 'Browse',
        featureDescription: 'Explore the best restaurants around you.',
        animation: 'spring_scale',
        transition: 'fade',
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=600&q=80',
        duration: 5,
        subtitle: 'Customize your dishes exactly the way you like them.',
        featureLabel: 'Customize',
        featureDescription: 'Tailor your order to your exact cravings.',
        animation: 'highlight_pulse',
        transition: 'slide_left',
      },
      {
        imageUrl: 'https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=600&q=80',
        duration: 5,
        subtitle: 'Get real-time tracking from kitchen to your front door.',
        featureLabel: 'Track Live',
        featureDescription: 'Watch your delivery in real-time.',
        animation: 'spring_scale',
        transition: 'zoom_in',
      },
    ],
  };

  return (
    <>
      <Composition
        id="AdVideo"
        component={AdVideo}
        durationInFrames={450} // 15 seconds at 30 fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
      <Composition
        id="MobileAppVideo"
        component={MobileAppComposition}
        durationInFrames={450} // 15 seconds at 30 fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultMobileAppProps}
      />
    </>
  );
};


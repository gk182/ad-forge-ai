import { Composition } from 'remotion';
import { AdVideo, AdVideoProps } from './AdVideo';

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
    </>
  );
};

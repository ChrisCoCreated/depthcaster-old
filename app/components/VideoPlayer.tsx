"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  src: string;
  className?: string;
  controls?: boolean;
}

export function VideoPlayer({ src, className = "", controls = true }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Check if the source is an HLS stream (.m3u8)
    const isHLS = src.includes(".m3u8") || src.endsWith(".m3u8");

    if (isHLS) {
      // Check if HLS is natively supported (Safari)
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS support
        video.src = src;
      } else if (Hls.isSupported()) {
        // Use hls.js for browsers that don't support HLS natively
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });

        hls.loadSource(src);
        hls.attachMedia(video);

        // Handle errors
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error("HLS network error, trying to recover...");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error("HLS media error, trying to recover...");
                hls.recoverMediaError();
                break;
              default:
                console.error("HLS fatal error, destroying...");
                hls.destroy();
                break;
            }
          }
        });

        return () => {
          hls.destroy();
        };
      } else {
        console.error("HLS is not supported in this browser");
      }
    } else {
      // Regular video file
      video.src = src;
    }
  }, [src]);

  return (
    <video
      ref={videoRef}
      controls={controls}
      className={className}
      playsInline
    />
  );
}




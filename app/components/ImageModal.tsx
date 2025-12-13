"use client";

import { useEffect } from "react";

interface ImageModalProps {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  disablePrevious?: boolean;
  disableNext?: boolean;
  caption?: string;
}

export function ImageModal({
  imageUrl,
  isOpen,
  onClose,
  onPrevious,
  onNext,
  disablePrevious,
  disableNext,
  caption,
}: ImageModalProps) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    
    let lastWheelTime = 0;
    const cooldown = 800; // 800ms cooldown between navigations - strict to prevent double navigation

    const handleWheel = (e: WheelEvent) => {
      if (!onPrevious && !onNext) return;
      
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const now = Date.now();
      
      // Only allow navigation if enough time has passed since last navigation
      // We removed the direction change exception to prevent double navigation
      const timeSinceLastNav = now - lastWheelTime;
      
      if (timeSinceLastNav >= cooldown) {
        e.preventDefault();
        if (delta > 0 && onNext) {
          onNext();
        } else if (delta < 0 && onPrevious) {
          onPrevious();
        }
        lastWheelTime = now;
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen, onNext, onPrevious]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black" style={{ zIndex: 9999 }}>
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
        aria-label="Close"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Navigation Buttons */}
      {onPrevious && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrevious();
          }}
          className="absolute left-6 bottom-6 z-10 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full disabled:opacity-40 transition-colors"
          aria-label="Previous image"
          disabled={disablePrevious}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {onNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-6 bottom-6 z-10 p-3 bg-black/60 hover:bg-black/80 text-white rounded-full disabled:opacity-40 transition-colors"
          aria-label="Next image"
          disabled={disableNext}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Image container */}
      <div
        className="relative w-screen h-screen flex flex-col items-center justify-center cursor-pointer px-6 py-6"
        onClick={onClose}
      >
        <div className="flex-1 flex items-center justify-center w-full">
          <img
            src={imageUrl}
            alt="Full screen"
            className="w-full h-full max-w-full max-h-[calc(100vh-12rem)] object-contain transition-opacity duration-300"
            key={imageUrl}
            style={{ opacity: 0 }}
            onLoad={(e) => {
              (e.target as HTMLImageElement).style.opacity = "1";
            }}
          />
        </div>
        
        {/* Caption */}
        {caption && (
          <div 
            className="mt-6 w-full max-w-4xl px-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/10">
              <p className="text-white text-base leading-relaxed break-words">
                {caption}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


"use client";

import { useEffect, useMemo, useState, useRef, memo } from "react";
import Image, { ImageProps } from "next/image";
import { buildProxiedImageUrl, sanitizeImageUrl, shouldProxyImageUrl, isExternalUrl, getAlternativeImgurUrl } from "@/lib/imageProxy";

const DEFAULT_AVATAR = "/default-avatar.png";

type AvatarImageProps = {
  src?: string | null;
  alt?: string | null;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
} & Omit<ImageProps, "src" | "alt" | "width" | "height" | "onError">;

function AvatarImageComponent({
  src,
  alt,
  size = 40,
  width,
  height,
  className,
  priority,
  ...rest
}: AvatarImageProps) {
  const sanitizedSrc = useMemo(() => sanitizeImageUrl(src), [src]);

  const proxiedSrc = useMemo(
    () => (sanitizedSrc && shouldProxyImageUrl(sanitizedSrc) ? buildProxiedImageUrl(sanitizedSrc) : null),
    [sanitizedSrc]
  );

  const targetSrc = proxiedSrc || sanitizedSrc || DEFAULT_AVATAR;
  
  const [currentSrc, setCurrentSrc] = useState<string>(targetSrc);
  const [triedOriginal, setTriedOriginal] = useState<boolean>(!proxiedSrc);
  const [triedAlternative, setTriedAlternative] = useState<boolean>(false);
  const prevTargetSrcRef = useRef<string>(targetSrc);
  const currentSrcRef = useRef<string>(targetSrc);

  // Update ref when currentSrc changes
  useEffect(() => {
    currentSrcRef.current = currentSrc;
  }, [currentSrc]);

  // Sync currentSrc when targetSrc changes (but only if actually different)
  // This prevents flickering during scroll when components re-render with the same src
  useEffect(() => {
    if (prevTargetSrcRef.current !== targetSrc) {
      prevTargetSrcRef.current = targetSrc;
      // Only update currentSrc if it's different from the current value
      // This prevents unnecessary Image component re-renders
      const current = currentSrcRef.current;
      if (current !== targetSrc && current !== sanitizedSrc && current !== proxiedSrc) {
        // Defer setState to avoid synchronous state update in effect
        setTimeout(() => {
          setCurrentSrc(targetSrc);
          setTriedOriginal(!proxiedSrc);
          setTriedAlternative(false);
        }, 0);
      }
    }
  }, [targetSrc, proxiedSrc, sanitizedSrc]);

  const handleError = () => {
    // If proxy failed and we haven't tried the original URL yet, try it
    if (!triedOriginal && sanitizedSrc && proxiedSrc && currentSrc === proxiedSrc) {
      setTriedOriginal(true);
      setCurrentSrc(sanitizedSrc);
      return;
    }

    // If original URL failed and we haven't tried an alternative Imgur URL, try it
    if (!triedAlternative && sanitizedSrc && currentSrc === sanitizedSrc) {
      const alternative = getAlternativeImgurUrl(sanitizedSrc);
      if (alternative) {
        setTriedAlternative(true);
        const altProxied = shouldProxyImageUrl(alternative) ? buildProxiedImageUrl(alternative) : alternative;
        setCurrentSrc(altProxied);
        return;
      }
    }

    // If everything failed, fall back to default immediately
    if (currentSrc !== DEFAULT_AVATAR) {
      setCurrentSrc(DEFAULT_AVATAR);
    }
  };


  const resolvedWidth = width ?? size;
  const resolvedHeight = height ?? size;
  const resolvedAlt = alt?.trim() || "User avatar";

  return (
    <Image
      src={currentSrc}
      alt={resolvedAlt}
      width={resolvedWidth}
      height={resolvedHeight}
      className={className}
      onError={handleError}
      priority={priority}
      unoptimized={isExternalUrl(currentSrc)}
      loading={priority ? undefined : "lazy"}
      placeholder="empty"
      style={{ display: 'block' }}
      {...rest}
    />
  );
}

// Memoize the component to prevent unnecessary re-renders during scroll
export const AvatarImage = memo(AvatarImageComponent, (prevProps, nextProps) => {
  // Only re-render if these props actually changed
  return (
    prevProps.src === nextProps.src &&
    prevProps.alt === nextProps.alt &&
    prevProps.size === nextProps.size &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.className === nextProps.className &&
    prevProps.priority === nextProps.priority
  );
});



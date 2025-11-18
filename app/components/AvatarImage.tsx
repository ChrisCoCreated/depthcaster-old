"use client";

import { useEffect, useMemo, useState } from "react";
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

export function AvatarImage({
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

  const [currentSrc, setCurrentSrc] = useState<string>(proxiedSrc || sanitizedSrc || DEFAULT_AVATAR);
  const [triedOriginal, setTriedOriginal] = useState<boolean>(!proxiedSrc);
  const [triedAlternative, setTriedAlternative] = useState<boolean>(false);

  useEffect(() => {
    const nextSanitized = sanitizeImageUrl(src);
    const nextProxied = nextSanitized && shouldProxyImageUrl(nextSanitized) ? buildProxiedImageUrl(nextSanitized) : null;

    setCurrentSrc(nextProxied || nextSanitized || DEFAULT_AVATAR);
    setTriedOriginal(!nextProxied);
    setTriedAlternative(false);
  }, [src]);

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
      {...rest}
    />
  );
}



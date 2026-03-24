import React, { useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, ImageOff } from "lucide-react";

interface RetryImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  maxRetries?: number;
  retryDelay?: number;
  fallbackIcon?: React.ReactNode;
  spinnerClassName?: string;
}

export function RetryImage({
  src,
  alt,
  className,
  maxRetries = 2,
  retryDelay = 500,
  fallbackIcon,
  spinnerClassName,
  onError,
  onLoad,
  ...props
}: RetryImageProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFailed, setHasFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState(src);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const triedAltExtRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setRetryCount(0);
    setHasFailed(false);
    setIsLoading(true);
    setImgSrc(src);
    triedAltExtRef.current = false;
  }, [src]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (!mountedRef.current || !src) return;

      if (!triedAltExtRef.current) {
        if (src.endsWith('.png')) {
          triedAltExtRef.current = true;
          setIsLoading(true);
          const webpSrc = src.replace(/\.png$/, '.webp');
          timerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setImgSrc(webpSrc);
          }, 300);
          return;
        } else if (src.endsWith('.webp')) {
          triedAltExtRef.current = true;
          setIsLoading(true);
          const pngSrc = src.replace(/\.webp$/, '.png');
          timerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            setImgSrc(pngSrc);
          }, 300);
          return;
        }
      }

      const currentSrc = triedAltExtRef.current
        ? (src.endsWith('.png') ? src.replace(/\.png$/, '.webp') : src.endsWith('.webp') ? src.replace(/\.webp$/, '.png') : src)
        : src;

      if (retryCount < maxRetries) {
        setIsLoading(true);
        const nextRetry = retryCount + 1;
        timerRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          setRetryCount(nextRetry);
          const separator = currentSrc.includes("?") ? "&" : "?";
          setImgSrc(`${currentSrc}${separator}_retry=${nextRetry}&_t=${Date.now()}`);
        }, retryDelay * nextRetry);
      } else {
        setHasFailed(true);
        setIsLoading(false);
        onError?.(e);
      }
    },
    [retryCount, maxRetries, retryDelay, src, onError]
  );

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (!mountedRef.current) return;
      setIsLoading(false);
      setHasFailed(false);
      onLoad?.(e);
    },
    [onLoad]
  );

  if (hasFailed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-zinc-800/50 rounded",
          className
        )}
        title={alt}
      >
        {fallbackIcon || (
          <ImageOff className="w-1/2 h-1/2 text-zinc-500 opacity-50" />
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <img
        src={imgSrc}
        alt={alt}
        className={cn("w-full h-full", isLoading && "opacity-30", className)}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
        {...props}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2
            className={cn(
              "animate-spin text-zinc-400",
              spinnerClassName || "w-5 h-5"
            )}
          />
        </div>
      )}
    </div>
  );
}

export default RetryImage;

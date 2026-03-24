import { useState, useEffect } from "react";

const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

export function useMobile() {
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    isMobile: windowWidth < BREAKPOINTS.tablet,
    isTablet: windowWidth >= BREAKPOINTS.tablet && windowWidth < BREAKPOINTS.desktop,
    isDesktop: windowWidth >= BREAKPOINTS.desktop,
    isWide: windowWidth >= BREAKPOINTS.wide,
    windowWidth,
    breakpoints: BREAKPOINTS,
  };
}

export { BREAKPOINTS };

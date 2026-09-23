import { useEffect, useState } from 'react';

export function useLogoPreload(sources: string[]) {
  const [ready, setReady] = useState(false);
  const sourcesKey = sources.join('|');

  useEffect(() => {
    let cancelled = false;
    let loadedCount = 0;
    const uniqueSources = Array.from(new Set(sourcesKey.split('|').filter(Boolean)));

    if (uniqueSources.length === 0) {
      setReady(true);
      return;
    }

    const markLoaded = () => {
      loadedCount += 1;
      if (!cancelled && loadedCount >= uniqueSources.length) {
        setReady(true);
      }
    };

    const images = uniqueSources.map((src) => {
      const img = new Image();
      img.onload = markLoaded;
      img.onerror = markLoaded;
      img.src = src;

      if (img.complete) {
        markLoaded();
      }

      return img;
    });

    return () => {
      cancelled = true;
      images.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [sourcesKey]);

  return ready;
}

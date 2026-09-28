/**
 * Fast HTML5 Canvas Dominant Color Extractor & Fuzzy Color Harmony Matcher.
 */

// Helper to convert RGB to HEX
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Helper to calculate Euclidean color distance between two HEX colors
export function colorDistance(hex1: string, hex2: string): number {
  const parse = (h: string) => {
    const clean = h.replace('#', '');
    return {
      r: parseInt(clean.substring(0, 2), 16) || 0,
      g: parseInt(clean.substring(2, 4), 16) || 0,
      b: parseInt(clean.substring(4, 6), 16) || 0,
    };
  };

  const c1 = parse(hex1);
  const c2 = parse(hex2);

  const rDiff = c1.r - c2.r;
  const gDiff = c1.g - c2.g;
  const bDiff = c1.b - c2.b;

  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * Checks if an image palette contains a color perceptually close to targetColor (threshold ~130).
 */
export function matchesPaletteFuzzy(palette: string[], targetColor: string, threshold = 130): boolean {
  if (!palette || palette.length === 0) return false;
  return palette.some(color => colorDistance(color, targetColor) <= threshold);
}

/**
 * Client-side asynchronous dominant color extractor using HTML5 Canvas.
 */
export async function extractDominantColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(['#3b82f6', '#10b981', '#facc15', '#1e293b']);
          return;
        }

        canvas.width = 32;
        canvas.height = 32;
        ctx.drawImage(img, 0, 0, 32, 32);

        const imgData = ctx.getImageData(0, 0, 32, 32).data;
        const colorBuckets: { [hex: string]: number } = {};

        for (let i = 0; i < imgData.length; i += 16) {
          const r = Math.round(imgData[i] / 32) * 32;
          const g = Math.round(imgData[i + 1] / 32) * 32;
          const b = Math.round(imgData[i + 2] / 32) * 32;
          const hex = rgbToHex(r, g, b);
          colorBuckets[hex] = (colorBuckets[hex] || 0) + 1;
        }

        const sorted = Object.keys(colorBuckets).sort(
          (a, b) => colorBuckets[b] - colorBuckets[a]
        );

        resolve(sorted.slice(0, 4));
      } catch {
        resolve(['#3b82f6', '#10b981', '#facc15', '#1e293b']);
      }
    };

    img.onerror = () => {
      resolve(['#3b82f6', '#10b981', '#facc15', '#1e293b']);
    };
  });
}

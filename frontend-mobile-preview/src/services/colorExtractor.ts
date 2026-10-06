/**
 * Fast HTML5 Canvas Dominant Color Extractor & Perceptual HSL Harmony Engine.
 */

export interface ChromaticColorOption {
  hex: string;
  namePt: string;
  nameEn: string;
  family: string;
}

export const CHROMATIC_PALETTE_COLORS: ChromaticColorOption[] = [
  { hex: '#facc15', namePt: 'Amarelo', nameEn: 'Yellow', family: 'yellow' },
  { hex: '#d4a373', namePt: 'Areia / Terra', nameEn: 'Sand / Earth', family: 'earth' },
  { hex: '#f97316', namePt: 'Laranja', nameEn: 'Orange', family: 'orange' },
  { hex: '#dc2626', namePt: 'Vermelho', nameEn: 'Red', family: 'red' },
  { hex: '#10b981', namePt: 'Verde', nameEn: 'Green', family: 'green' },
  { hex: '#06b6d4', namePt: 'Ciano', nameEn: 'Cyan', family: 'cyan' },
  { hex: '#3b82f6', namePt: 'Azul', nameEn: 'Blue', family: 'blue' },
  { hex: '#8b5cf6', namePt: 'Roxo', nameEn: 'Purple', family: 'purple' },
  { hex: '#ec4899', namePt: 'Rosa', nameEn: 'Pink', family: 'pink' },
];

export const colorPaletteCache = new Map<string, string[]>();

// Convert RGB to HEX
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toLowerCase();
}

// Convert HSL to HEX
export function hslToHex(h: number, s: number, l: number): string {
  const lNorm = l / 100;
  const a = (s * Math.min(lNorm, 1 - lNorm)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toLowerCase();
}

// Convert HEX to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  let full = clean;
  if (clean.length === 3) {
    full = clean.split('').map(c => c + c).join('');
  } else if (clean.length === 8) {
    full = clean.substring(0, 6);
  } else if (clean.length === 4) {
    full = clean.substring(0, 3).split('').map(c => c + c).join('');
  }
  if (full.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(full.substring(0, 2), 16) || 0,
    g: parseInt(full.substring(2, 4), 16) || 0,
    b: parseInt(full.substring(4, 6), 16) || 0,
  };
}

// Convert RGB to HSL (Hue: 0-360, Saturation: 0-1, Lightness: 0-1)
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) * 60;
    } else if (max === gNorm) {
      h = ((bNorm - rNorm) / delta + 2) * 60;
    } else {
      h = ((rNorm - gNorm) / delta + 4) * 60;
    }
  }

  return { h: Math.round(h % 360), s, l };
}

// Perceptual classification into 9 chromatic families or monochrome
// Strictly separates sand/earth/beige/brown from genuine vibrant yellow
export function classifyColorHue(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  if (s < 0.16 || l < 0.11 || l > 0.94 || (l < 0.22 && s < 0.35)) {
    return 'monochrome';
  }

  // Earth, Sand, Beige, Brown family (Hue 18-45 with moderate/low saturation or deep lightness)
  if ((h >= 18 && h < 45 && s < 0.72) || (h >= 15 && h < 52 && (l < 0.45 && s < 0.75))) {
    return 'earth';
  }

  // Strict Yellow: authentic vibrant yellow (not sand, not beige)
  if (h >= 45 && h < 70 && s >= 0.35 && l >= 0.35) {
    return 'yellow';
  }

  if (h >= 15 && h < 45) return 'orange';
  if (h >= 345 || h < 15) return 'red';
  if (h >= 70 && h < 165) return 'green';
  if (h >= 165 && h < 195) return 'cyan';
  if (h >= 195 && h < 255) return 'blue';
  if (h >= 255 && h < 310) return 'purple';
  if (h >= 310 && h < 345) return 'pink';
  return 'monochrome';
}

// Checks if an image palette matches the target tone using perceptual HSL Hue harmony
// Enforces strict separation: sand/earth never matches yellow!
export function matchesPaletteFuzzy(palette: string[], targetColor: string): boolean {
  if (!palette || palette.length === 0 || !targetColor) return false;
  const targetFamily = classifyColorHue(targetColor);
  const targetRgb = hexToRgb(targetColor);
  const targetHsl = rgbToHsl(targetRgb.r, targetRgb.g, targetRgb.b);

  for (const color of palette) {
    const colorFamily = classifyColorHue(color);

    // Strict boundary: earth/sand tones must NEVER match pure yellow
    if (targetFamily === 'yellow' && colorFamily === 'earth') continue;
    if (targetFamily === 'earth' && colorFamily === 'yellow') continue;

    // 1. Same chromatic family
    if (colorFamily === targetFamily) return true;

    // 2. Angular Hue proximity for saturated colors
    const colorRgb = hexToRgb(color);
    const colorHsl = rgbToHsl(colorRgb.r, colorRgb.g, colorRgb.b);
    if (colorHsl.s >= 0.18 && targetHsl.s >= 0.18) {
      const diff = Math.abs(colorHsl.h - targetHsl.h);
      const circularDiff = Math.min(diff, 360 - diff);
      if (circularDiff <= 25) return true;
    }
  }

  return false;
}

export interface CollectionSwatch {
  hex: string;
  family: string;
  labelPt: string;
  labelEn: string;
  count: number;
}

/**
 * Aggregates real dominant colors found across a collection of items (photos or album covers),
 * grouping perceptually close colors and counting matching items.
 */
export function aggregateCollectionSwatches(
  items: Array<{ colorPalette?: string[]; coverColorPalette?: string[]; images?: Array<{ colorPalette?: string[] }>; previewUrl?: string; originalUrl?: string; thumbnailUrl?: string; coverImage?: string }>,
  maxSwatches: number = 8
): CollectionSwatch[] {
  if (!items || items.length === 0) {
    return CHROMATIC_PALETTE_COLORS.slice(0, maxSwatches).map(c => ({
      hex: c.hex,
      family: c.family,
      labelPt: c.namePt,
      labelEn: c.nameEn,
      count: 0
    }));
  }

  const colorCandidates: string[] = [];

  for (const item of items) {
    const pal = (item.colorPalette && item.colorPalette.length > 0)
      ? item.colorPalette
      : (item.coverColorPalette && item.coverColorPalette.length > 0)
      ? item.coverColorPalette
      : (item.images?.[0]?.colorPalette && item.images[0].colorPalette.length > 0)
      ? item.images[0].colorPalette
      : (colorPaletteCache.get(item.previewUrl || item.originalUrl || item.thumbnailUrl || item.coverImage || '') || []);

    if (pal && pal.length > 0) {
      for (const hex of pal) {
        if (hex && hex.startsWith('#')) {
          colorCandidates.push(hex.toLowerCase());
        }
      }
    }
  }

  if (colorCandidates.length === 0) {
    return CHROMATIC_PALETTE_COLORS.slice(0, maxSwatches).map(c => ({
      hex: c.hex,
      family: c.family,
      labelPt: c.namePt,
      labelEn: c.nameEn,
      count: 0
    }));
  }

  // Deduplicate and group into clusters
  const clusters: Array<{ hex: string; count: number; colors: string[] }> = [];

  for (const hex of colorCandidates) {
    const rgb = hexToRgb(hex);
    let matchedCluster = false;
    for (const cluster of clusters) {
      const cRgb = hexToRgb(cluster.hex);
      if (redmeanDistance(rgb.r, rgb.g, rgb.b, cRgb.r, cRgb.g, cRgb.b) < 38) {
        cluster.colors.push(hex);
        matchedCluster = true;
        break;
      }
    }
    if (!matchedCluster) {
      clusters.push({ hex, count: 0, colors: [hex] });
    }
  }

  // Compute item count for each representative cluster
  for (const cluster of clusters) {
    let matchCount = 0;
    for (const item of items) {
      const pal = (item.colorPalette && item.colorPalette.length > 0)
        ? item.colorPalette
        : (item.coverColorPalette && item.coverColorPalette.length > 0)
        ? item.coverColorPalette
        : (item.images?.[0]?.colorPalette && item.images[0].colorPalette.length > 0)
        ? item.images[0].colorPalette
        : (colorPaletteCache.get(item.previewUrl || item.originalUrl || item.thumbnailUrl || item.coverImage || '') || []);

      if (matchesPaletteFuzzy(pal, cluster.hex)) {
        matchCount++;
      }
    }
    cluster.count = matchCount;
  }

  // Sort by item count descending
  clusters.sort((a, b) => b.count - a.count);

  const friendlyNames: Record<string, { pt: string; en: string }> = {
    yellow: { pt: 'Amarelo', en: 'Yellow' },
    earth: { pt: 'Areia / Terra', en: 'Sand / Earth' },
    orange: { pt: 'Laranja', en: 'Orange' },
    red: { pt: 'Vermelho', en: 'Red' },
    green: { pt: 'Verde', en: 'Green' },
    cyan: { pt: 'Ciano', en: 'Cyan' },
    blue: { pt: 'Azul', en: 'Blue' },
    purple: { pt: 'Roxo', en: 'Purple' },
    pink: { pt: 'Rosa', en: 'Pink' },
    monochrome: { pt: 'Monocromático', en: 'Monochrome' },
  };

  const results: CollectionSwatch[] = [];
  const seenFamilies = new Set<string>();

  for (const cluster of clusters) {
    const family = classifyColorHue(cluster.hex);
    if (!seenFamilies.has(family) || results.length < 4) {
      seenFamilies.add(family);
      const names = friendlyNames[family] || { pt: 'Tom Personalizado', en: 'Custom Tone' };
      results.push({
        hex: cluster.hex,
        family,
        labelPt: names.pt,
        labelEn: names.en,
        count: cluster.count
      });
      if (results.length >= maxSwatches) break;
    }
  }

  return results.length > 0 ? results : CHROMATIC_PALETTE_COLORS.slice(0, maxSwatches).map(c => ({
    hex: c.hex,
    family: c.family,
    labelPt: c.namePt,
    labelEn: c.nameEn,
    count: 0
  }));
}

// Perceptual color difference using human eye redmean weighting
export function redmeanDistance(
  r1: number, g1: number, b1: number,
  r2: number, g2: number, b2: number
): number {
  const rBar = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(
    (2 + rBar / 256) * dr * dr +
    4 * dg * dg +
    (2 + (255 - rBar) / 256) * db * db
  );
}

export const spatialDualColorsCache = new Map<string, { center: string; lateral: string }>();

// Computes exact average RGB of an array of hex colors
export function blendHexColors(colors: string[]): string {
  const valid = (colors || []).filter(c => Boolean(c && typeof c === 'string' && c.startsWith('#')));
  if (valid.length === 0) return '#3b82f6';
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  for (const h of valid) {
    const { r, g, b } = hexToRgb(h);
    totalR += r;
    totalG += g;
    totalB += b;
  }
  return rgbToHex(
    Math.round(totalR / valid.length),
    Math.round(totalG / valid.length),
    Math.round(totalB / valid.length)
  );
}

export function getSpatialSamplingRegion(x: number, y: number, w: number, h: number, s: number = 0.55): number {
  if (w <= 0 || h <= 0) return 1;
  const u = (x - w / 2) / (w / 2);
  const v = (y - h / 2) / (h / 2);
  if (Math.abs(v) >= Math.abs(u)) {
    if (v < 0) {
      return Math.abs(v) <= s ? 1 : 5;
    } else {
      return Math.abs(v) <= s ? 2 : 6;
    }
  } else {
    if (u < 0) {
      return Math.abs(u) <= s ? 3 : 7;
    } else {
      return Math.abs(u) <= s ? 4 : 8;
    }
  }
}

export async function extractSpatialDualColors(imageUrl: string): Promise<{ center: string; lateral: string }> {
  if (!imageUrl) return { center: '#3b82f6', lateral: '#10b981' };
  if (spatialDualColorsCache.has(imageUrl)) {
    return spatialDualColorsCache.get(imageUrl)!;
  }

  // If already in colorPaletteCache, derive authentic dual colors directly
  if (colorPaletteCache.has(imageUrl)) {
    const pal = colorPaletteCache.get(imageUrl)!;
    if (pal && pal.length > 0) {
      const center = pal.length >= 8 ? blendHexColors(pal.slice(0, 4)) : pal[0];
      const lateral = pal.length >= 8 ? blendHexColors(pal.slice(4, 8)) : (pal[1] || pal[0]);
      const res = { center, lateral };
      spatialDualColorsCache.set(imageUrl, res);
      return res;
    }
  }

  const colors = await extractDominantColors(imageUrl);
  if (spatialDualColorsCache.has(imageUrl)) {
    return spatialDualColorsCache.get(imageUrl)!;
  }
  if (colors && colors.length > 0) {
    const center = colors.length >= 8 ? blendHexColors(colors.slice(0, 4)) : colors[0];
    const lateral = colors.length >= 8 ? blendHexColors(colors.slice(4, 8)) : (colors[1] || colors[0]);
    const res = { center, lateral };
    spatialDualColorsCache.set(imageUrl, res);
    return res;
  }
  return { center: '#3b82f6', lateral: '#10b981' };
}

/**
 * Client-side asynchronous dominant color extractor using HTML5 Canvas.
 * Uses 8 geometric spatial sampling zones (4 internal core, 4 external periphery)
 * calculating the exact mathematical average of pixels in each region.
 */
export async function extractDominantColors(imageUrl: string): Promise<string[]> {
  if (!imageUrl) return [];
  if (colorPaletteCache.has(imageUrl)) {
    const cached = colorPaletteCache.get(imageUrl)!;
    if (!spatialDualColorsCache.has(imageUrl) && cached && cached.length > 0) {
      const center = cached.length >= 8 ? blendHexColors(cached.slice(0, 4)) : cached[0];
      const lateral = cached.length >= 8 ? blendHexColors(cached.slice(4, 8)) : (cached[1] || cached[0]);
      spatialDualColorsCache.set(imageUrl, { center, lateral });
    }
    return cached;
  }

  // Auto-route external remote URLs through local proxy to avoid CORS canvas tainting
  let safeSrc = imageUrl;
  if (
    typeof window !== 'undefined' &&
    (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) &&
    !imageUrl.includes(window.location.host) &&
    !imageUrl.includes('/api/proxy-image')
  ) {
    safeSrc = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  }

  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      colorPaletteCache.set(imageUrl, []);
      resolve([]);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = safeSrc;

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          colorPaletteCache.set(imageUrl, []);
          resolve([]);
          return;
        }

        const natW = img.naturalWidth || img.width || 160;
        const natH = img.naturalHeight || img.height || 120;
        const baseDim = 160;
        let targetW = baseDim;
        let targetH = baseDim;
        if (natW >= natH) {
          targetW = baseDim;
          targetH = Math.max(32, Math.round((baseDim * natH) / natW));
        } else {
          targetH = baseDim;
          targetW = Math.max(32, Math.round((baseDim * natW) / natH));
        }

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const imgData = ctx.getImageData(0, 0, targetW, targetH).data;
        const sumR = [0, 0, 0, 0, 0, 0, 0, 0];
        const sumG = [0, 0, 0, 0, 0, 0, 0, 0];
        const sumB = [0, 0, 0, 0, 0, 0, 0, 0];
        const counts = [0, 0, 0, 0, 0, 0, 0, 0];

        for (let i = 0; i < imgData.length; i += 4) {
          const a = imgData[i + 3];
          if (a < 64) continue; // Noise filter: ignore transparent pixels

          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];

          const pixelIdx = i / 4;
          const px = pixelIdx % targetW;
          const py = Math.floor(pixelIdx / targetW);

          const reg = getSpatialSamplingRegion(px, py, targetW, targetH, 0.55);
          const idx = reg - 1;
          sumR[idx] += r;
          sumG[idx] += g;
          sumB[idx] += b;
          counts[idx]++;
        }

        // Compute overall fallback
        const totalCount = counts.reduce((a, b) => a + b, 0);
        const overallR = totalCount > 0 ? Math.round(sumR.reduce((a, b) => a + b, 0) / totalCount) : 128;
        const overallG = totalCount > 0 ? Math.round(sumG.reduce((a, b) => a + b, 0) / totalCount) : 128;
        const overallB = totalCount > 0 ? Math.round(sumB.reduce((a, b) => a + b, 0) / totalCount) : 128;
        const overallHex = rgbToHex(overallR, overallG, overallB);

        // 8 dominant sampling colors (1-4 internal core, 5-8 external periphery)
        const result: string[] = [];
        for (let j = 0; j < 8; j++) {
          if (counts[j] > 0) {
            const avgR = Math.round(sumR[j] / counts[j]);
            const avgG = Math.round(sumG[j] / counts[j]);
            const avgB = Math.round(sumB[j] / counts[j]);
            result.push(rgbToHex(avgR, avgG, avgB));
          } else {
            result.push(overallHex);
          }
        }

        // Dual center vs outer for dynamic ambient background
        const innerCount = counts[0] + counts[1] + counts[2] + counts[3];
        const innerHex = innerCount > 0
          ? rgbToHex(
              Math.round((sumR[0] + sumR[1] + sumR[2] + sumR[3]) / innerCount),
              Math.round((sumG[0] + sumG[1] + sumG[2] + sumG[3]) / innerCount),
              Math.round((sumB[0] + sumB[1] + sumB[2] + sumB[3]) / innerCount)
            )
          : result[0] || '#3b82f6';

        const outerCount = counts[4] + counts[5] + counts[6] + counts[7];
        const outerHex = outerCount > 0
          ? rgbToHex(
              Math.round((sumR[4] + sumR[5] + sumR[6] + sumR[7]) / outerCount),
              Math.round((sumG[4] + sumG[5] + sumG[6] + sumG[7]) / outerCount),
              Math.round((sumB[4] + sumB[5] + sumB[6] + sumB[7]) / outerCount)
            )
          : result[4] || '#10b981';

        spatialDualColorsCache.set(imageUrl, { center: innerHex, lateral: outerHex });
        colorPaletteCache.set(imageUrl, result);
        resolve(result);
      } catch {
        colorPaletteCache.set(imageUrl, []);
        resolve([]);
      }
    };

    img.onerror = () => {
      colorPaletteCache.set(imageUrl, []);
      resolve([]);
    };
  });
}

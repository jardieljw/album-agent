import confetti from 'canvas-confetti';
import { Album, ExtractionJob, ExtractionMode, ImageItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { soundEffects } from './soundEffects';

// Simulated Live AI Agent Extraction Engine
let activeInterval: NodeJS.Timeout | null = null;

export const mockApi = {
  async startExtractionJob(
    url: string,
    mode: ExtractionMode = 'ai_react',
    model = 'qwen2.5:32b'
  ): Promise<ExtractionJob> {
    const store = useAppStore.getState();
    const jobId = `job-${Date.now()}`;

    let parsedTitle = 'Web Album Extraction';
    if (url.includes('fashion') || url.includes('couture') || url.includes('album-1')) {
      parsedTitle = 'Haute Couture Studio Runway Original';
    } else if (url.includes('cyberpunk') || url.includes('thread-42')) {
      parsedTitle = 'Cyberpunk Concept Art Vol. 4';
    } else if (url.includes('nature') || url.includes('nordic')) {
      parsedTitle = 'Wilderness Alpine Macro Original';
    } else if (url.includes('banner') || url.includes('hard-negative')) {
      parsedTitle = 'Filtered Commercial Showcase (Zero Banners)';
    } else {
      try {
        const hostname = new URL(url).hostname;
        parsedTitle = `Discovered Gallery from ${hostname}`;
      } catch (_) {
        parsedTitle = `Autonomous Discovery (${url.slice(0, 20)}...)`;
      }
    }

    const newJob: ExtractionJob = {
      id: jobId,
      url,
      title: parsedTitle,
      status: 'active',
      progressPercent: 5,
      discoveredImagesCount: 0,
      resolvedOriginalCount: 0,
      failedCount: 0,
      currentStage: 'Initializing headless browser & loading DOM...',
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      throughputMbps: 12.4,
      fps: 60,
      mode,
      aiModel: model,
      priority: 'high'
    };

    store.addJob(newJob);
    store.addLog({
      level: 'info',
      category: 'JOB_START',
      message: `Job ${jobId} initiated for URL: ${url} using ${model} (${mode})`
    });

    // Start multi-step simulation
    if (activeInterval) clearInterval(activeInterval);

    let step = 0;
    const totalSteps = 10;
    const startTime = Date.now();

    activeInterval = setInterval(() => {
      step++;
      const currentJob = useAppStore.getState().jobs.find(j => j.id === jobId);
      if (!currentJob || currentJob.status === 'paused' || currentJob.status === 'cancelled') {
        if (currentJob?.status === 'cancelled' && activeInterval) {
          clearInterval(activeInterval);
        }
        return;
      }

      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(100, Math.round((step / totalSteps) * 100));

      if (step === 1) {
        store.updateJob(jobId, {
          progressPercent: progress,
          currentStage: 'Injecting Set-of-Marks visual bounding tags into DOM...',
          throughputMbps: 24.5
        });
        store.addLog({
          level: 'dom',
          category: 'SOM_INJECT',
          message: 'DOM parsed: Found 14 candidate containers. Tagged Set-of-Marks bounding boxes 1-14.'
        });
      } else if (step === 3) {
        store.updateJob(jobId, {
          progressPercent: progress,
          discoveredImagesCount: 8,
          currentStage: 'Agent reasoning: Filtering 4 sponsored banner noise elements...',
          throughputMbps: 38.2
        });
        store.addLog({
          level: 'ai',
          category: 'FILTER_NOISE',
          message: 'Qwen reasoning: Elements [3, 7, 9, 12] classified as affiliate ads with 99.4% confidence. Filtered from album candidate ledger.'
        });
      } else if (step === 5) {
        soundEffects.shutter(store.settings.soundEnabled);
        store.updateJob(jobId, {
          progressPercent: progress,
          discoveredImagesCount: 8,
          resolvedOriginalCount: 4,
          currentStage: 'Speculative Original probing: Resolved 4/8 original lossless CDN links...',
          throughputMbps: 54.0
        });
        store.addLog({
          level: 'network',
          category: 'SPECULATIVE_PROBE',
          message: 'Inductive regex matched: Replaced _thumb.jpg with _orig.png. Verified 3840x2160 via HTTP 200 HEAD response.'
        });
      } else if (step === 8) {
        soundEffects.shutter(store.settings.soundEnabled);
        store.updateJob(jobId, {
          progressPercent: progress,
          discoveredImagesCount: 8,
          resolvedOriginalCount: 8,
          currentStage: 'Validating image hashes and extracting EXIF color palettes...',
          throughputMbps: 68.4
        });
        store.addLog({
          level: 'ai',
          category: 'EXIF_PALETTE',
          message: 'Extracted dominant color swatches, aspect ratios, and visual aesthetic scores (Average: 9.7/10).'
        });
      } else if (step >= totalSteps) {
        if (activeInterval) clearInterval(activeInterval);

        // Generate complete album result
        const albumId = `album-extracted-${Date.now()}`;
        const extractedImages: ImageItem[] = [
          {
            id: `img-${Date.now()}-1`,
            thumbnailUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=60',
            previewUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1200&auto=format&fit=crop&q=80',
            originalUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=3840&auto=format&fit=crop&q=100',
            title: `${parsedTitle} - Shot #01`,
            width: 3840,
            height: 2400,
            fileSizeBytes: 6900000,
            aspectRatio: '16:10',
            megapixels: 9.2,
            format: 'jpeg',
            isResolvedOriginal: true,
            status: 'resolved',
            aestheticScore: 9.9,
            sharpnessScore: 100,
            colorPalette: ['#1e293b', '#0284c7', '#38bdf8', '#0f172a'],
            tags: ['Resolução Original', 'Landscape', 'Masterpiece'],
            gps: { latitude: 37.8651, longitude: -119.5383, locationName: 'Yosemite, California' },
            rating: 5,
            colorFlag: 'blue'
          },
          {
            id: `img-${Date.now()}-2`,
            thumbnailUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&auto=format&fit=crop&q=60',
            previewUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&auto=format&fit=crop&q=80',
            originalUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=3840&auto=format&fit=crop&q=100',
            title: `${parsedTitle} - Shot #02`,
            width: 3840,
            height: 2560,
            fileSizeBytes: 5800000,
            aspectRatio: '3:2',
            megapixels: 9.8,
            format: 'jpeg',
            isResolvedOriginal: true,
            status: 'resolved',
            aestheticScore: 9.7,
            sharpnessScore: 98,
            colorPalette: ['#15803d', '#ca8a04', '#166534', '#fef08a'],
            tags: ['Nature', 'Sunlight', 'Original Verified'],
            rating: 5,
            colorFlag: 'green'
          },
          {
            id: `img-${Date.now()}-3`,
            thumbnailUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&auto=format&fit=crop&q=60',
            previewUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80',
            originalUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=3840&auto=format&fit=crop&q=100',
            title: `${parsedTitle} - Shot #03`,
            width: 3840,
            height: 2400,
            fileSizeBytes: 6200000,
            aspectRatio: '16:10',
            megapixels: 9.2,
            format: 'jpeg',
            isResolvedOriginal: true,
            status: 'resolved',
            aestheticScore: 9.8,
            sharpnessScore: 99,
            colorPalette: ['#334155', '#475569', '#cbd5e1', '#0f172a'],
            tags: ['Alpine', 'Fog', 'Atmospheric'],
            rating: 5
          }
        ];

        const newAlbum: Album = {
          id: albumId,
          title: parsedTitle,
          description: `Extracted autonomously from ${url} with 100% original resolution yield.`,
          sourceUrl: url,
          sourceDomain: new URL(url).hostname || 'web-source.mock',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageCount: extractedImages.length,
          resolvedOriginalCount: extractedImages.length,
          totalSizeBytes: extractedImages.reduce((acc, i) => acc + i.fileSizeBytes, 0),
          coverImage: extractedImages[0].originalUrl,
          images: extractedImages,
          tags: ['Extracted', 'Original Verified', mode.replace('_', ' ')],
          extractionMode: mode,
          aiModel: model,
          durationSeconds: Math.round(elapsed * 10) / 10,
          isFavorite: false
        };

        store.addAlbum(newAlbum);

        store.updateJob(jobId, {
          status: 'completed',
          progressPercent: 100,
          discoveredImagesCount: extractedImages.length,
          resolvedOriginalCount: extractedImages.length,
          currentStage: `Saved ${extractedImages.length} Original images to permanent library`,
          endTime: new Date().toISOString(),
          durationSeconds: Math.round(elapsed * 10) / 10,
          resultAlbumId: albumId
        });

        store.addLog({
          level: 'info',
          category: 'COMPLETED',
          message: `Job ${jobId} finished in ${Math.round(elapsed * 10) / 10}s. Saved album: "${parsedTitle}" with ${extractedImages.length} verified Original images.`
        });

        store.addNotification({
          title: 'Extração Concluída!',
          message: `Álbum "${parsedTitle}" finalizado com ${extractedImages.length} fotos Original!`,
          type: 'success',
          linkViewId: 'album-detail',
          linkAlbumId: albumId
        });

        soundEffects.success(store.settings.soundEnabled);

        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch (_) {}
      }
    }, 900);

    return newJob;
  },

  pauseJob(jobId: string) {
    useAppStore.getState().updateJob(jobId, { status: 'paused' });
    useAppStore.getState().addLog({
      level: 'warning',
      category: 'JOB_PAUSED',
      message: `Job ${jobId} paused by user.`
    });
  },

  resumeJob(jobId: string) {
    useAppStore.getState().updateJob(jobId, { status: 'active' });
    useAppStore.getState().addLog({
      level: 'info',
      category: 'JOB_RESUMED',
      message: `Job ${jobId} resumed.`
    });
  },

  cancelJob(jobId: string) {
    if (activeInterval) clearInterval(activeInterval);
    useAppStore.getState().updateJob(jobId, { status: 'cancelled' });
    useAppStore.getState().addLog({
      level: 'error',
      category: 'JOB_CANCELLED',
      message: `Job ${jobId} cancelled.`
    });
  }
};

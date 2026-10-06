// Ambient Focus Audio Soundscapes Generator (Lo-Fi / Rain / White Noise with Web Audio API)
let ambientCtx: AudioContext | null = null;
let currentSourceNode: AudioNode | null = null;
let ambientGainNode: GainNode | null = null;

export const ambientAudio = {
  play(type: 'none' | 'lofi' | 'rain' | 'whitenoise', volume = 0.3) {
    if (type === 'none') {
      this.stop();
      return;
    }

    if (!ambientCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        ambientCtx = new AudioContextClass();
      }
    }

    if (!ambientCtx) return;
    if (ambientCtx.state === 'suspended') {
      ambientCtx.resume();
    }

    this.stop();

    ambientGainNode = ambientCtx.createGain();
    ambientGainNode.gain.setValueAtTime(volume * 0.15, ambientCtx.currentTime);
    ambientGainNode.connect(ambientCtx.destination);

    // Create White Noise buffer
    const bufferSize = ambientCtx.sampleRate * 2;
    const noiseBuffer = ambientCtx.createBuffer(1, bufferSize, ambientCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ambientCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // Filter depending on type
    const filter = ambientCtx.createBiquadFilter();

    if (type === 'rain') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, ambientCtx.currentTime);
      filter.Q.setValueAtTime(3, ambientCtx.currentTime);
    } else if (type === 'lofi') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, ambientCtx.currentTime);
      filter.Q.setValueAtTime(2.5, ambientCtx.currentTime);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, ambientCtx.currentTime);
    }

    whiteNoise.connect(filter);
    filter.connect(ambientGainNode);
    whiteNoise.start();
    currentSourceNode = whiteNoise;
  },

  setVolume(volume: number) {
    if (ambientGainNode && ambientCtx) {
      ambientGainNode.gain.setValueAtTime(volume * 0.15, ambientCtx.currentTime);
    }
  },

  stop() {
    if (currentSourceNode) {
      try {
        (currentSourceNode as any).stop();
        currentSourceNode.disconnect();
      } catch (_) {}
      currentSourceNode = null;
    }
  }
};

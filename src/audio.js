export class ShowAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.enabled = false;
  }

  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
    this.enabled = true;
  }

  cue(type) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;

    if (type === "correct") this.tone(now, 440, 740, 0.24, "triangle");
    if (type === "wrong") this.tone(now, 180, 76, 0.36, "sawtooth");
    if (type === "landGreen") this.tone(now, 520, 880, 0.14, "sine");
    if (type === "landRed") this.tone(now, 160, 92, 0.2, "square");
    if (type === "release") this.noiseBurst(now, 0.09);
    if (type === "contract") this.tone(now, 110, 130, 0.8, "sine");
  }

  tone(start, fromFrequency, toFrequency, duration, type) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, toFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.7, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  noiseBurst(start, duration) {
    const bufferSize = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = 0.28;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.master);
    source.start(start);
  }
}

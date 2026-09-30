/**
 * Áudio 100% procedural (Web Audio): trilhas ambiente orquestrais sombrias e efeitos sonoros
 * sintetizados — sem arquivos. Tom menor, cordas (pads), sinos, sopros e tambores graves.
 */

export type MusicTrack = 'menu' | 'world' | 'battle' | 'editor' | null;
export type Sfx =
  | 'click'
  | 'hit'
  | 'crit'
  | 'miss'
  | 'death'
  | 'heal'
  | 'fogo'
  | 'agua'
  | 'eletricidade'
  | 'gelo'
  | 'vento'
  | 'veneno'
  | 'luz'
  | 'step'
  | 'turn'
  | 'victory'
  | 'defeat'
  | 'coin'
  | 'encounter'
  | 'combo';

const A4 = 440;
const midi = (n: number) => A4 * Math.pow(2, (n - 69) / 12);

interface TrackDef {
  bpm: number;
  /** Acordes (notas MIDI) por compasso. */
  chords: number[][];
  /** Melodia por colcheia (null = pausa), repete. */
  melody: (number | null)[];
  bass: boolean;
  drums: 'none' | 'soft' | 'war';
  bells: boolean;
}

// Ré menor / Lá menor — progressões sombrias de fantasia.
const TRACKS: Record<Exclude<MusicTrack, null>, TrackDef> = {
  menu: {
    bpm: 60,
    chords: [
      [50, 57, 62, 65],
      [46, 53, 58, 62],
      [41, 48, 57, 60],
      [45, 52, 57, 61],
    ],
    melody: [74, null, 72, null, 69, null, null, null, 70, null, 69, null, 65, null, null, null, 69, null, 67, null, 65, null, 64, null, 62, null, null, null, 61, null, null, null],
    bass: true,
    drums: 'none',
    bells: true,
  },
  world: {
    bpm: 76,
    chords: [
      [50, 57, 62, 65],
      [48, 55, 60, 64],
      [46, 53, 58, 62],
      [45, 52, 57, 61],
      [50, 57, 62, 65],
      [43, 50, 55, 58],
      [45, 52, 57, 60],
      [45, 52, 57, 61],
    ],
    melody: [62, null, 65, 69, null, 67, 65, null, 64, null, 60, null, 62, null, null, null, 65, null, 69, 72, null, 70, 69, null, 67, null, 65, 64, 62, null, null, null],
    bass: true,
    drums: 'soft',
    bells: false,
  },
  battle: {
    bpm: 112,
    chords: [
      [45, 52, 57, 60],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
      [45, 52, 57, 60],
      [45, 52, 57, 60],
      [40, 47, 52, 56],
      [40, 47, 52, 56],
    ],
    melody: [69, 69, 72, 69, 76, null, 74, 72, 71, null, 69, null, 68, null, 69, null, 69, 69, 72, 69, 77, null, 76, 74, 72, 71, 69, 68, 69, null, null, null],
    bass: true,
    drums: 'war',
    bells: false,
  },
  editor: {
    bpm: 58,
    chords: [
      [48, 55, 60, 64],
      [45, 52, 57, 60],
      [41, 48, 53, 57],
      [43, 50, 55, 59],
    ],
    melody: [72, null, null, null, 71, null, null, null, 69, null, null, null, 67, null, null, null],
    bass: false,
    drums: 'none',
    bells: true,
  },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  private track: MusicTrack = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  muted = false;
  musicVolume = 0.35;
  sfxVolume = 0.6;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem('jogo:audio') ?? '{}') as { muted?: boolean; music?: number; sfx?: number };
      this.muted = !!saved.muted;
      this.musicVolume = saved.music ?? this.musicVolume;
      this.sfxVolume = saved.sfx ?? this.sfxVolume;
    } catch {
      /* sem armazenamento */
    }
  }

  /** Navegadores só liberam áudio depois de um gesto do usuário. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.45;
    this.reverb.connect(wet).connect(this.master);
    this.musicBus.connect(this.master);
    this.musicBus.connect(this.reverb);
    this.sfxBus.connect(this.master);
    this.noiseBuf = this.makeNoise();
    const pending = this.track;
    this.track = null;
    if (pending) this.music(pending);
  }

  private persist(): void {
    try {
      localStorage.setItem('jogo:audio', JSON.stringify({ muted: this.muted, music: this.musicVolume, sfx: this.sfxVolume }));
    } catch {
      /* sem armazenamento */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    this.persist();
    return this.muted;
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
    this.persist();
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    this.persist();
  }

  // ───────────────────────────── música ─────────────────────────────

  music(track: MusicTrack): void {
    if (track === this.track) return;
    this.track = track;
    if (!this.ctx) return;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    // Fade da trilha anterior.
    const old = this.musicBus;
    const t = this.ctx.currentTime;
    old.gain.setTargetAtTime(0, t, 0.4);
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    bus.connect(this.reverb);
    bus.gain.setTargetAtTime(this.musicVolume, t + 0.3, 0.8);
    this.musicBus = bus;
    setTimeout(() => old.disconnect(), 3000);
    if (!track) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const def = TRACKS[this.track];
    const eighth = 60 / def.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(def, this.step, this.nextTime, eighth);
      this.nextTime += eighth;
      this.step++;
    }
  }

  private playStep(def: TrackDef, step: number, t: number, eighth: number): void {
    const bar = Math.floor(step / 8) % def.chords.length;
    const chord = def.chords[bar]!;
    const inBar = step % 8;
    if (inBar === 0) {
      // Cordas: pad com ataque lento.
      for (const n of chord) this.strings(midi(n), t, eighth * 8.2, 0.05);
      if (def.bass) this.bassNote(midi(chord[0]! - 12), t, eighth * 7.5);
    }
    if (def.bass && def.drums === 'war' && inBar % 2 === 0) this.bassNote(midi(chord[0]! - 12), t, eighth * 0.9, 0.12);
    const m = def.melody[step % def.melody.length];
    if (m !== null && m !== undefined) {
      if (def.bells) this.bell(midi(m + 12), t, 0.05);
      else this.horn(midi(m), t, eighth * 1.8, 0.06);
    }
    if (def.bells && inBar === 4) this.bell(midi(chord[2]! + 12), t, 0.03);
    if (def.drums === 'soft' && inBar === 0) this.drum(t, 70, 0.25);
    if (def.drums === 'war') {
      if (inBar === 0 || inBar === 3 || inBar === 6) this.drum(t, 55, 0.5);
      if (inBar === 4) this.drum(t, 90, 0.3);
      if (inBar % 2 === 1) this.noiseHit(t, 0.035, 5000, 0.04, this.musicBus);
    }
  }

  private strings(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    f.Q.value = 0.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(vol * 0.7, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    f.connect(g).connect(this.musicBus);
    for (const detune of [-8, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private bassNote(freq: number, t: number, dur: number, vol = 0.1): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = 400;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private horn(freq: number, t: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o2.type = 'triangle';
    o.frequency.value = freq;
    o2.frequency.value = freq / 2;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.linearRampToValueAtTime(1800, t + 0.12);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 5;
    lfoGain.gain.value = 4;
    lfo.connect(lfoGain).connect(o.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.08);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f);
    o2.connect(f);
    f.connect(g).connect(this.musicBus);
    for (const x of [o, o2, lfo]) {
      x.start(t);
      x.stop(t + dur + 0.05);
    }
  }

  private bell(freq: number, t: number, vol: number): void {
    const ctx = this.ctx!;
    for (const [mult, v] of [
      [1, 1],
      [2.76, 0.4],
      [5.4, 0.2],
    ] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      g.gain.setValueAtTime(vol * v, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 2.5 / mult);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + 2.6);
    }
  }

  private drum(t: number, freq: number, vol: number, bus: AudioNode = this.musicBus): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.65);
  }

  // ───────────────────────────── efeitos ─────────────────────────────

  sfx(kind: Sfx): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    const bus = this.sfxBus;
    switch (kind) {
      case 'click':
        this.tone(t, 900, 700, 0.04, 'square', 0.05);
        break;
      case 'step':
        this.noiseHit(t, 0.05, 900, 0.08, bus);
        break;
      case 'turn':
        this.tone(t, 660, 660, 0.1, 'triangle', 0.08);
        this.tone(t + 0.08, 990, 990, 0.15, 'triangle', 0.06);
        break;
      case 'hit':
        this.noiseHit(t, 0.12, 1800, 0.35, bus);
        this.drum(t, 90, 0.35, bus);
        break;
      case 'crit':
        this.noiseHit(t, 0.2, 2500, 0.45, bus);
        this.drum(t, 70, 0.5, bus);
        this.tone(t, 1200, 400, 0.25, 'sawtooth', 0.08);
        break;
      case 'miss':
        this.noiseSweep(t, 0.25, 3000, 600, 0.12);
        break;
      case 'death':
        this.tone(t, 300, 60, 0.9, 'sawtooth', 0.15);
        this.drum(t, 45, 0.5, bus);
        break;
      case 'heal':
        [0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.07, midi(72 + n), midi(72 + n), 0.35, 'sine', 0.08));
        break;
      case 'fogo':
        this.noiseSweep(t, 0.6, 400, 2500, 0.3);
        this.drum(t, 60, 0.3, bus);
        break;
      case 'agua':
        for (let i = 0; i < 5; i++) this.tone(t + i * 0.05, 500 + Math.random() * 700, 200, 0.08, 'sine', 0.08);
        this.noiseSweep(t, 0.4, 1200, 300, 0.12);
        break;
      case 'eletricidade':
        for (let i = 0; i < 6; i++) this.tone(t + i * 0.03, 1800 - i * 200, 100, 0.05, 'square', 0.07);
        this.noiseHit(t, 0.3, 6000, 0.2, bus);
        break;
      case 'gelo':
        [88, 91, 95, 100].forEach((n, i) => this.tone(t + i * 0.04, midi(n), midi(n), 0.5, 'sine', 0.05));
        this.noiseSweep(t, 0.3, 5000, 8000, 0.08);
        break;
      case 'vento':
        this.noiseSweep(t, 0.8, 300, 1800, 0.18, 'bandpass');
        break;
      case 'veneno':
        this.tone(t, 200, 150, 0.5, 'sawtooth', 0.06);
        this.noiseSweep(t, 0.5, 800, 400, 0.1);
        break;
      case 'luz':
        [79, 84, 88, 91].forEach((n) => this.tone(t, midi(n), midi(n), 0.9, 'sine', 0.04));
        break;
      case 'combo':
        [62, 65, 69, 74, 77].forEach((n, i) => this.tone(t + i * 0.05, midi(n), midi(n), 0.4, 'sawtooth', 0.05));
        break;
      case 'coin':
        this.tone(t, 1320, 1320, 0.08, 'square', 0.05);
        this.tone(t + 0.07, 1760, 1760, 0.2, 'square', 0.05);
        break;
      case 'encounter':
        this.drum(t, 50, 0.5, bus);
        this.tone(t, midi(57), midi(57), 0.6, 'sawtooth', 0.08);
        this.tone(t + 0.2, midi(56), midi(56), 0.8, 'sawtooth', 0.08);
        break;
      case 'victory':
        [
          [62, 0],
          [66, 0.18],
          [69, 0.36],
          [74, 0.54],
        ].forEach(([n, d]) => this.tone(t + d!, midi(n!), midi(n!), d === 0.54 ? 1.4 : 0.3, 'sawtooth', 0.07));
        this.drum(t + 0.54, 60, 0.4, bus);
        break;
      case 'defeat':
        [
          [62, 0],
          [61, 0.4],
          [57, 0.8],
          [50, 1.2],
        ].forEach(([n, d]) => this.tone(t + d!, midi(n!), midi(n!), 0.8, 'triangle', 0.09));
        break;
    }
  }

  private tone(t: number, f0: number, f1: number, dur: number, type: OscillatorType, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, freq: number, vol: number, bus: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private noiseSweep(t: number, dur: number, f0: number, f1: number, vol: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = type === 'bandpass' ? 3 : 0.7;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
}

export const Audio = new AudioEngine();

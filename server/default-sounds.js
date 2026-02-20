/**
 * Default soundboard clips — synthesized as PCM WAV data URIs.
 * Each sound is generated programmatically (no external files needed).
 */

const SAMPLE_RATE = 22050;

function generateWav(samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * 2; // 16-bit mono
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);       // chunk size
  buffer.writeUInt16LE(1, 20);        // PCM
  buffer.writeUInt16LE(1, 22);        // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32);        // block align
  buffer.writeUInt16LE(16, 34);       // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }

  return 'data:audio/wav;base64,' + buffer.toString('base64');
}

function tone(freq, duration, volume = 0.8, waveform = 'square') {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    let val;
    if (waveform === 'sine') {
      val = Math.sin(2 * Math.PI * freq * t);
    } else if (waveform === 'square') {
      val = Math.sin(2 * Math.PI * freq * t) > 0 ? 1 : -1;
    } else if (waveform === 'sawtooth') {
      val = 2 * (freq * t - Math.floor(freq * t + 0.5));
    } else if (waveform === 'triangle') {
      val = 2 * Math.abs(2 * (freq * t - Math.floor(freq * t + 0.5))) - 1;
    }
    // Envelope: quick attack, sustain, quick release
    const env = Math.min(1, i / (SAMPLE_RATE * 0.005)) * Math.min(1, (numSamples - i) / (SAMPLE_RATE * 0.01));
    samples[i] = val * volume * env;
  }
  return samples;
}

function noise(duration, volume = 0.5) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = (Math.random() * 2 - 1) * volume;
  }
  return samples;
}

function concat(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float64Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function silence(duration) {
  return new Float64Array(Math.floor(SAMPLE_RATE * duration));
}

function mix(a, b) {
  const len = Math.max(a.length, b.length);
  const result = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = (i < a.length ? a[i] : 0) + (i < b.length ? b[i] : 0);
  }
  return result;
}

function fadeOut(samples, fadeDuration = 0.1) {
  const fadeSamples = Math.floor(SAMPLE_RATE * fadeDuration);
  const start = samples.length - fadeSamples;
  for (let i = start; i < samples.length; i++) {
    samples[i] *= (samples.length - i) / fadeSamples;
  }
  return samples;
}

function fadeIn(samples, fadeDuration = 0.05) {
  const fadeSamples = Math.floor(SAMPLE_RATE * fadeDuration);
  for (let i = 0; i < fadeSamples && i < samples.length; i++) {
    samples[i] *= i / fadeSamples;
  }
  return samples;
}

// Apply vibrato (frequency modulation)
function vibrato(freq, duration, vibratoRate, vibratoDepth, volume = 0.6, waveform = 'sine') {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const modFreq = freq + vibratoDepth * Math.sin(2 * Math.PI * vibratoRate * t);
    phase += modFreq / SAMPLE_RATE;
    let val;
    if (waveform === 'sine') {
      val = Math.sin(2 * Math.PI * phase);
    } else if (waveform === 'sawtooth') {
      val = 2 * (phase - Math.floor(phase + 0.5));
    }
    const env = Math.min(1, i / (SAMPLE_RATE * 0.01)) * Math.min(1, (numSamples - i) / (SAMPLE_RATE * 0.05));
    samples[i] = val * volume * env;
  }
  return samples;
}

// Pitch sweep (glide from one frequency to another)
function sweep(startFreq, endFreq, duration, volume = 0.7, waveform = 'sine') {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Float64Array(numSamples);
  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / numSamples;
    const freq = startFreq + (endFreq - startFreq) * t;
    phase += freq / SAMPLE_RATE;
    let val;
    if (waveform === 'sine') val = Math.sin(2 * Math.PI * phase);
    else if (waveform === 'square') val = Math.sin(2 * Math.PI * phase) > 0 ? 1 : -1;
    else if (waveform === 'sawtooth') val = 2 * (phase - Math.floor(phase + 0.5));
    else if (waveform === 'triangle') val = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
    const env = Math.min(1, i / (SAMPLE_RATE * 0.005)) * Math.min(1, (numSamples - i) / (SAMPLE_RATE * 0.02));
    samples[i] = val * volume * env;
  }
  return samples;
}

// ─── Sound Generators ────────────────────────────────────────────────────────

function generateAirhorn() {
  // Classic MLG airhorn — loud dissonant brass chord
  const dur = 1.5;
  const s1 = tone(494, dur, 0.5, 'sawtooth');   // B4
  const s2 = tone(523, dur, 0.5, 'sawtooth');   // C5
  const s3 = tone(587, dur, 0.4, 'sawtooth');   // D5
  const s4 = tone(370, dur, 0.3, 'square');      // F#4 low buzz
  let combined = mix(mix(s1, s2), mix(s3, s4));
  // Clip it loud
  for (let i = 0; i < combined.length; i++) {
    combined[i] = Math.max(-0.95, Math.min(0.95, combined[i] * 1.3));
  }
  return fadeOut(combined, 0.3);
}

function generateCrickets() {
  // Chirping crickets — high-pitched bursts with pauses
  const parts = [];
  for (let chirp = 0; chirp < 6; chirp++) {
    // Each chirp is 3 quick pulses
    for (let pulse = 0; pulse < 3; pulse++) {
      const freq = 4200 + Math.random() * 400;
      parts.push(tone(freq, 0.04, 0.35, 'sine'));
      parts.push(silence(0.03));
    }
    parts.push(silence(0.25 + Math.random() * 0.15));
  }
  return concat(...parts);
}

function generateSadViolin() {
  // Sad descending violin notes with vibrato
  const notes = [
    { freq: 660, dur: 0.6 },   // E5
    { freq: 622, dur: 0.5 },   // Eb5
    { freq: 587, dur: 0.5 },   // D5
    { freq: 523, dur: 0.8 },   // C5 (hold)
    { freq: 494, dur: 1.0 },   // B4 (final, long)
  ];
  const parts = [];
  for (const n of notes) {
    const note = vibrato(n.freq, n.dur, 5.5, 8, 0.5, 'sawtooth');
    // Add a bit of higher harmonic for violin character
    const harmonic = vibrato(n.freq * 2, n.dur, 5.5, 12, 0.15, 'sine');
    parts.push(fadeOut(mix(note, harmonic), 0.08));
    parts.push(silence(0.05));
  }
  return concat(...parts);
}

function generateWompWomp() {
  // Trombone "womp womp womp wommmmmp" — descending pitch bends
  const womp1 = sweep(350, 250, 0.35, 0.7, 'sawtooth');
  const womp2 = sweep(330, 230, 0.35, 0.7, 'sawtooth');
  const womp3 = sweep(310, 210, 0.35, 0.7, 'sawtooth');
  const wompFinal = sweep(290, 120, 1.0, 0.7, 'sawtooth');

  return concat(
    womp1, silence(0.15),
    womp2, silence(0.15),
    womp3, silence(0.15),
    fadeOut(wompFinal, 0.4)
  );
}

function generateRimshot() {
  // Ba-dum-tss — two quick tones + cymbal crash (noise)
  const kick = fadeOut(sweep(200, 60, 0.08, 0.8, 'sine'), 0.05);
  const snare1 = fadeOut(mix(tone(250, 0.06, 0.5, 'triangle'), noise(0.06, 0.3)), 0.03);
  const snare2 = fadeOut(mix(tone(280, 0.06, 0.5, 'triangle'), noise(0.06, 0.3)), 0.03);
  const cymbal = fadeOut(noise(0.4, 0.45), 0.3);
  // Mix snare2 with cymbal
  const tss = mix(snare2, cymbal);

  return concat(
    kick, silence(0.12),
    snare1, silence(0.08),
    tss
  );
}

function generateSadTrombone() {
  // Classic "wah wah wah wahhh" (Price is Right lose horn)
  // Four descending notes, last one long and extra low
  const n1 = vibrato(392, 0.4, 4, 5, 0.6, 'sawtooth');  // G4
  const n2 = vibrato(370, 0.4, 4, 5, 0.6, 'sawtooth');  // F#4
  const n3 = vibrato(349, 0.4, 4, 5, 0.6, 'sawtooth');  // F4
  const n4 = vibrato(311, 1.2, 4, 8, 0.6, 'sawtooth');  // Eb4 (long, wobblier)

  return concat(
    fadeOut(n1, 0.05), silence(0.05),
    fadeOut(n2, 0.05), silence(0.05),
    fadeOut(n3, 0.05), silence(0.05),
    fadeOut(n4, 0.5)
  );
}

function generateDun() {
  // Dramatic "DUN DUN DUN" — Law & Order style
  const hit = (freq, dur) => {
    const s1 = tone(freq, dur, 0.6, 'sawtooth');
    const s2 = tone(freq * 0.5, dur, 0.4, 'square');
    const n = noise(dur, 0.05);
    return fadeOut(mix(mix(s1, s2), n), dur * 0.3);
  };

  return concat(
    hit(147, 0.5),   // D3
    silence(0.3),
    hit(147, 0.5),   // D3
    silence(0.6),
    hit(131, 0.9),   // C3 (final, longer)
  );
}

function generateVineBoom() {
  // Deep bass boom + impact noise — the vine boom meme
  const boom = sweep(120, 30, 0.6, 0.9, 'sine');
  const impact = fadeOut(noise(0.08, 0.7), 0.06);
  const sub = tone(40, 0.5, 0.5, 'sine');
  // Layer impact at the start
  let combined = mix(boom, sub);
  // Add impact at beginning
  for (let i = 0; i < impact.length && i < combined.length; i++) {
    combined[i] += impact[i];
    combined[i] = Math.max(-0.95, Math.min(0.95, combined[i]));
  }
  return fadeOut(combined, 0.2);
}

// ─── Meme Sounds ─────────────────────────────────────────────────────────────

function generateBruh() {
  // Low "bruh" — descending bass tone with slight vibrato
  const main = sweep(180, 90, 0.6, 0.7, 'sawtooth');
  const sub = sweep(90, 45, 0.6, 0.4, 'sine');
  return fadeOut(mix(main, sub), 0.2);
}

function generateOhNo() {
  // "Oh no!" — two-note descending slide
  const oh = vibrato(440, 0.3, 6, 10, 0.5, 'sine');
  const no = sweep(380, 200, 0.5, 0.6, 'sawtooth');
  return concat(fadeOut(oh, 0.05), silence(0.08), fadeOut(no, 0.15));
}

function generateSheesh() {
  // Rising "sheesh" whistle — ascending tone with noise
  const whistle = sweep(800, 2400, 0.8, 0.4, 'sine');
  const hiss = fadeIn(fadeOut(noise(0.8, 0.15), 0.2), 0.1);
  return fadeOut(mix(whistle, hiss), 0.1);
}

function generateBonk() {
  // Cartoon bonk — sharp impact + descending wobble
  const impact = fadeOut(mix(tone(800, 0.05, 0.8, 'square'), noise(0.05, 0.6)), 0.03);
  const wobble = sweep(600, 200, 0.3, 0.5, 'sine');
  const spring = vibrato(400, 0.4, 15, 80, 0.3, 'sine');
  return concat(impact, fadeOut(mix(wobble, spring), 0.15));
}

function generateNoice() {
  // "Noice" click — snappy, satisfying pop
  const click = fadeOut(tone(1200, 0.03, 0.8, 'square'), 0.02);
  const pop = fadeOut(sweep(600, 300, 0.15, 0.6, 'sine'), 0.08);
  const ring = fadeOut(tone(880, 0.3, 0.2, 'sine'), 0.2);
  return concat(click, mix(pop, ring));
}

function generateSus() {
  // Among Us "sus" — ominous two-note pattern
  const n1 = vibrato(220, 0.4, 3, 5, 0.5, 'sawtooth');
  const n2 = vibrato(185, 0.6, 3, 8, 0.5, 'sawtooth');
  const sub1 = tone(110, 0.4, 0.3, 'sine');
  const sub2 = tone(93, 0.6, 0.3, 'sine');
  return concat(fadeOut(mix(n1, sub1), 0.05), silence(0.1), fadeOut(mix(n2, sub2), 0.2));
}

function generateWilhelm() {
  // Classic "Wilhelm scream" approximation — high pitched ascending yell
  const scream = sweep(400, 900, 0.6, 0.6, 'sawtooth');
  const harmonic = sweep(800, 1800, 0.6, 0.25, 'sine');
  const breath = fadeIn(fadeOut(noise(0.6, 0.1), 0.3), 0.05);
  return fadeOut(mix(mix(scream, harmonic), breath), 0.15);
}

function generateFart() {
  // Low rumble + noise burst
  const rumble = vibrato(80, 0.5, 12, 30, 0.6, 'sawtooth');
  const buzz = noise(0.5, 0.25);
  const sub = tone(50, 0.5, 0.3, 'sine');
  let combined = mix(mix(rumble, buzz), sub);
  // Amplitude envelope: quick start, swell, quick end
  for (let i = 0; i < combined.length; i++) {
    const t = i / combined.length;
    const env = Math.sin(Math.PI * t) * (1 + 0.3 * Math.sin(t * 20));
    combined[i] *= env;
  }
  return fadeOut(combined, 0.1);
}

// ─── Export all default sounds ───────────────────────────────────────────────

const DEFAULT_SOUNDS = [
  { name: 'Airhorn', emoji: '📯', generator: generateAirhorn, page: 'classic' },
  { name: 'Crickets', emoji: '🦗', generator: generateCrickets, page: 'classic' },
  { name: 'Sad Violin', emoji: '🎻', generator: generateSadViolin, page: 'classic' },
  { name: 'Womp Womp', emoji: '📉', generator: generateWompWomp, page: 'classic' },
  { name: 'Rimshot', emoji: '🥁', generator: generateRimshot, page: 'classic' },
  { name: 'Sad Trombone', emoji: '🎺', generator: generateSadTrombone, page: 'classic' },
  { name: 'DUN DUN DUN', emoji: '⚖️', generator: generateDun, page: 'classic' },
  { name: 'Vine Boom', emoji: '💥', generator: generateVineBoom, page: 'classic' },
  { name: 'Bruh', emoji: '😐', generator: generateBruh, page: 'meme' },
  { name: 'Oh No', emoji: '😱', generator: generateOhNo, page: 'meme' },
  { name: 'Sheesh', emoji: '🥶', generator: generateSheesh, page: 'meme' },
  { name: 'Bonk', emoji: '🔨', generator: generateBonk, page: 'meme' },
  { name: 'Noice', emoji: '👌', generator: generateNoice, page: 'meme' },
  { name: 'Sus', emoji: '📮', generator: generateSus, page: 'meme' },
  { name: 'Wilhelm', emoji: '😫', generator: generateWilhelm, page: 'meme' },
  { name: 'Toot', emoji: '💨', generator: generateFart, page: 'meme' },
];

function getDefaultSounds() {
  return DEFAULT_SOUNDS.map(s => {
    const audio = s.generator();
    const wav = generateWav(Array.from(audio));
    const duration = audio.length / SAMPLE_RATE;
    return {
      name: s.name,
      emoji: s.emoji,
      trimmedAudio: wav,
      originalAudio: wav,
      trimStart: 0,
      trimEnd: duration,
      duration,
      volume: 1.0,
      isGlobal: false,
      isDefault: true,
      page: s.page || 'classic',
    };
  });
}

module.exports = { getDefaultSounds };

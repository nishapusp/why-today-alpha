/**
 * Generates remotion/public/audio/bg-music.wav — a synthesized ambient pad
 * used as background music for exported Visual Story videos, in place of a
 * licensed track (none available; every royalty-free library reachable
 * from a normal environment is blocked by this sandbox's network policy).
 * Pure Node, no ffmpeg/network dependency, so it's reproducible anywhere.
 *
 * Every oscillator's frequency is an exact integer multiple of 1/DURATION,
 * so the whole buffer is perfectly periodic — Remotion's <Audio loop>
 * repeats it with no audible seam at the loop point.
 *
 * Replace the output file with a real licensed track at any time (same
 * filename, or bg-music.mp3 — see remotion/public/audio/README.md) and
 * this generator becomes irrelevant; nothing else needs to change.
 */
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;
const DURATION = 16; // seconds — must stay whole so every voice below is period-exact
const CHANNELS = 2;
const BITS = 16;
const OUT_PATH = path.join(__dirname, "..", "remotion", "public", "audio", "bg-music.wav");

// { integerCycles, amplitude, phaseOffsetR } — frequency = integerCycles / DURATION.
// A couple of tones get a neighboring integer (detuned by exactly 1/DURATION Hz)
// layered in, which beats slowly against the main tone at exactly one cycle per
// loop — a gentle "breathing" chorus rather than a static, flat chord.
const VOICES = [
  { cycles: 1047, amplitude: 0.1 }, // C2 (bass)
  { cycles: 2093, amplitude: 0.09 }, // C3
  { cycles: 2094, amplitude: 0.05 }, // C3, detuned +1/16 Hz
  { cycles: 2637, amplitude: 0.08 }, // E3
  { cycles: 3136, amplitude: 0.09 }, // G3
  { cycles: 3137, amplitude: 0.05 }, // G3, detuned +1/16 Hz
  { cycles: 3951, amplitude: 0.06 }, // B3
  { cycles: 5274, amplitude: 0.035 }, // E4 (shimmer)
];

const TARGET_PEAK = 0.42;
const rawPeak = VOICES.reduce((sum, v) => sum + v.amplitude, 0);
const NORMALIZE = TARGET_PEAK / rawPeak;
const R_PHASE_OFFSET = 0.35; // radians — subtle stereo width, applied to alternating voices

function sampleAt(t, channel) {
  let sum = 0;
  VOICES.forEach((v, i) => {
    const freq = v.cycles / DURATION;
    const phase = channel === "R" && i % 2 === 1 ? R_PHASE_OFFSET : 0;
    sum += v.amplitude * Math.sin(2 * Math.PI * freq * t + phase);
  });
  // One slow swell per loop (integer multiple of 1/DURATION keeps it seamless too).
  const envelope = 0.85 + 0.15 * Math.sin((2 * Math.PI * t) / DURATION);
  return sum * envelope * NORMALIZE;
}

const numSamples = SAMPLE_RATE * DURATION;
const dataSize = numSamples * CHANNELS * (BITS / 8);
const buf = Buffer.alloc(44 + dataSize);

buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(CHANNELS, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);
buf.writeUInt16LE(BITS, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataSize, 40);

let offset = 44;
for (let i = 0; i < numSamples; i++) {
  const t = i / SAMPLE_RATE;
  const l = Math.max(-1, Math.min(1, sampleAt(t, "L")));
  const r = Math.max(-1, Math.min(1, sampleAt(t, "R")));
  buf.writeInt16LE(Math.round(l * 32767), offset);
  offset += 2;
  buf.writeInt16LE(Math.round(r * 32767), offset);
  offset += 2;
}

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, buf);
console.log(`Wrote ${OUT_PATH} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${DURATION}s loop)`);

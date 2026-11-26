// Builds puzzles off the main thread (a 15x15 hard board takes a few seconds).
import { PuzzleGenerator, Shape, PuzzleCode } from './core.js';

self.onmessage = (ev) => {
  const m = ev.data || {};
  try {
    const shape = Shape.fromCode(m.shape || '');
    const seed = m.seed != null && m.seed !== '' ? BigInt(m.seed) : PuzzleCode.randomSeed();
    const p = PuzzleGenerator.generate(m.width, m.height, m.difficulty, seed, shape);
    self.postMessage({ id: m.id, text: p.encode(true), difficulty: p.difficulty, seed: p.seed.toString(), shape: shape.code });
  } catch (e) {
    self.postMessage({ id: m.id, error: String(e && e.message || e) });
  }
};

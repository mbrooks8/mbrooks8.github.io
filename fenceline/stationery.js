// Stationery paper: faint pencil doodles for the themed papers in the store (cats, fish, plants...).
// Each paper gets a sparse tile of small doodles all over, and one bigger doodle peeking in from the bottom corner.
// Grid papers draw lines or dots instead. The rarest papers move: their tile drifts slowly on its own layer (CSS transform,
// so the phone's compositor does the work), and stops for players who ask for less motion.
// All drawn as small SVG pictures (doodles.js, no image files), made once per paper and theme, then used as CSS backgrounds.
// The doodles stay very light so clues and fence lines are always easy to read (tests/cosmetics.test.mjs checks it).
import { D, CORNER, place } from './doodles.js';

/**
 * Every themed paper's look: [tile] = small doodles on a 240 x 240 tile ([doodle, x, y, size, turn in degrees]),
 * or [grid] = a ruled pattern instead; [anim] = how the tile moves ('fall', 'swim', 'drift', 'glow'), for the moving papers;
 * [day] / [night] = [stroke, fill] colours. Doodles are kept light by ALPHA (see tests for the limits).
 */
export const MOTIFS = {
  cat: {
    tile: [['catFace', 20, 24, 1.3, -8], ['paw', 150, 18, 1, 18], ['yarn', 96, 112, 1.15, 0], ['paw', 196, 150, 0.9, -22], ['paw', 28, 176, 0.85, 12], ['catFace', 170, 196, 1, 10]],
    day: ['#A0704E', '#E8B9A4'], night: ['#D8B39A', '#6E4E43'],
  },
  fish: {
    tile: [['fish', 24, 30, 1.3, -6], ['bubbles', 120, 16, 1, 0], ['weed', 196, 72, 1.2, 0], ['fish', 120, 120, 1, 8], ['bubbles', 36, 150, 0.85, 12], ['fish', 168, 196, 1.05, 180]],
    day: ['#3F7FA0', '#A9D6DF'], night: ['#8CC7DA', '#2F5662'],
  },
  plant: {
    tile: [['leaf', 24, 24, 1.2, -24], ['sprout', 140, 20, 1.1, 0], ['pot', 92, 110, 1.25, 0], ['leaf', 200, 120, 0.95, 32], ['sprout', 24, 176, 0.95, 0], ['leaf', 160, 196, 1, 70]],
    day: ['#5E8A4E', '#BFD9A6'], night: ['#A6CF8E', '#3C5634'],
  },
  stars: {
    tile: [['star', 24, 24, 1.1, -10], ['twinkle', 140, 30, 0.9, 0], ['moon', 96, 110, 1.2, -15], ['star', 196, 130, 0.85, 18], ['twinkle', 34, 170, 0.8, 0], ['star', 164, 200, 0.95, 6]],
    day: ['#6A64B0', '#D6D2F0'], night: ['#D9C67E', '#4A4560'],
  },
  clouds: {
    tile: [['cloud', 20, 28, 1.35, 0], ['drop', 156, 24, 0.8, 0], ['cloud', 120, 112, 1.05, 0], ['heart', 34, 150, 0.8, -12], ['drop', 206, 160, 0.75, 0], ['cloud', 150, 200, 1, 0]],
    day: ['#5F8CB6', '#D7E7F4'], night: ['#A7C6E6', '#36485C'],
  },
  bakery: {
    tile: [['cupcake', 22, 22, 1.25, -6], ['cookie', 150, 22, 1, 0], ['croissant', 96, 112, 1.25, -10], ['heart', 200, 130, 0.8, 12], ['cookie', 30, 172, 0.85, 0], ['cupcake', 164, 192, 1, 8]],
    day: ['#B0705A', '#F2C9B8'], night: ['#E6B39C', '#5E4038'],
  },
  washi: {
    tile: [['tape', 20, 20, 1.4, -12], ['heart', 150, 30, 0.7, 0], ['tape', 110, 110, 1.2, 18], ['heart', 40, 150, 0.7, 10], ['tape', 170, 190, 1.1, -5], ['heart', 200, 110, 0.6, -10]],
    day: ['#C2708A', '#F4C6D2'], night: ['#E3A3B8', '#5E3D48'],
  },
  grid: { grid: 'grid', day: ['#5B88B5', '#5B88B5'], night: ['#7FA6CC', '#7FA6CC'] },
  dotgrid: { grid: 'dots', day: ['#6E6A63', '#6E6A63'], night: ['#B8AFA2', '#B8AFA2'] },
  graph: { grid: 'graph', day: ['#4E9070', '#4E9070'], night: ['#86C2A0', '#86C2A0'] },
  strawberry: {
    tile: [['strawberry', 20, 24, 1.2, -10], ['blossom', 140, 20, 0.9, 0], ['strawberry', 100, 110, 1, 12], ['blossom', 30, 160, 0.8, 20], ['strawberry', 180, 170, 1.1, -4], ['blossom', 200, 96, 0.7, 0]],
    day: ['#C4505E', '#F6BDC2'], night: ['#EE9AA4', '#5E3A40'],
  },
  rainy: {
    tile: [['drop', 20, 20, 0.9, 0], ['streak', 90, 30, 1.2, 0], ['umbrella', 150, 24, 1.1, -8], ['streak', 30, 110, 1, 0], ['drop', 110, 120, 0.7, 0], ['streak', 200, 120, 1.1, 0], ['drop', 60, 190, 0.8, 0], ['streak', 160, 196, 0.9, 0]],
    day: ['#5E7F99', '#C8DAE6'], night: ['#9DB8CC', '#33424F'],
  },
  bunny: {
    tile: [['bunny', 20, 20, 1.3, 0], ['carrot', 140, 30, 1, -10], ['clover', 96, 112, 1, 0], ['bunny', 180, 150, 1, 6], ['clover', 30, 180, 0.8, 0], ['carrot', 200, 80, 0.8, 20]],
    day: ['#A07E6E', '#F2CFC4'], night: ['#D8C0AE', '#5A4840'],
  },
  bear: {
    tile: [['bear', 20, 24, 1.3, 0], ['honey', 140, 24, 1.1, 0], ['heart', 100, 112, 0.8, -10], ['bear', 170, 170, 1, 8], ['honey', 30, 170, 0.9, -6], ['heart', 200, 100, 0.6, 12]],
    day: ['#9A6A42', '#E8C99A'], night: ['#D9B48A', '#5A4530'],
  },
  autumn: {
    tile: [['maple', 20, 20, 1.2, -15], ['acorn', 140, 24, 1, 0], ['maple', 100, 110, 1, 25], ['leaf', 190, 120, 0.9, 60], ['acorn', 30, 170, 0.9, -12], ['maple', 170, 190, 1.1, 8]],
    day: ['#B8642E', '#EEB98A'], night: ['#E6A77A', '#5E3E2A'],
  },
  snowday: {
    tile: [['snowflake', 20, 20, 1.1, 0], ['mitten', 140, 24, 1, -10], ['snowflake', 100, 110, 0.9, 15], ['snowflake', 190, 130, 0.7, 0], ['mitten', 30, 170, 0.9, 12], ['snowflake', 170, 190, 1, 30]],
    day: ['#6E8FB0', '#DCE7F2'], night: ['#A6BCD4', '#3A4858'],
  },
  letter: {
    tile: [['envelope', 20, 24, 1.3, -6], ['stamp', 140, 20, 1.1, 8], ['heart', 100, 112, 0.8, 0], ['postmark', 160, 140, 1, 0], ['envelope', 30, 170, 1, 10], ['stamp', 190, 200, 0.8, -6]],
    day: ['#8A6A48', '#E2CFAE'], night: ['#CDB291', '#54452F'],
  },
  xmas: {
    tile: [['holly', 20, 20, 1.3, 0], ['ornament', 140, 24, 1.1, 8], ['candycane', 100, 110, 1.1, -10], ['gift', 190, 120, 1, 0], ['snowflake', 30, 170, 0.9, 0], ['holly', 170, 190, 1.1, 20]],
    day: ['#BF5050', '#BFD8B0'], night: ['#E88E86', '#3E5A3A'],
  },
  fireflies: {
    anim: 'glow',
    tile: [['firefly', 20, 30, 0.9, 0], ['firefly', 140, 20, 0.7, 20], ['firefly', 90, 110, 0.8, -10], ['firefly', 200, 140, 0.7, 30], ['firefly', 40, 180, 0.8, 0], ['firefly', 160, 200, 0.6, -20]],
    day: ['#7E7E30', '#F2E58A'], night: ['#CFC86C', '#6A7030'],
  },
  koi: {
    anim: 'swim',
    tile: [['koi', 20, 30, 1.3, 0], ['bubbles', 150, 20, 0.8, 0], ['koi', 110, 120, 1.1, 6], ['bubbles', 40, 160, 0.7, 0], ['koi', 170, 190, 1.2, -6]],
    day: ['#C8643A', '#F6C7A6'], night: ['#F0A07A', '#5A3E30'],
  },
  petals: {
    anim: 'drift',
    tile: [['petal', 20, 20, 0.9, 30], ['petal', 130, 30, 0.7, -40], ['blossom', 80, 100, 0.9, 0], ['petal', 200, 90, 0.8, 120], ['petal', 30, 170, 0.8, 200], ['petal', 150, 180, 0.9, 80], ['petal', 100, 210, 0.6, 10]],
    day: ['#C86E88', '#F8CCD8'], night: ['#EEA9BE', '#5E3D49'],
  },
  // Premium papers (gems).
  tea: {
    tile: [['teacup', 20, 24, 1.2, -6], ['cookie', 150, 20, 0.9, 0], ['heart', 100, 112, 0.7, 0], ['teacup', 180, 140, 1, 8], ['twinkle', 30, 170, 0.8, 0], ['cookie', 150, 200, 0.8, 10]],
    day: ['#9A6A4E', '#EBCDB6'], night: ['#D8B29A', '#5A4234'],
  },
  lanterns: {
    anim: 'glow',
    tile: [['lantern', 20, 24, 1.1, -4], ['twinkle', 140, 20, 0.7, 0], ['lantern', 96, 110, 1.3, 6], ['twinkle', 200, 120, 0.6, 0], ['lantern', 34, 176, 0.9, 8], ['lantern', 170, 192, 1.1, -6]],
    day: ['#B8603A', '#F6D29A'], night: ['#E8A070', '#6A4630'],
  },
  snowfall: {
    anim: 'fall',
    tile: [['snowflake', 20, 20, 0.9, 0], ['snowflake', 130, 40, 0.6, 20], ['snowflake', 80, 110, 0.8, 10], ['snowflake', 200, 100, 0.7, 0], ['snowflake', 30, 180, 0.7, 30], ['snowflake', 160, 190, 0.9, 15], ['snowflake', 110, 220, 0.5, 0]],
    day: ['#6F8FB8', '#FFFFFF'], night: ['#BCC8DA', '#3B4A66'],
  },
};

/** How strong the doodles are: the tile all over, the corner a bit stronger. Night needs less to show as much. */
export const ALPHA = { day: { tile: 0.15, corner: 0.26 }, night: { tile: 0.09, corner: 0.15 } };

const svg = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
const url = data => `url("${data}")`;

// A second, slightly shifted, lighter stroke makes a clean path look like colored pencil.
const pencil = (inner, a) => `<g fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
  `<g opacity="${a}">${inner}</g><g opacity="${(a * 0.45).toFixed(3)}" transform="translate(.5 .35)">${inner}</g></g>`;

/** The size of a paper's tile in CSS pixels (grid papers repeat much more often). */
export const tileSize = motif => {
  const m = MOTIFS[motif];
  return !m || !m.grid ? 240 : m.grid === 'graph' ? 64 : m.grid === 'dots' ? 24 : 32;
};

/** A grid paper's tile: thin lines (or dots), plainer than the doodles but just as light. */
function gridBody(kind, s, a) {
  if (kind === 'dots') return `<circle cx="12" cy="12" r="1.15" fill="${s}" opacity="${a * 1.4}"/>`;
  if (kind === 'grid') return `<path d="M0 .5 L32 .5 M.5 0 L.5 32" stroke="${s}" stroke-width="1" opacity="${a}"/>`;
  const fine = [16, 32, 48].map(v => `M0 ${v + 0.5} L64 ${v + 0.5} M${v + 0.5} 0 L${v + 0.5} 64`).join(' ');
  return `<path d="${fine}" stroke="${s}" stroke-width=".7" opacity="${a * 0.6}"/><path d="M0 .5 L64 .5 M.5 0 L.5 64" stroke="${s}" stroke-width="1.1" opacity="${a * 1.15}"/>`;
}

const cache = {};
const made = (key, f) => cache[key] || (cache[key] = f());
const colours = (m, night) => (night ? m.night : m.day);
const alpha = night => ALPHA[night ? 'night' : 'day'];

function tileData(motif, night, a) {
  const m = MOTIFS[motif], [s, f] = colours(m, night), n = tileSize(motif);
  return svg(n, n, m.grid ? gridBody(m.grid, s, a) : pencil(place(m.tile, s, f), a));
}

/** The still tile for [motif] all over the paper, as a CSS url(), or 'none' (no motif, or a moving paper). */
export function motifTile(motif, night) {
  const m = MOTIFS[motif];
  if (!m || m.anim) return 'none';
  return made('t' + motif + night, () => url(tileData(motif, night, alpha(night).tile)));
}

/** The moving tile for a moving paper: { image, kind } (kind is a CSS class, see style.css), or null. */
export function motifMotion(motif, night) {
  const m = MOTIFS[motif];
  if (!m || !m.anim) return null;
  return { image: made('m' + motif + night, () => url(tileData(motif, night, alpha(night).tile))), kind: m.anim };
}

/** The corner doodle for [motif], as a CSS url(), or 'none'. */
export function motifCorner(motif, night) {
  const m = MOTIFS[motif];
  if (!m || !CORNER[motif]) return 'none';
  const [s, f] = colours(m, night);
  return made('c' + motif + night, () => url(svg(96, 64, pencil(CORNER[motif](s, f), alpha(night).corner))));
}

/** A small picture for the store and wardrobe: the corner doodle (or a bit of the grid) strong enough to see at 44 x 30. */
export function motifPreview(motif, night) {
  const m = MOTIFS[motif];
  if (!m) return 'none';
  const [s, f] = colours(m, night);
  if (m.grid) return made('p' + motif + night, () => url(svg(tileSize(motif), tileSize(motif), gridBody(m.grid, s, 0.55))));
  return made('p' + motif + night, () => url(svg(96, 64, pencil(CORNER[motif](s, f), 0.95))));
}

export const DOODLES = Object.keys(D);

// Stationery paper: faint pencil doodles for the themed papers in the store (cats, fish, plants...).
// Each paper gets a sparse tile of small doodles all over, and one bigger doodle peeking in from the bottom corner.
// All drawn as small SVG pictures (no image files), made once per paper and theme, then used as CSS backgrounds.
// The doodles stay very light so clues and fence lines are always easy to read (tests/cosmetics.test.mjs checks it).

/** Small doodles in a 24 x 24 box. [s] = stroke colour, [f] = soft fill colour. */
const D = {
  catFace: (s, f) => `<path d="M5 11 L6 4 L10 8 Q12 7.4 14 8 L18 4 L19 11 Q20 18 12 18.5 Q4 18 5 11 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="9.4" cy="12" r=".9" fill="${s}"/><circle cx="14.6" cy="12" r=".9" fill="${s}"/>` +
    `<path d="M11.2 14.2 L12.8 14.2 L12 15.1 Z M2.5 13.2 L7 13.8 M2.8 15.8 L7 14.9 M21.5 13.2 L17 13.8 M21.2 15.8 L17 14.9" stroke="${s}"/>`,
  paw: (s, f) => `<path d="M12 11.5 Q16.5 11.5 16.5 16 Q16.5 19.5 12 19 Q7.5 19.5 7.5 16 Q7.5 11.5 12 11.5 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="6.6" cy="10" r="1.7" fill="${f}" stroke="${s}"/><circle cx="10" cy="6.8" r="1.7" fill="${f}" stroke="${s}"/>` +
    `<circle cx="14" cy="6.8" r="1.7" fill="${f}" stroke="${s}"/><circle cx="17.4" cy="10" r="1.7" fill="${f}" stroke="${s}"/>`,
  yarn: (s, f) => `<circle cx="11" cy="11" r="6.5" fill="${f}" stroke="${s}"/>` +
    `<path d="M5.5 8.5 Q11 11.5 15.5 5.6 M4.6 12.4 Q11 15 17.3 9.4 M6.8 16.2 Q12.5 17.4 17.2 13 M16.4 16 Q19 21 22.5 19.5" stroke="${s}"/>`,
  fish: (s, f) => `<path d="M3.5 12 Q10 4.8 17 12 Q10 19.2 3.5 12 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M17 12 L21.5 7.8 Q20.4 12 21.5 16.2 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="7.6" cy="11" r=".9" fill="${s}"/><path d="M11 9.6 Q12.3 12 11 14.4 M9.5 15.3 Q11 18 13 16.6" stroke="${s}"/>`,
  bubbles: (s, f) => `<circle cx="7" cy="18" r="2.6" fill="${f}" stroke="${s}"/><circle cx="11.5" cy="10.5" r="1.8" stroke="${s}"/>` +
    `<circle cx="15" cy="4.5" r="1.1" stroke="${s}"/>`,
  weed: (s, f) => `<path d="M10 23 Q6.5 18.5 10 14 Q13.5 9.5 10 5 Q8.4 3 9.5 1.5 M14 23 Q17 19 14.5 15.5 Q12.5 12.5 15.5 9" stroke="${s}" fill="none"/>`,
  leaf: (s, f) => `<path d="M12 21.5 Q3.5 14 12 2.5 Q20.5 14 12 21.5 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M12 20 L12 7.5 M12 15.5 L8.8 12.4 M12 12 L15.2 8.9" stroke="${s}"/>`,
  sprout: (s, f) => `<path d="M12 21.5 L12 12.5" stroke="${s}"/><path d="M12 14.5 Q6.5 14 5.5 8 Q11 8 12 14 Z M12 12.5 Q12.8 6.5 18.5 5.6 Q18.6 11.4 12 12.5 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M8 21.5 L16 21.5" stroke="${s}"/>`,
  pot: (s, f) => `<path d="M7.2 14 L16.8 14 L15.4 21.5 L8.6 21.5 Z" fill="${f}" stroke="${s}"/><path d="M6.2 14 L17.8 14" stroke="${s}"/>` +
    `<path d="M12 14 Q10.6 9 6.6 7.4 M12 14 Q13.2 8.4 17.4 6.6 M12 14 L12 4.6" stroke="${s}"/>` +
    `<ellipse cx="7.6" cy="8.4" rx="2" ry="1.1" fill="${f}" stroke="${s}"/><ellipse cx="16.4" cy="7.4" rx="2" ry="1.1" fill="${f}" stroke="${s}"/><ellipse cx="12" cy="4.4" rx="1.1" ry="2" fill="${f}" stroke="${s}"/>`,
  star: (s, f) => `<path d="M12 3 L14.4 9 L20.6 9.4 L15.8 13.4 L17.4 19.6 L12 16.1 L6.6 19.6 L8.2 13.4 L3.4 9.4 L9.6 9 Z" fill="${f}" stroke="${s}"/>`,
  moon: (s, f) => `<path d="M14.5 3.6 A8.6 8.6 0 1 0 20.6 16.4 A7 7 0 0 1 14.5 3.6 Z" fill="${f}" stroke="${s}"/>`,
  twinkle: (s) => `<path d="M12 5 Q12.6 11.4 19 12 Q12.6 12.6 12 19 Q11.4 12.6 5 12 Q11.4 11.4 12 5 Z" stroke="${s}" fill="none"/>`,
  cloud: (s, f) => `<path d="M6.5 17.5 Q2.4 17.4 3.2 13.8 Q3.9 10.9 7.2 11.4 Q8.2 7 12.6 7.8 Q16 6.4 17.6 10.3 Q21.6 10.8 21 14.4 Q20.4 17.6 17 17.5 Z" fill="${f}" stroke="${s}"/>`,
  drop: (s, f) => `<path d="M12 5 Q16.4 11.4 15.4 14.4 Q14.4 17.6 12 17.6 Q9.6 17.6 8.6 14.4 Q7.6 11.4 12 5 Z" fill="${f}" stroke="${s}"/>`,
  heart: (s, f) => `<path d="M12 19.5 Q4 14 4.6 9.2 Q5.4 5.2 9 5.6 Q11.2 5.9 12 8.4 Q12.8 5.9 15 5.6 Q18.6 5.2 19.4 9.2 Q20 14 12 19.5 Z" fill="${f}" stroke="${s}"/>`,
  cupcake: (s, f) => `<path d="M6.8 13 L8.8 20.5 L15.2 20.5 L17.2 13 Z" fill="${f}" stroke="${s}"/><path d="M10.4 13.4 L11 20.2 M13.6 13.4 L13 20.2" stroke="${s}"/>` +
    `<path d="M6 13 Q4.6 9.4 8.2 9.2 Q9 5.8 12.4 6.6 Q16.4 6 16.8 9.6 Q19.6 10.4 18 13 Z" fill="${f}" stroke="${s}"/><circle cx="12.6" cy="4.6" r="1.4" fill="${s}"/>`,
  cookie: (s, f) => `<path d="M12 4.6 Q18.8 4.8 19.4 11.6 Q19.4 19 12 19.4 Q4.8 19.2 4.6 12 Q4.8 4.8 12 4.6 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="9.4" cy="9.6" r=".9" fill="${s}"/><circle cx="14.6" cy="9" r=".9" fill="${s}"/><circle cx="12" cy="13" r=".9" fill="${s}"/><circle cx="8.6" cy="15" r=".9" fill="${s}"/><circle cx="15.4" cy="14.8" r=".9" fill="${s}"/>`,
  croissant: (s, f) => `<path d="M3.6 15.6 Q4.4 8.6 12 7.6 Q19.6 8.6 20.4 15.6 Q16.6 13.4 12 13.6 Q7.4 13.4 3.6 15.6 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M9 8.4 Q9.8 11 9.2 13.6 M12 7.8 L12 13.4 M15 8.4 Q14.2 11 14.8 13.6" stroke="${s}"/>`,
};

/** Bigger doodles for the bottom corner, in a 96 x 64 box, sitting on the bottom edge. */
const CORNER = {
  // A cat peeking over the edge of the page, paws on the edge.
  cat: (s, f) => `<path d="M30 64 Q27 40 34 33 L32 17 L45 27 Q52 25 59 27 L72 17 L70 33 Q77 40 74 64 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M39.5 43 Q42.5 46 45.5 43 M58.5 43 Q61.5 46 64.5 43 M50.5 49 L53.5 49 L52 51 Z M52 51 L52 53 Q49 55.5 47 53.5 M52 53 Q55 55.5 57 53.5" stroke="${s}"/>` +
    `<path d="M22 47 L38 49.5 M23 54 L38 52.5 M82 47 L66 49.5 M81 54 L66 52.5" stroke="${s}"/>` +
    `<path d="M20 64 Q20 56.5 28 56.5 Q35 56.5 35 64 M69 64 Q69 56.5 76 56.5 Q84 56.5 84 64 M25 60 L25 64 M29.5 59 L29.5 64 M74 59 L74 64 M78.5 60 L78.5 64" fill="${f}" stroke="${s}"/>`,
  // A little fish bowl with one fish and a sprig of weed.
  fish: (s, f) => `<path d="M30 22 L66 22 M33 22 Q14 34 26 56 Q32 63 48 63 Q64 63 70 56 Q82 34 63 22" fill="${f}" stroke="${s}"/>` +
    `<path d="M24 36 Q48 40 72 36" stroke="${s}"/>` +
    `<path d="M40 63 Q35 55 40 49 Q45 43 40 38 M45 63 Q49 57 46 52" stroke="${s}" fill="none"/>` +
    `<path d="M50 49 Q57 42 64 49 Q57 56 50 49 Z M64 49 L69 45 Q68 49 69 53 Z" fill="${f}" stroke="${s}"/><circle cx="54" cy="48" r="1" fill="${s}"/>` +
    `<circle cx="58" cy="32" r="2" stroke="${s}"/><circle cx="62" cy="26" r="1.3" stroke="${s}"/>`,
  // A pot of leaves.
  plant: (s, f) => `<path d="M34 46 L62 46 L58 64 L38 64 Z" fill="${f}" stroke="${s}"/><path d="M31 46 L65 46" stroke="${s}"/>` +
    `<path d="M48 46 Q46 30 30 22 M48 46 Q51 28 68 18 M48 46 L48 10 M48 40 Q38 38 34 34 M48 34 Q58 33 62 28" stroke="${s}"/>` +
    `<path d="M30 22 Q22 22 24 14 Q32 14 30 22 Z M68 18 Q76 18 75 10 Q67 10 68 18 Z M48 10 Q42 6 48 1 Q54 6 48 10 Z M34 34 Q26 36 25 30 Q31 28 34 34 Z M62 28 Q70 30 71 24 Q65 22 62 28 Z" fill="${f}" stroke="${s}"/>`,
  // A sleepy moon with stars.
  stars: (s, f) => `<path d="M52 12 A24 24 0 1 0 72 52 A19 19 0 0 1 52 12 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M40 40 Q43 43 46 40" stroke="${s}"/>` +
    `<path d="M78 14 L80 19 L85 19.5 L81 23 L82.5 28 L78 25 L73.5 28 L75 23 L71 19.5 L76 19 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M14 26 Q14.5 31 19 31.5 Q14.5 32 14 37 Q13.5 32 9 31.5 Q13.5 31 14 26 Z" stroke="${s}" fill="none"/>`,
  // A cloud with a little sun behind it and a few drops.
  clouds: (s, f) => `<circle cx="62" cy="26" r="11" fill="${f}" stroke="${s}"/>` +
    `<path d="M62 8 L62 4 M76 14 L79 11 M80 27 L84 27 M47 13 L44 10" stroke="${s}"/>` +
    `<path d="M26 50 Q14 50 16 40 Q18 32 27 34 Q30 22 43 25 Q53 20 58 31 Q70 32 68 42 Q66 50 56 50 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M28 56 L26 61 M40 56 L38 61 M52 56 L50 61" stroke="${s}"/>`,
  // A cupcake on a little plate.
  bakery: (s, f) => `<path d="M34 42 L39 60 L57 60 L62 42 Z" fill="${f}" stroke="${s}"/><path d="M43 43 L44.5 59 M53 43 L51.5 59" stroke="${s}"/>` +
    `<path d="M32 42 Q27 33 37 32 Q39 22 49 24 Q60 22 61 31 Q70 33 64 42 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="50" cy="19" r="3.4" fill="${f}" stroke="${s}"/><path d="M50 15.6 Q51 11 55 10" stroke="${s}"/>` +
    `<path d="M24 62 Q48 66 72 62" stroke="${s}"/>` +
    `<path d="M40 36 L42 35 M47 31 L49 32 M55 36 L57 35" stroke="${s}"/>`,
};

/**
 * Every themed paper's doodles: which small doodles go where on the 240 x 240 tile ([doodle, x, y, turn in degrees, size]),
 * and the colours: [stroke, fill] for day and night. The colours are kept light by [alpha] (see tests for the limits).
 */
export const MOTIFS = {
  cat: {
    tile: [['catFace', 20, 24, -8, 1.3], ['paw', 150, 18, 18, 1], ['yarn', 96, 112, 0, 1.15], ['paw', 196, 150, -22, 0.9], ['paw', 28, 176, 12, 0.85], ['catFace', 170, 196, 10, 1]],
    day: ['#A0704E', '#E8B9A4'], night: ['#D8B39A', '#6E4E43'],
  },
  fish: {
    tile: [['fish', 24, 30, -6, 1.3], ['bubbles', 120, 16, 0, 1], ['weed', 196, 72, 0, 1.2], ['fish', 120, 120, 8, 1], ['bubbles', 36, 150, 12, 0.85], ['fish', 168, 196, 180, 1.05]],
    day: ['#3F7FA0', '#A9D6DF'], night: ['#8CC7DA', '#2F5662'],
  },
  plant: {
    tile: [['leaf', 24, 24, -24, 1.2], ['sprout', 140, 20, 0, 1.1], ['pot', 92, 110, 0, 1.25], ['leaf', 200, 120, 32, 0.95], ['sprout', 24, 176, 0, 0.95], ['leaf', 160, 196, 70, 1]],
    day: ['#5E8A4E', '#BFD9A6'], night: ['#A6CF8E', '#3C5634'],
  },
  stars: {
    tile: [['star', 24, 24, -10, 1.1], ['twinkle', 140, 30, 0, 0.9], ['moon', 96, 110, -15, 1.2], ['star', 196, 130, 18, 0.85], ['twinkle', 34, 170, 0, 0.8], ['star', 164, 200, 6, 0.95]],
    day: ['#6A64B0', '#D6D2F0'], night: ['#D9C67E', '#4A4560'],
  },
  clouds: {
    tile: [['cloud', 20, 28, 0, 1.35], ['drop', 156, 24, 0, 0.8], ['cloud', 120, 112, 0, 1.05], ['heart', 34, 150, -12, 0.8], ['drop', 206, 160, 0, 0.75], ['cloud', 150, 200, 0, 1]],
    day: ['#5F8CB6', '#D7E7F4'], night: ['#A7C6E6', '#36485C'],
  },
  bakery: {
    tile: [['cupcake', 22, 22, -6, 1.25], ['cookie', 150, 22, 0, 1], ['croissant', 96, 112, -10, 1.25], ['heart', 200, 130, 12, 0.8], ['cookie', 30, 172, 0, 0.85], ['cupcake', 164, 192, 8, 1]],
    day: ['#B0705A', '#F2C9B8'], night: ['#E6B39C', '#5E4038'],
  },
};

/** How strong the doodles are: the tile all over, the corner a bit stronger. Night needs less to show as much. */
export const ALPHA = { day: { tile: 0.15, corner: 0.26 }, night: { tile: 0.09, corner: 0.15 } };

const svg = (w, h, body) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`);

// A second, slightly shifted, lighter stroke makes a clean path look like colored pencil.
const pencil = (inner, a) => `<g fill="none" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
  `<g opacity="${a}">${inner}</g><g opacity="${(a * 0.45).toFixed(3)}" transform="translate(.5 .35)">${inner}</g></g>`;

const cache = {};
/** The all-over tile for [motif] ('' or unknown: none), as a CSS url(), or 'none'. */
export function motifTile(motif, night) {
  const m = MOTIFS[motif];
  if (!m) return 'none';
  const key = 't' + motif + night;
  if (cache[key]) return cache[key];
  const [s, f] = night ? m.night : m.day;
  const body = m.tile.map(([name, x, y, rot, k]) =>
    `<g transform="translate(${x} ${y}) rotate(${rot} ${12 * k} ${12 * k}) scale(${k})">${D[name](s, f)}</g>`).join('');
  return (cache[key] = `url("${svg(240, 240, pencil(body, ALPHA[night ? 'night' : 'day'].tile))}")`);
}

/** The corner doodle for [motif], as a CSS url(), or 'none'. */
export function motifCorner(motif, night) {
  const m = MOTIFS[motif];
  if (!m || !CORNER[motif]) return 'none';
  const key = 'c' + motif + night;
  if (cache[key]) return cache[key];
  const [s, f] = night ? m.night : m.day;
  return (cache[key] = `url("${svg(96, 64, pencil(CORNER[motif](s, f), ALPHA[night ? 'night' : 'day'].corner))}")`);
}

/** A small picture for the store and wardrobe: the corner doodle drawn strong enough to see at 44 x 30. */
export function motifPreview(motif, night) {
  const m = MOTIFS[motif];
  if (!m || !CORNER[motif]) return 'none';
  const key = 'p' + motif + night;
  if (cache[key]) return cache[key];
  const [s, f] = night ? m.night : m.day;
  return (cache[key] = `url("${svg(96, 64, pencil(CORNER[motif](s, f), 0.95))}")`);
}

export const DOODLES = Object.keys(D);

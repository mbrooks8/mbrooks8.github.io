// The little pencil doodles the themed papers are made of (see stationery.js). Plain SVG markup, original drawings.
// D: small doodles in a 24 x 24 box; [s] = stroke colour, [f] = soft fill colour.
// CORNER: bigger pictures in a 96 x 64 box that sit on the bottom edge of the screen.

export const D = {
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
  koi: (s, f) => `<path d="M3.5 12 Q10 5.4 17 12 Q10 18.6 3.5 12 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M17 12 Q20 8 22.5 8.6 Q20.6 12 22.5 15.4 Q20 16 17 12 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="7.4" cy="11.2" r=".8" fill="${s}"/><path d="M10 9.2 Q12.4 10.4 11.6 12.4 Q10 12 10 9.2 Z M13 13 Q15 13.4 14.4 15 Q13 14.8 13 13 Z" fill="${s}"/>` +
    `<path d="M4.2 11 Q2.6 10 1.5 10.6 M4.2 13 Q2.6 14 1.5 13.4" stroke="${s}"/>`,
  bubbles: (s, f) => `<circle cx="7" cy="18" r="2.6" fill="${f}" stroke="${s}"/><circle cx="11.5" cy="10.5" r="1.8" stroke="${s}"/>` +
    `<circle cx="15" cy="4.5" r="1.1" stroke="${s}"/>`,
  weed: (s) => `<path d="M10 23 Q6.5 18.5 10 14 Q13.5 9.5 10 5 Q8.4 3 9.5 1.5 M14 23 Q17 19 14.5 15.5 Q12.5 12.5 15.5 9" stroke="${s}" fill="none"/>`,
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
  streak: (s) => `<path d="M9 3 Q8 10 9.4 17 M14 7 Q13.2 13 14.4 21" stroke="${s}" fill="none"/>`,
  heart: (s, f) => `<path d="M12 19.5 Q4 14 4.6 9.2 Q5.4 5.2 9 5.6 Q11.2 5.9 12 8.4 Q12.8 5.9 15 5.6 Q18.6 5.2 19.4 9.2 Q20 14 12 19.5 Z" fill="${f}" stroke="${s}"/>`,
  cupcake: (s, f) => `<path d="M6.8 13 L8.8 20.5 L15.2 20.5 L17.2 13 Z" fill="${f}" stroke="${s}"/><path d="M10.4 13.4 L11 20.2 M13.6 13.4 L13 20.2" stroke="${s}"/>` +
    `<path d="M6 13 Q4.6 9.4 8.2 9.2 Q9 5.8 12.4 6.6 Q16.4 6 16.8 9.6 Q19.6 10.4 18 13 Z" fill="${f}" stroke="${s}"/><circle cx="12.6" cy="4.6" r="1.4" fill="${s}"/>`,
  cookie: (s, f) => `<path d="M12 4.6 Q18.8 4.8 19.4 11.6 Q19.4 19 12 19.4 Q4.8 19.2 4.6 12 Q4.8 4.8 12 4.6 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="9.4" cy="9.6" r=".9" fill="${s}"/><circle cx="14.6" cy="9" r=".9" fill="${s}"/><circle cx="12" cy="13" r=".9" fill="${s}"/><circle cx="8.6" cy="15" r=".9" fill="${s}"/><circle cx="15.4" cy="14.8" r=".9" fill="${s}"/>`,
  croissant: (s, f) => `<path d="M3.6 15.6 Q4.4 8.6 12 7.6 Q19.6 8.6 20.4 15.6 Q16.6 13.4 12 13.6 Q7.4 13.4 3.6 15.6 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M9 8.4 Q9.8 11 9.2 13.6 M12 7.8 L12 13.4 M15 8.4 Q14.2 11 14.8 13.6" stroke="${s}"/>`,
  tape: (s, f) => `<path d="M2 9 L3 8 L2.2 7 L21.8 5.6 L21 6.8 L22 8 L22.6 14.2 L21.6 15.2 L22.4 16 L3 17.4 L3.8 16.4 L2.8 15.4 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="7" cy="12.2" r=".9" fill="${s}"/><circle cx="12" cy="11.6" r=".9" fill="${s}"/><circle cx="17" cy="11" r=".9" fill="${s}"/>`,
  strawberry: (s, f) => `<path d="M12 21 Q4.5 15 5.5 10 Q6.5 7 12 8 Q17.5 7 18.5 10 Q19.5 15 12 21 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M7.6 8.4 L9.6 5.2 L12 7.6 L14.4 5.2 L16.4 8.4 M12 6.8 L12 3.4" stroke="${s}"/>` +
    `<circle cx="9.2" cy="11.6" r=".6" fill="${s}"/><circle cx="14.6" cy="11.4" r=".6" fill="${s}"/><circle cx="12" cy="13.6" r=".6" fill="${s}"/><circle cx="10" cy="15.8" r=".6" fill="${s}"/><circle cx="14.2" cy="15.6" r=".6" fill="${s}"/>`,
  blossom: (s, f) => `<circle cx="12" cy="7.4" r="3" fill="${f}" stroke="${s}"/><circle cx="16.4" cy="10.6" r="3" fill="${f}" stroke="${s}"/>` +
    `<circle cx="14.7" cy="15.8" r="3" fill="${f}" stroke="${s}"/><circle cx="9.3" cy="15.8" r="3" fill="${f}" stroke="${s}"/>` +
    `<circle cx="7.6" cy="10.6" r="3" fill="${f}" stroke="${s}"/><circle cx="12" cy="12.2" r="1.7" fill="${s}"/>`,
  petal: (s, f) => `<path d="M12 20 Q5.6 13 9.4 5 L12 7 L14.6 5 Q18.4 13 12 20 Z" fill="${f}" stroke="${s}"/><path d="M12 18 L12 11" stroke="${s}"/>`,
  umbrella: (s, f) => `<path d="M3 12 Q12 2 21 12 Q18.8 10.2 16.6 12 Q14.3 10.2 12 12 Q9.7 10.2 7.4 12 Q5.2 10.2 3 12 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M12 4.6 L12 3 M12 12 L12 19 Q12 21.6 9.8 21 Q8.6 20.5 9 19.2" stroke="${s}"/>`,
  bunny: (s, f) => `<path d="M9.2 9.2 Q6.4 1.6 8.8 1.6 Q11.2 2 10.8 9 M14.8 9.2 Q17.6 1.6 15.2 1.6 Q12.8 2 13.2 9" fill="${f}" stroke="${s}"/>` +
    `<ellipse cx="12" cy="14" rx="6.6" ry="5.6" fill="${f}" stroke="${s}"/><circle cx="9.6" cy="13.4" r=".9" fill="${s}"/><circle cx="14.4" cy="13.4" r=".9" fill="${s}"/>` +
    `<path d="M11.3 15.4 L12.7 15.4 L12 16.2 Z M12 16.2 L12 17 M3.6 14.6 L7 15 M20.4 14.6 L17 15" stroke="${s}"/>`,
  carrot: (s, f) => `<path d="M5.6 18.6 L16.4 7.6 Q19 7.8 18.6 10.6 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M9.4 14 L11 15.4 M12.6 10.8 L13.8 12 M17.4 7.6 L19 3.6 M18 8.2 L21.6 5.6 M17 7.4 L16.2 3.6" stroke="${s}"/>`,
  clover: (s, f) => `<circle cx="12" cy="7.6" r="3.2" fill="${f}" stroke="${s}"/><circle cx="8" cy="12.6" r="3.2" fill="${f}" stroke="${s}"/>` +
    `<circle cx="16" cy="12.6" r="3.2" fill="${f}" stroke="${s}"/><path d="M12 12 Q12.6 18 15.4 21.4" stroke="${s}"/>`,
  bear: (s, f) => `<circle cx="6.4" cy="6.8" r="2.8" fill="${f}" stroke="${s}"/><circle cx="17.6" cy="6.8" r="2.8" fill="${f}" stroke="${s}"/>` +
    `<circle cx="12" cy="13" r="7" fill="${f}" stroke="${s}"/><ellipse cx="12" cy="15.6" rx="3.2" ry="2.3" fill="${f}" stroke="${s}"/>` +
    `<circle cx="9.3" cy="11.6" r=".9" fill="${s}"/><circle cx="14.7" cy="11.6" r=".9" fill="${s}"/><ellipse cx="12" cy="14.8" rx="1.1" ry=".7" fill="${s}"/>`,
  honey: (s, f) => `<path d="M7.4 9 Q5 11 5.5 15 Q6 20.5 12 20.5 Q18 20.5 18.5 15 Q19 11 16.6 9 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M6.8 5.6 L17.2 5.6 L17.2 9 L6.8 9 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M7.6 9 Q8.6 12.4 9.8 9.6 Q11 13.4 12.4 9.4 M7.4 15 Q12 16.6 16.8 15" stroke="${s}"/>`,
  maple: (s, f) => `<path d="M12 16 L5 17 L7 13.5 L3.5 10.5 L7.5 10 L6.5 5.5 L10 7.5 L12 3 L14 7.5 L17.5 5.5 L16.5 10 L20.5 10.5 L17 13.5 L19 17 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M12 21.5 L12 7 M12 13 L8.4 10.6 M12 13 L15.6 10.6" stroke="${s}"/>`,
  acorn: (s, f) => `<path d="M7 11 Q7 19 12 21 Q17 19 17 11" fill="${f}" stroke="${s}"/>` +
    `<path d="M5.5 11 Q6 5.5 12 5.5 Q18 5.5 18.5 11 Z" fill="${f}" stroke="${s}"/><path d="M12 5.5 L12.8 2.6 M8 8.6 L16 8.6" stroke="${s}"/>`,
  snowflake: (s) => `<path d="M12 3 L12 21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5 M10 4.6 L12 6.5 L14 4.6 M10 19.4 L12 17.5 L14 19.4` +
    ` M4.6 10.4 L6.9 9 L6.4 6.4 M19.4 13.6 L17.1 15 L17.6 17.6 M4.6 13.6 L6.9 15 L6.4 17.6 M19.4 10.4 L17.1 9 L17.6 6.4" stroke="${s}" fill="none"/>`,
  mitten: (s, f) => `<path d="M8 21 L8 12 Q6.4 11 6 8.6 Q6 6.4 7.6 7.2 L8.6 9 L8.8 6 Q9.6 2.6 13 2.6 Q17 3 17 8 L17 21 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M8 17.4 L17 17.4 M10 19.2 L10 17.6 M12.5 19.2 L12.5 17.6 M15 19.2 L15 17.6" stroke="${s}"/>`,
  stamp: (s, f) => `<path d="M5 4 L19 4 L19 20 L5 20 Z" fill="${f}" stroke="${s}" stroke-dasharray="1.2 1.4"/>` +
    `<path d="M7.5 6.5 L16.5 6.5 L16.5 17.5 L7.5 17.5 Z M8 16 L11 12 L13 14 L14.6 12.4 L16.4 15.4" stroke="${s}"/><circle cx="14" cy="9.2" r="1.1" stroke="${s}"/>`,
  envelope: (s, f) => `<path d="M3 7 L21 7 L21 18 L3 18 Z" fill="${f}" stroke="${s}"/><path d="M3 7 L12 13.5 L21 7 M3 18 L9.6 12 M21 18 L14.4 12" stroke="${s}"/>`,
  postmark: (s) => `<circle cx="8" cy="12" r="6" stroke="${s}" fill="none"/><circle cx="8" cy="12" r="3.6" stroke="${s}" fill="none"/>` +
    `<path d="M14.6 9 Q16.8 8 19 9 Q21.2 10 23.4 9 M14.6 12 Q16.8 11 19 12 Q21.2 13 23.4 12 M14.6 15 Q16.8 14 19 15 Q21.2 16 23.4 15" stroke="${s}" fill="none"/>`,
  holly: (s, f) => `<path d="M12 13 Q7.4 13.4 3.2 9.6 Q5.2 9 5.2 7 Q7.4 8 8.2 6.2 Q9.6 8.8 12 13 Z M12 13 Q16.6 13.4 20.8 9.6 Q18.8 9 18.8 7 Q16.6 8 15.8 6.2 Q14.4 8.8 12 13 Z" fill="${f}" stroke="${s}"/>` +
    `<circle cx="10.4" cy="15" r="1.8" fill="${s}"/><circle cx="13.6" cy="15" r="1.8" fill="${s}"/><circle cx="12" cy="17.8" r="1.8" fill="${s}"/>`,
  ornament: (s, f) => `<circle cx="12" cy="14.4" r="6.6" fill="${f}" stroke="${s}"/><path d="M10 5.8 L14 5.8 L14 8 L10 8 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M11 5.8 Q12 2.6 13 5.8 M5.8 13 L8 15 L10 13 L12 15 L14 13 L16 15 L18.2 13" stroke="${s}" fill="none"/>`,
  candycane: (s) => `<path d="M8 21 L8 8 Q8 2 13 2 Q18 2 18 7.5 L18 9.4 M10.4 21 L10.4 8.3 Q10.4 4.4 13 4.4 Q15.6 4.4 15.6 7.5 L15.6 9.4 M15.6 9.4 L18 9.4 M8 21 L10.4 21" stroke="${s}" fill="none"/>` +
    `<path d="M8 18 L10.4 16.4 M8 14 L10.4 12.4 M8 10 L10.4 8.4 M11.4 2.3 L12.4 4.5 M16.2 2.8 L14.9 4.8 M15.6 8.4 L18 7.2" stroke="${s}"/>`,
  gift: (s, f) => `<path d="M5 11 L19 11 L19 20.5 L5 20.5 Z M4 8 L20 8 L20 11 L4 11 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M12 8 L12 20.5 M12 8 Q8 3 7.4 6.4 Q8 8 12 8 Q16 8 16.6 6.4 Q16 3 12 8" stroke="${s}" fill="none"/>`,
  firefly: (s, f) => `<circle cx="12" cy="15" r="5.4" fill="${f}" stroke="none"/><ellipse cx="12" cy="13" rx="2" ry="3.6" fill="${f}" stroke="${s}"/>` +
    `<path d="M10.4 11 Q5.6 6.6 7.4 5 Q10 4.6 11.4 10 M13.6 11 Q18.4 6.6 16.6 5 Q14 4.6 12.6 10 M11 9.6 L10 7.4 M13 9.6 L14 7.4" stroke="${s}" fill="none"/>`,
  teacup: (s, f) => `<path d="M5 9 L17 9 Q17 17 11 17 Q5 17 5 9 Z" fill="${f}" stroke="${s}"/><path d="M17 10.5 Q21 10.5 20 13.5 Q19 15.5 16 15" stroke="${s}" fill="none"/>` +
    `<path d="M3.5 19 L18.5 19 M9 6.5 Q8 4.5 9.5 3 M13 6.5 Q12 4.5 13.5 3" stroke="${s}" fill="none"/>`,
  lantern: (s, f) => `<path d="M8.5 5.5 Q4 12 8.5 18.5 L15.5 18.5 Q20 12 15.5 5.5 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M10 3 L14 3 M12 3 L12 5.5 M8.5 5.5 L15.5 5.5 M12 5.5 Q9.6 12 12 18.5 M12 18.5 L12 21.5" stroke="${s}" fill="none"/>`,
  lilypad: (s, f) => `<path d="M12 12 L17.6 6.4 A8 8 0 1 1 12 4 Z" fill="${f}" stroke="${s}"/><path d="M12 12 L5 12.4 M12 12 L9 19 M12 12 L17.4 17" stroke="${s}"/>`,
};

const at = (name, x, y, k = 1, rot = 0, s, f) => `<g transform="translate(${x} ${y}) rotate(${rot} ${12 * k} ${12 * k}) scale(${k})">${D[name](s, f)}</g>`;
/** A group of small doodles: [[name, x, y, size, turn], ...]. */
export const place = (list, s, f) => list.map(([n, x, y, k, rot]) => at(n, x, y, k, rot, s, f)).join('');

export const CORNER = {
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
  // Two strips of patterned tape across the corner.
  washi: (s, f) => `<path d="M22 66 L84 10 L94 21 L32 77 Z" fill="${f}" stroke="${s}"/><path d="M48 70 L96 38 L96 52 L56 80 Z" fill="${f}" stroke="${s}"/>` +
    [[40, 52], [52, 41], [64, 30], [76, 19], [66, 62], [78, 54], [90, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="${s}"/>`).join(''),
  strawberry: (s, f) => place([['strawberry', 22, 14, 2, -8], ['blossom', 66, 34, 1.2, 0], ['strawberry', 70, 4, 0.9, 14]], s, f),
  rainy: (s, f) => place([['umbrella', 28, 8, 2.3, -6], ['drop', 8, 8, 0.8, 0], ['drop', 76, 6, 0.7, 0], ['drop', 78, 34, 0.8, 0]], s, f),
  bunny: (s, f) => place([['bunny', 22, 8, 2.4, 0], ['carrot', 68, 32, 1.3, 0]], s, f),
  bear: (s, f) => place([['bear', 20, 10, 2.3, 0], ['honey', 68, 30, 1.4, 0]], s, f),
  autumn: (s, f) => place([['maple', 10, 20, 1.6, -20], ['acorn', 44, 30, 1.4, 10], ['maple', 60, 10, 1.9, 25]], s, f),
  snowday: (s, f) => `<path d="M30 20 Q50 6 72 20" stroke="${s}" fill="none"/>` + place([['mitten', 14, 16, 2, -12], ['mitten', 54, 16, 2, 12]], s, f),
  letter: (s, f) => place([['envelope', 16, 16, 2.2, -6], ['postmark', 50, 34, 1.3, 0], ['stamp', 66, 6, 1.4, 8]], s, f),
  // A Christmas tree with a star.
  xmas: (s, f) => `<path d="M48 12 L60 28 L54 28 L66 44 L58 44 L72 60 L24 60 L38 44 L30 44 L42 28 L36 28 Z" fill="${f}" stroke="${s}"/>` +
    `<path d="M44 60 L44 64 M52 60 L52 64 M36 40 Q48 44 58 38 M32 54 Q48 58 64 52" stroke="${s}"/>` +
    `<circle cx="44" cy="34" r="1.8" fill="${s}"/><circle cx="54" cy="48" r="1.8" fill="${s}"/><circle cx="40" cy="50" r="1.8" fill="${s}"/>` +
    place([['star', 41.4, 1, 0.55, 0], ['gift', 70, 42, 1, 0]], s, f),
  // A jar of fireflies.
  fireflies: (s, f) => `<path d="M34 22 L62 22 Q68 28 68 40 L68 58 Q68 63 62 63 L34 63 Q28 63 28 58 L28 40 Q28 28 34 22 Z" fill="${f}" stroke="${s}" fill-opacity=".4"/>` +
    `<path d="M32 14 L64 14 L64 22 L32 22 Z" fill="${f}" stroke="${s}"/>` + place([['firefly', 34, 32, 0.8, 0], ['firefly', 46, 42, 0.7, 10], ['firefly', 74, 6, 0.8, -10]], s, f),
  // A lily pad with a flower and a koi swimming by.
  koi: (s, f) => place([['lilypad', 16, 18, 2, 0], ['blossom', 32, 22, 1, 0], ['koi', 60, 30, 1.4, 160]], s, f),
  // A blossom branch.
  petals: (s, f) => `<path d="M96 12 Q72 16 54 30 Q42 38 28 42 M72 18 Q68 8 58 6" stroke="${s}" fill="none"/>` +
    place([['blossom', 40, 22, 1.2, 0], ['blossom', 62, 6, 1, 20], ['blossom', 16, 30, 1, 40], ['petal', 70, 38, 0.7, 30]], s, f),
  // A snowman.
  snowfall: (s, f) => `<circle cx="48" cy="50" r="14" fill="${f}" stroke="${s}"/><circle cx="48" cy="28" r="10" fill="${f}" stroke="${s}"/>` +
    `<circle cx="44.5" cy="26" r="1.1" fill="${s}"/><circle cx="51.5" cy="26" r="1.1" fill="${s}"/><path d="M48 29 L56 30.5 L48 31.5 Z" fill="${s}"/>` +
    `<path d="M39 36 Q48 40 57 36 M54 38 L58 46 M40 18 L56 18 M43 18 L43 8 L53 8 L53 18 M34 46 L22 38 M62 46 L74 38" stroke="${s}" fill="none"/>` +
    `<circle cx="48" cy="46" r="1.2" fill="${s}"/><circle cx="48" cy="53" r="1.2" fill="${s}"/>`,
  // Premium papers (gems). A teapot with a cup beside it.
  tea: (s, f) => `<path d="M26 60 Q22 36 44 34 Q66 36 62 60 Z" fill="${f}" stroke="${s}"/><path d="M33 34 Q44 26 55 34" fill="${f}" stroke="${s}"/>` +
    `<circle cx="44" cy="26" r="2.6" fill="${f}" stroke="${s}"/><path d="M27 46 Q16 42 12 30 Q20 34 28 40" fill="${f}" stroke="${s}"/>` +
    `<path d="M61 40 Q72 42 68 52 Q66 56 61 56 M18 62 L70 62 M44 20 Q41 15 44 10 Q47 6 44 2" stroke="${s}" fill="none"/>` + place([['teacup', 68, 40, 1, 0]], s, f),
  // Paper lanterns on a string.
  lanterns: (s, f) => `<path d="M0 6 Q48 30 96 6" stroke="${s}" fill="none"/>` +
    place([['lantern', 10, 10, 1.1, 0], ['lantern', 36, 16, 1.4, 0], ['lantern', 66, 12, 1.2, 0]], s, f),
};

// The store's goods: paper (backgrounds), ping emoji and pencils, and what they cost in points.
// Pure data and small functions, no screens. Points are spent, never bought with money.
import { EXTRA_PENCILS } from './sketch.js';

/** Paper: [day] and [night] replace some colours (see sketch.js setPaper). The first one is the plain paper everybody has. */
export const BACKGROUNDS = [
  { id: 'cream', name: 'Cream', price: 0, day: null, night: null },
  { id: 'mint', name: 'Mint', price: 250,
    day: { paper: '#E8F0DC', paperShade: '#DCE7CC', card: '#F4F8EA', ruling: 'rgba(90,140,100,0.17)' },
    night: { paper: '#222B24', paperShade: '#2A352C', card: '#2F3A31', ruling: 'rgba(100,150,110,0.14)' } },
  { id: 'blush', name: 'Blush', price: 250,
    day: { paper: '#F6E5DF', paperShade: '#EED5CD', card: '#FCF1EC', ruling: 'rgba(190,100,110,0.16)' },
    night: { paper: '#2D2326', paperShade: '#382B2F', card: '#3A2E32', ruling: 'rgba(170,100,110,0.14)' } },
  { id: 'sky', name: 'Sky', price: 250,
    day: { paper: '#E4EEF3', paperShade: '#D5E4EC', card: '#F2F8FB', ruling: 'rgba(70,120,170,0.18)' },
    night: { paper: '#1F272D', paperShade: '#27323A', card: '#2C3841', ruling: 'rgba(80,130,180,0.15)' } },
  { id: 'kraft', name: 'Kraft', price: 300,
    day: { paper: '#E8D5B3', paperShade: '#DBC49A', card: '#F2E4C8', ruling: 'rgba(120,80,40,0.16)' },
    night: { paper: '#2B241B', paperShade: '#352C21', card: '#392F24', ruling: 'rgba(150,110,60,0.14)' } },
  { id: 'lilac', name: 'Lilac', price: 300,
    day: { paper: '#ECE5F1', paperShade: '#DFD5E8', card: '#F7F2FA', ruling: 'rgba(120,90,160,0.16)' },
    night: { paper: '#28232E', paperShade: '#312A39', card: '#352E3D', ruling: 'rgba(140,110,180,0.14)' } },
];

/** Every ping feeling the game can show. Only the key goes over the wire, so a friend sees yours even without the pack. */
export const PING_PACKS = [
  { id: 'basic', name: 'Feelings', price: 0, kinds: [
    { key: 'heart', glyph: '❤️', word: 'Love it' }, { key: 'thumbs', glyph: '👍', word: 'Good' },
    { key: 'question', glyph: '❓', word: 'Huh?' }, { key: 'cheer', glyph: '🎉', word: 'Yay' },
    { key: 'think', glyph: '🤔', word: 'Hmm' }, { key: 'oops', glyph: '😅', word: 'Oops' }] },
  { id: 'garden', name: 'Garden', price: 200, kinds: [
    { key: 'flower', glyph: '🌸', word: 'Pretty' }, { key: 'bee', glyph: '🐝', word: 'Busy bee' },
    { key: 'butterfly', glyph: '🦋', word: 'Flutter' }, { key: 'sunflower', glyph: '🌻', word: 'Sunny' },
    { key: 'mushroom', glyph: '🍄', word: 'Look closer' }, { key: 'ladybug', glyph: '🐞', word: 'Lucky' }] },
  { id: 'treats', name: 'Treats', price: 200, kinds: [
    { key: 'cookie', glyph: '🍪', word: 'Sweet' }, { key: 'berry', glyph: '🍓', word: 'Yum' },
    { key: 'cupcake', glyph: '🧁', word: 'Treat' }, { key: 'tea', glyph: '☕', word: 'Take a break' },
    { key: 'honey', glyph: '🍯', word: 'Nice one' }, { key: 'pie', glyph: '🥧', word: 'Easy as pie' }] },
  { id: 'sky', name: 'Sky', price: 200, kinds: [
    { key: 'star', glyph: '⭐', word: 'Star' }, { key: 'moon', glyph: '🌙', word: 'Quiet one' },
    { key: 'sun', glyph: '☀️', word: 'Bright' }, { key: 'rainbow', glyph: '🌈', word: 'Rainbow' },
    { key: 'cloud', glyph: '☁️', word: 'Drifting' }, { key: 'spark', glyph: '✨', word: 'Sparkle' }] },
  { id: 'critters', name: 'Critters', price: 250, kinds: [
    { key: 'cat', glyph: '🐱', word: 'Meow' }, { key: 'dog', glyph: '🐶', word: 'Woof' },
    { key: 'fox', glyph: '🦊', word: 'Clever' }, { key: 'owl', glyph: '🦉', word: 'Wise' },
    { key: 'frog', glyph: '🐸', word: 'Hop' }, { key: 'sheep', glyph: '🐑', word: 'Fence it in' }] },
];

/** Pencils: the number is what Play together sends (see room.js EXTRA_PENCIL_BASE). */
export const PENCIL_GOODS = EXTRA_PENCILS.map((p, i) => ({ id: 'pencil-' + p.name.toLowerCase(), pencil: 100 + i, name: p.name, price: 150 }));

/** Everything for sale, as { id, kind: 'background' | 'pings' | 'pencil', name, price }. */
export const GOODS = [
  ...BACKGROUNDS.filter(b => b.price > 0).map(b => ({ id: 'bg-' + b.id, kind: 'background', name: b.name, price: b.price })),
  ...PING_PACKS.filter(p => p.price > 0).map(p => ({ id: 'pings-' + p.id, kind: 'pings', name: p.name, price: p.price })),
  ...PENCIL_GOODS.map(p => ({ id: p.id, kind: 'pencil', name: p.name, price: p.price })),
];

export const goodById = id => GOODS.find(g => g.id === id) || null;

/** Ids from a saved list ("a,b,c"): only real goods, once each. */
export function parseOwned(s) {
  const out = [];
  for (const id of String(s || '').split(',')) if (goodById(id) && !out.includes(id)) out.push(id);
  return out;
}

/** What buying [id] does: { ok, why } given [balance] points and the [owned] ids. */
export function canBuy(id, balance, owned) {
  const g = goodById(id);
  if (!g) return { ok: false, why: 'unknown' };
  if (owned.includes(id)) return { ok: false, why: 'owned' };
  if (balance < g.price) return { ok: false, why: 'short', need: g.price - balance };
  return { ok: true };
}

export const backgroundById = id => BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS[0];
/** Can this background be used? (The plain one always can.) */
export const hasBackground = (id, owned) => id === 'cream' || owned.includes('bg-' + id);
/** Pencil numbers a player can use: the five everyone has, then the bought ones. */
export const ownedPencils = owned => [0, 1, 2, 3, 4, ...PENCIL_GOODS.filter(p => owned.includes(p.id)).map(p => p.pencil)];
/** Ping feelings a player can send: the basic six, then the packs they own. */
export const ownedPings = owned => PING_PACKS.filter(p => p.price === 0 || owned.includes('pings-' + p.id)).flatMap(p => p.kinds);

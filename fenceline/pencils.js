// The store's pencils (numbered from 100 on the wire). Only ever ADD to the end: a pencil's place in the list is its number,
// and friends' apps draw it from that number. `rarity` is internal (it only sets the price, see cosmetics.js); it is never shown.
// `fx` is a special line look drawn by linefx.js; `accent` is the sparkle colour. Every pencil also has a line style so it can be
// told apart without colour (pattern and animated ones are told apart by their pattern or sparkle).

export const EXTRA_PENCIL_BASE = 100;
/** How many store pencils a phone may send (numbers 100 to 199). Room code only checks this range. */
export const EXTRA_PENCIL_LIMIT = 100;

export const EXTRA_PENCILS = [
  // The first six shipped with the store.
  { name: 'Forest', day: '#3E7B4B', night: '#8FD19B', style: 'solid', rarity: 'common' },
  { name: 'Plum', day: '#7B3F8F', night: '#C69AE0', style: 'dashed', rarity: 'common' },
  { name: 'Teal', day: '#1E8C8C', night: '#6FD6D2', style: 'dotted', rarity: 'common' },
  { name: 'Cocoa', day: '#6B4630', night: '#C9A383', style: 'dashed', rarity: 'common' },
  { name: 'Lime', day: '#7F9A1F', night: '#C6E05A', style: 'dotted', rarity: 'common' },
  { name: 'Cherry', day: '#B01E4A', night: '#F27A9E', style: 'solid', rarity: 'common' },
  // More colours.
  { name: 'Tangerine', day: '#D9631A', night: '#F5A25D', style: 'solid', rarity: 'common' },
  { name: 'Slate', day: '#5A6E80', night: '#A9BCCB', style: 'dashed', rarity: 'common' },
  { name: 'Moss', day: '#5F6B2B', night: '#B5C46A', style: 'dotted', rarity: 'common' },
  { name: 'Coral', day: '#E0575B', night: '#F7A0A2', style: 'solid', rarity: 'common' },
  { name: 'Navy', day: '#213A7A', night: '#8EA6EE', style: 'dashed', rarity: 'uncommon' },
  { name: 'Berry', day: '#8A2A66', night: '#E79BCB', style: 'dotted', rarity: 'uncommon' },
  { name: 'Gold', day: '#B98A0F', night: '#F2D162', style: 'solid', rarity: 'uncommon' },
  { name: 'Ocean', day: '#1F78B4', night: '#7CC3EE', style: 'dashed', rarity: 'uncommon' },
  { name: 'Lavender', day: '#8D78D1', night: '#CBBEF5', style: 'dotted', rarity: 'uncommon' },
  // Patterned lines.
  { name: 'Wavy', day: '#2A8F9E', night: '#7FD6E0', style: 'solid', fx: 'wave', rarity: 'uncommon' },
  { name: 'Zigzag', day: '#CC5A2B', night: '#F5A27C', style: 'solid', fx: 'zigzag', rarity: 'uncommon' },
  { name: 'Beads', day: '#A33F7A', night: '#EDA0CF', style: 'solid', fx: 'beads', rarity: 'uncommon' },
  { name: 'Stitch', day: '#3F6FB0', night: '#9CBCF0', style: 'solid', fx: 'stitch', rarity: 'rare' },
  { name: 'Railway', day: '#6B4A9A', night: '#C7A9EE', style: 'solid', fx: 'double', rarity: 'rare' },
  { name: 'Loopy', day: '#2E8B57', night: '#8EE0AE', style: 'solid', fx: 'loop', rarity: 'rare' },
  // Lines that move.
  { name: 'Glimmer', day: '#C48A0C', night: '#F5CF55', style: 'solid', fx: 'sparkle', accent: '#FFF6C2', rarity: 'epic' },
  { name: 'Starry', day: '#26356B', night: '#9DB2F7', style: 'solid', fx: 'sparkle', accent: '#FFFFFF', rarity: 'epic' },
  { name: 'Ember', day: '#D5481A', night: '#FF8A4D', style: 'solid', fx: 'ember', rarity: 'epic' },
  { name: 'Confetti', day: '#D0527A', night: '#F59AB8', style: 'solid', fx: 'confetti', rarity: 'epic' },
  { name: 'Aurora', day: '#2FA58A', night: '#7FF0CF', style: 'solid', fx: 'aurora', rarity: 'legendary' },
  { name: 'Rainbow', day: '#E0508C', night: '#FF9CC4', style: 'solid', fx: 'rainbow', rarity: 'legendary' },
  // Cute patterns.
  { name: 'Paw prints', day: '#8A5A3C', night: '#D9AE8E', style: 'solid', fx: 'paws', rarity: 'rare' },
  { name: 'Hearts', day: '#C83E6A', night: '#F59CB8', style: 'solid', fx: 'hearts', rarity: 'uncommon' },
  { name: 'Vine', day: '#4E8A3A', night: '#9ED67E', style: 'solid', fx: 'vine', rarity: 'rare' },
  { name: 'Fish scales', day: '#2C7FA8', night: '#86C9EC', style: 'solid', fx: 'scales', rarity: 'rare' },
  { name: 'Gingham', day: '#C0504D', night: '#F29A93', style: 'solid', fx: 'gingham', rarity: 'uncommon' },
  { name: 'Pastel stripes', day: '#B0609A', night: '#E8A6D6', style: 'solid', fx: 'pastel', rarity: 'rare' },
  { name: 'Highlighter', day: '#C99A10', night: '#F2D45C', style: 'solid', fx: 'highlight', rarity: 'uncommon' },
  // Christmas.
  { name: 'Candy cane', day: '#C8283A', night: '#FF7F8A', style: 'solid', fx: 'candycane', rarity: 'rare' },
  { name: 'Holly', day: '#2F7A45', night: '#86D69C', style: 'solid', fx: 'holly', rarity: 'rare' },
  { name: 'Fairy lights', day: '#3B5A3A', night: '#B6D6A8', style: 'solid', fx: 'lights', rarity: 'epic' },
  // Premium pencils, bought with gems (Android app only, see gems.js). `premium` instead of a rarity; anyone can still see them in Play together.
  { name: 'Heartbeat', day: '#B8325C', night: '#F590AE', style: 'solid', fx: 'heartbeat', accent: '#F06C93', premium: true },
  { name: 'Sakura', day: '#B5577E', night: '#F4B3CB', style: 'solid', fx: 'petals', accent: '#F7A8C4', premium: true },
  { name: 'Comet', day: '#2C4C9E', night: '#9DB8FF', style: 'solid', fx: 'comet', accent: '#F2B33D', premium: true },
  { name: 'Opal', day: '#6E72B8', night: '#C9CCF5', style: 'solid', fx: 'opal', premium: true },
];

/** The store pencil for a wire number, or null (a number from a newer app, or a plain pencil). */
export const extraPencil = i => (i >= EXTRA_PENCIL_BASE && i < EXTRA_PENCIL_BASE + EXTRA_PENCILS.length ? EXTRA_PENCILS[i - EXTRA_PENCIL_BASE] : null);

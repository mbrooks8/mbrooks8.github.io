// The store's goods: paper (backgrounds), ping emoji and pencils, and what they cost in points.
// Pure data and small functions, no screens. Points are earned by playing and never bought with money.
// A few premium goods cost gems instead (bought from Google Play in the Android app only, see gems.js); `premium: true`.
import { EXTRA_PENCILS } from './pencils.js';

/**
 * Price by rarity. Rarity is only used here, to set prices: it is never shown to players.
 * Earning is about 5 points a puzzle (see points.js), so a casual hour is roughly 40 to 50 points:
 * a first common item in the first session, a legendary line after many evenings of play (docs/economy.md).
 */
export const RARITY_PRICE = { common: 30, uncommon: 75, rare: 180, epic: 450, legendary: 1000 };
/** Premium goods (`premium: true`): their price in gems, by kind (bought with real money in the Play Store app only; gems.js). */
export const GEM_PRICE = { pings: 120, background: 200, pencil: 250 };
const priced = (list, kind) => list.map(g => ({ ...g, currency: g.premium ? 'gems' : 'points',
  price: g.premium ? GEM_PRICE[kind] : g.rarity ? RARITY_PRICE[g.rarity] : 0 }));

/** Paper: [day] and [night] replace some colours (see sketch.js setPaper). The first one is the plain paper everybody has. */
export const BACKGROUNDS = priced([
  { id: 'cream', name: 'Cream', rarity: '', day: null, night: null },
  { id: 'mint', name: 'Mint', rarity: 'common',
    day: { paper: '#E8F0DC', paperShade: '#DCE7CC', card: '#F4F8EA', ruling: 'rgba(90,140,100,0.17)' },
    night: { paper: '#222B24', paperShade: '#2A352C', card: '#2F3A31', ruling: 'rgba(100,150,110,0.14)' } },
  { id: 'blush', name: 'Blush', rarity: 'common',
    day: { paper: '#F6E5DF', paperShade: '#EED5CD', card: '#FCF1EC', ruling: 'rgba(190,100,110,0.16)' },
    night: { paper: '#2D2326', paperShade: '#382B2F', card: '#3A2E32', ruling: 'rgba(170,100,110,0.14)' } },
  { id: 'sky', name: 'Sky', rarity: 'common',
    day: { paper: '#E4EEF3', paperShade: '#D5E4EC', card: '#F2F8FB', ruling: 'rgba(70,120,170,0.18)' },
    night: { paper: '#1F272D', paperShade: '#27323A', card: '#2C3841', ruling: 'rgba(80,130,180,0.15)' } },
  { id: 'kraft', name: 'Kraft', rarity: 'uncommon',
    day: { paper: '#E8D5B3', paperShade: '#DBC49A', card: '#F2E4C8', ruling: 'rgba(120,80,40,0.16)' },
    night: { paper: '#2B241B', paperShade: '#352C21', card: '#392F24', ruling: 'rgba(150,110,60,0.14)' } },
  { id: 'lilac', name: 'Lilac', rarity: 'uncommon',
    day: { paper: '#ECE5F1', paperShade: '#DFD5E8', card: '#F7F2FA', ruling: 'rgba(120,90,160,0.16)' },
    night: { paper: '#28232E', paperShade: '#312A39', card: '#352E3D', ruling: 'rgba(140,110,180,0.14)' } },
  { id: 'sunrise', name: 'Sunrise', rarity: 'rare',
    day: { paper: '#F8E3C8', paperShade: '#F1D3AE', card: '#FDF1E0', ruling: 'rgba(214,120,60,0.2)' },
    night: { paper: '#2E2420', paperShade: '#3A2C26', card: '#3D2F28', ruling: 'rgba(230,140,80,0.16)' } },
  { id: 'twilight', name: 'Twilight', rarity: 'rare',
    day: { paper: '#DCDDF0', paperShade: '#CBCDE6', card: '#ECEDF8', ruling: 'rgba(100,90,190,0.2)' },
    night: { paper: '#1D1F33', paperShade: '#252842', card: '#2A2D4A', ruling: 'rgba(130,120,220,0.17)' } },
  // Stationery papers: a tint plus faint pencil doodles ([motif], drawn by stationery.js). Only ever add to the end.
  { id: 'cats', name: 'Cat nap', rarity: 'epic', motif: 'cat',
    day: { paper: '#F6EADB', paperShade: '#EEDCC8', card: '#FCF4EA', ruling: 'rgba(170,110,80,0.16)' },
    night: { paper: '#2C2420', paperShade: '#372D27', card: '#3A302A', ruling: 'rgba(190,140,110,0.13)' } },
  { id: 'fish', name: 'Fishbowl', rarity: 'epic', motif: 'fish',
    day: { paper: '#E3F0EF', paperShade: '#D3E6E5', card: '#F1F8F7', ruling: 'rgba(60,130,160,0.17)' },
    night: { paper: '#1C2729', paperShade: '#243235', card: '#29373A', ruling: 'rgba(90,160,180,0.14)' } },
  { id: 'plants', name: 'Greenhouse', rarity: 'epic', motif: 'plant',
    day: { paper: '#EBF0DF', paperShade: '#DEE6CF', card: '#F5F8EE', ruling: 'rgba(100,140,80,0.17)' },
    night: { paper: '#212921', paperShade: '#2A332A', card: '#2E382E', ruling: 'rgba(120,160,100,0.14)' } },
  { id: 'stars', name: 'Stargazer', rarity: 'rare', motif: 'stars',
    day: { paper: '#E6E5F2', paperShade: '#D8D6EA', card: '#F2F1F9', ruling: 'rgba(100,90,180,0.17)' },
    night: { paper: '#1B1D30', paperShade: '#23263D', card: '#282B45', ruling: 'rgba(140,130,220,0.15)' } },
  { id: 'clouds', name: 'Cloudy day', rarity: 'rare', motif: 'clouds',
    day: { paper: '#EAF1F7', paperShade: '#DBE7F0', card: '#F5F9FC', ruling: 'rgba(80,130,180,0.17)' },
    night: { paper: '#1E252D', paperShade: '#262F39', card: '#2B3540', ruling: 'rgba(110,150,200,0.14)' } },
  { id: 'bakery', name: 'Bakery', rarity: 'rare', motif: 'bakery',
    day: { paper: '#F8EEDC', paperShade: '#F0E1C8', card: '#FDF6EA', ruling: 'rgba(190,120,90,0.16)' },
    night: { paper: '#2D2620', paperShade: '#382F28', card: '#3B322A', ruling: 'rgba(200,140,110,0.13)' } },
  // More stationery, the Christmas papers, then the papers that move (rarest).
  { id: 'washi', name: 'Washi tape', rarity: 'uncommon', motif: 'washi',
    day: { paper: '#F7EFE6', paperShade: '#EEE1D4', card: '#FCF7F1', ruling: 'rgba(194,112,138,0.15)' },
    night: { paper: '#2C2427', paperShade: '#372D31', card: '#3A3034', ruling: 'rgba(227,163,184,0.12)' } },
  { id: 'grid', name: 'Grid', rarity: 'common', motif: 'grid',
    day: { paper: '#F4F2EC', paperShade: '#E9E6DD', card: '#FBFAF6', ruling: 'transparent' },
    night: { paper: '#23262A', paperShade: '#2B2F34', card: '#30343A', ruling: 'transparent' } },
  { id: 'dotgrid', name: 'Dot grid', rarity: 'common', motif: 'dotgrid',
    day: { paper: '#F6F3EC', paperShade: '#ECE7DC', card: '#FCFAF5', ruling: 'transparent' },
    night: { paper: '#262420', paperShade: '#2F2C27', card: '#35312B', ruling: 'transparent' } },
  { id: 'graph', name: 'Graph paper', rarity: 'common', motif: 'graph',
    day: { paper: '#EEF3EA', paperShade: '#E1E9DB', card: '#F7FAF4', ruling: 'transparent' },
    night: { paper: '#1F2722', paperShade: '#27302A', card: '#2C362F', ruling: 'transparent' } },
  { id: 'strawberry', name: 'Strawberry patch', rarity: 'rare', motif: 'strawberry',
    day: { paper: '#FAEDEA', paperShade: '#F3DDD9', card: '#FDF6F4', ruling: 'rgba(196,80,94,0.15)' },
    night: { paper: '#2D2224', paperShade: '#382A2D', card: '#3B2E31', ruling: 'rgba(238,154,164,0.12)' } },
  { id: 'rainy', name: 'Rainy window', rarity: 'rare', motif: 'rainy',
    day: { paper: '#E6ECF0', paperShade: '#D8E1E7', card: '#F2F6F8', ruling: 'rgba(94,127,153,0.17)' },
    night: { paper: '#1C2228', paperShade: '#242B32', card: '#29313A', ruling: 'rgba(157,184,204,0.13)' } },
  { id: 'bunny', name: 'Bunny meadow', rarity: 'epic', motif: 'bunny',
    day: { paper: '#F6F0E8', paperShade: '#ECE3D7', card: '#FCF9F4', ruling: 'rgba(160,126,110,0.15)' },
    night: { paper: '#29241F', paperShade: '#332D27', card: '#38312A', ruling: 'rgba(216,192,174,0.12)' } },
  { id: 'bear', name: 'Bear picnic', rarity: 'epic', motif: 'bear',
    day: { paper: '#F5E9D7', paperShade: '#EBDCC4', card: '#FBF4EA', ruling: 'rgba(154,106,66,0.16)' },
    night: { paper: '#2B2219', paperShade: '#352A20', card: '#392E24', ruling: 'rgba(217,180,138,0.12)' } },
  { id: 'autumn', name: 'Autumn leaves', rarity: 'rare', motif: 'autumn',
    day: { paper: '#F6E8D6', paperShade: '#EDDAC2', card: '#FCF4EA', ruling: 'rgba(184,100,46,0.15)' },
    night: { paper: '#2C221A', paperShade: '#372A21', card: '#3A2E24', ruling: 'rgba(230,167,122,0.12)' } },
  { id: 'snowday', name: 'Snow day', rarity: 'rare', motif: 'snowday',
    day: { paper: '#EEF2F6', paperShade: '#E0E7EE', card: '#F7F9FB', ruling: 'rgba(110,143,176,0.16)' },
    night: { paper: '#1D232B', paperShade: '#252C35', card: '#2A323C', ruling: 'rgba(180,204,228,0.12)' } },
  { id: 'letter', name: 'Old letter', rarity: 'rare', motif: 'letter',
    day: { paper: '#F2E8D4', paperShade: '#E7DABF', card: '#F9F2E4', ruling: 'rgba(138,106,72,0.17)' },
    night: { paper: '#2A2419', paperShade: '#342C20', card: '#383024', ruling: 'rgba(205,178,145,0.12)' } },
  { id: 'holly', name: 'Holly jolly', rarity: 'epic', motif: 'xmas',
    day: { paper: '#F5EFE3', paperShade: '#EBE2D1', card: '#FBF7EF', ruling: 'rgba(179,58,58,0.14)' },
    night: { paper: '#25221E', paperShade: '#2F2B26', card: '#34302A', ruling: 'rgba(232,142,134,0.12)' } },
  { id: 'fireflies', name: 'Fireflies', rarity: 'legendary', motif: 'fireflies',
    day: { paper: '#EEF0DE', paperShade: '#E2E6CD', card: '#F7F8EE', ruling: 'rgba(126,126,48,0.15)' },
    night: { paper: '#1A2118', paperShade: '#222A1F', card: '#273024', ruling: 'rgba(232,224,122,0.1)' } },
  { id: 'koi', name: 'Koi pond', rarity: 'legendary', motif: 'koi',
    day: { paper: '#E4EEEC', paperShade: '#D6E4E1', card: '#F1F7F6', ruling: 'rgba(60,130,140,0.16)' },
    night: { paper: '#1B2526', paperShade: '#232F30', card: '#283536', ruling: 'rgba(140,190,190,0.12)' } },
  { id: 'petals', name: 'Petal breeze', rarity: 'legendary', motif: 'petals',
    day: { paper: '#F8EDEF', paperShade: '#F0DFE3', card: '#FCF6F7', ruling: 'rgba(200,110,136,0.14)' },
    night: { paper: '#2B2226', paperShade: '#352B30', card: '#3A2F34', ruling: 'rgba(238,169,190,0.12)' } },
  { id: 'snowfall', name: 'Snowfall', rarity: 'legendary', motif: 'snowfall',
    day: { paper: '#EAF0F6', paperShade: '#DCE5EE', card: '#F5F8FB', ruling: 'rgba(111,143,184,0.16)' },
    night: { paper: '#1A2030', paperShade: '#22293B', card: '#272F43', ruling: 'rgba(160,180,220,0.12)' } },
  // Premium papers (gems).
  { id: 'tea', name: 'Teatime', premium: true, motif: 'tea',
    day: { paper: '#F6ECE2', paperShade: '#EDDDCD', card: '#FCF6F0', ruling: 'rgba(150,100,70,0.15)' },
    night: { paper: '#2A231F', paperShade: '#342B26', card: '#39302A', ruling: 'rgba(210,170,140,0.12)' } },
  { id: 'lanterns', name: 'Lanterns', premium: true, motif: 'lanterns',
    day: { paper: '#F7EDDF', paperShade: '#EFDFCB', card: '#FCF6EE', ruling: 'rgba(190,110,60,0.15)' },
    night: { paper: '#241E1C', paperShade: '#2E2623', card: '#342B27', ruling: 'rgba(232,160,112,0.11)' } },
], 'background');

/** Every ping feeling the game can show. Only the key goes over the wire, so a friend sees yours even without the pack. */
export const PING_PACKS = priced([
  { id: 'basic', name: 'Feelings', rarity: '', kinds: [
    { key: 'heart', glyph: '❤️', word: 'Love it' }, { key: 'thumbs', glyph: '👍', word: 'Good' },
    { key: 'question', glyph: '❓', word: 'Huh?' }, { key: 'cheer', glyph: '🎉', word: 'Yay' },
    { key: 'think', glyph: '🤔', word: 'Hmm' }, { key: 'oops', glyph: '😅', word: 'Oops' }] },
  { id: 'garden', name: 'Garden', rarity: 'uncommon', kinds: [
    { key: 'flower', glyph: '🌸', word: 'Pretty' }, { key: 'bee', glyph: '🐝', word: 'Busy bee' },
    { key: 'butterfly', glyph: '🦋', word: 'Flutter' }, { key: 'sunflower', glyph: '🌻', word: 'Sunny' },
    { key: 'mushroom', glyph: '🍄', word: 'Look closer' }, { key: 'ladybug', glyph: '🐞', word: 'Lucky' }] },
  { id: 'treats', name: 'Treats', rarity: 'uncommon', kinds: [
    { key: 'cookie', glyph: '🍪', word: 'Sweet' }, { key: 'berry', glyph: '🍓', word: 'Yum' },
    { key: 'cupcake', glyph: '🧁', word: 'Treat' }, { key: 'tea', glyph: '☕', word: 'Take a break' },
    { key: 'honey', glyph: '🍯', word: 'Nice one' }, { key: 'pie', glyph: '🥧', word: 'Easy as pie' }] },
  { id: 'sky', name: 'Sky', rarity: 'common', kinds: [
    { key: 'star', glyph: '⭐', word: 'Star' }, { key: 'moon', glyph: '🌙', word: 'Quiet one' },
    { key: 'sun', glyph: '☀️', word: 'Bright' }, { key: 'rainbow', glyph: '🌈', word: 'Rainbow' },
    { key: 'cloud', glyph: '☁️', word: 'Drifting' }, { key: 'spark', glyph: '✨', word: 'Sparkle' }] },
  { id: 'critters', name: 'Critters', rarity: 'rare', kinds: [
    { key: 'cat', glyph: '🐱', word: 'Meow' }, { key: 'dog', glyph: '🐶', word: 'Woof' },
    { key: 'fox', glyph: '🦊', word: 'Clever' }, { key: 'owl', glyph: '🦉', word: 'Wise' },
    { key: 'frog', glyph: '🐸', word: 'Hop' }, { key: 'sheep', glyph: '🐑', word: 'Fence it in' }] },
  { id: 'sea', name: 'Sea', rarity: 'uncommon', kinds: [
    { key: 'octopus', glyph: '🐙', word: 'Tangled' }, { key: 'whale', glyph: '🐳', word: 'Big one' },
    { key: 'fish', glyph: '🐠', word: 'Swim on' }, { key: 'crab', glyph: '🦀', word: 'Sideways' },
    { key: 'shell', glyph: '🐚', word: 'Listen' }, { key: 'wave', glyph: '🌊', word: 'Flow' }] },
  { id: 'space', name: 'Space', rarity: 'rare', kinds: [
    { key: 'rocket', glyph: '🚀', word: 'Go go' }, { key: 'planet', glyph: '🪐', word: 'Far out' },
    { key: 'alien', glyph: '👽', word: 'Hello' }, { key: 'ufo', glyph: '🛸', word: 'Look up' },
    { key: 'comet', glyph: '☄️', word: 'Whoosh' }, { key: 'globe', glyph: '🌍', word: 'Whole board' }] },
  { id: 'party', name: 'Party', rarity: 'rare', kinds: [
    { key: 'party', glyph: '🥳', word: 'Party' }, { key: 'balloon', glyph: '🎈', word: 'Up up' },
    { key: 'gift', glyph: '🎁', word: 'For you' }, { key: 'disco', glyph: '🪩', word: 'Groove' },
    { key: 'confetti', glyph: '🎊', word: 'Hooray' }, { key: 'cake', glyph: '🎂', word: 'Cake time' }] },
  { id: 'magic', name: 'Magic', rarity: 'epic', kinds: [
    { key: 'crystal', glyph: '🔮', word: 'I see it' }, { key: 'wand', glyph: '🪄', word: 'Abracadabra' },
    { key: 'wizard', glyph: '🧙', word: 'Wizard' }, { key: 'dragon', glyph: '🐉', word: 'Dragon' },
    { key: 'unicorn', glyph: '🦄', word: 'Magical' }, { key: 'fairy', glyph: '🧚', word: 'Sprinkle' }] },
  { id: 'kitties', name: 'Kitties', rarity: 'rare', kinds: [{ key: 'catlove', glyph: '😻', word: 'Adore it' }, { key: 'catlol', glyph: '😹', word: 'Ha!' }, { key: 'catgasp', glyph: '🙀', word: 'Whoa' }, { key: 'catsad', glyph: '😿', word: 'Aww' }, { key: 'catsmug', glyph: '😼', word: 'Got it' }, { key: 'paws', glyph: '🐾', word: 'Pawsome' }] },
  { id: 'weather', name: 'Weather', rarity: 'common', kinds: [{ key: 'rain', glyph: '🌧️', word: 'Drizzle' }, { key: 'snow', glyph: '❄️', word: 'Chilly' }, { key: 'wind', glyph: '🌬️', word: 'Breezy' }, { key: 'umbrella', glyph: '☂️', word: 'Covered' }, { key: 'storm', glyph: '⛈️', word: 'Stormy' }, { key: 'clearing', glyph: '🌤️', word: 'Clearing up' }] },
  { id: 'bakery', name: 'Bakery', rarity: 'uncommon', kinds: [{ key: 'croissant', glyph: '🥐', word: 'Flaky' }, { key: 'bread', glyph: '🍞', word: 'Fresh' }, { key: 'donut', glyph: '🍩', word: 'Sweet' }, { key: 'pancake', glyph: '🥞', word: 'Stack it' }, { key: 'pudding', glyph: '🍮', word: 'Wobbly' }, { key: 'pretzel', glyph: '🥨', word: 'Twisty' }] },
  { id: 'cozy', name: 'Cozy', rarity: 'uncommon', kinds: [{ key: 'candle', glyph: '🕯️', word: 'Calm' }, { key: 'scarf', glyph: '🧣', word: 'Snug' }, { key: 'books', glyph: '📚', word: 'Studying' }, { key: 'teddy', glyph: '🧸', word: 'Cuddle' }, { key: 'couch', glyph: '🛋️', word: 'Comfy' }, { key: 'plant', glyph: '🪴', word: 'Growing' }] },
  { id: 'pond', name: 'Pond', rarity: 'uncommon', kinds: [{ key: 'duck', glyph: '🦆', word: 'Quack' }, { key: 'turtle', glyph: '🐢', word: 'Slow and steady' }, { key: 'lotus', glyph: '🪷', word: 'Bloom' }, { key: 'minnow', glyph: '🐟', word: 'Swim' }, { key: 'snail', glyph: '🐌', word: 'Take your time' }, { key: 'swan', glyph: '🦢', word: 'Graceful' }] },
  { id: 'moods', name: 'Moods', rarity: 'common', kinds: [{ key: 'sleepy', glyph: '😴', word: 'Sleepy' }, { key: 'cool', glyph: '😎', word: 'Cool' }, { key: 'shy', glyph: '😳', word: 'Eep' }, { key: 'wow', glyph: '🤩', word: 'Wow' }, { key: 'cozy', glyph: '🥰', word: 'Cozy' }, { key: 'determined', glyph: '😤', word: 'Got this' }] },
  { id: 'christmas', name: 'Christmas', rarity: 'rare', kinds: [{ key: 'xmastree', glyph: '🎄', word: 'Merry' }, { key: 'santa', glyph: '🎅', word: 'Ho ho ho' }, { key: 'snowman', glyph: '⛄', word: 'Frosty' }, { key: 'reindeer', glyph: '🦌', word: 'Dash away' }, { key: 'bell', glyph: '🔔', word: 'Jingle' }, { key: 'stocking', glyph: '🧦', word: 'Stuffed' }] },
  // Premium packs (gems).
  { id: 'royal', name: 'Fancy', premium: true, kinds: [
    { key: 'crown', glyph: '👑', word: 'Royal' }, { key: 'gem', glyph: '💎', word: 'Shiny' },
    { key: 'tophat', glyph: '🎩', word: 'Fancy' }, { key: 'peacock', glyph: '🦚', word: 'Show-off' },
    { key: 'rose', glyph: '🌹', word: 'For you' }, { key: 'trophy', glyph: '🏆', word: 'Champion' }] },
  { id: 'seasons', name: 'Seasons', premium: true, kinds: [
    { key: 'tulip', glyph: '🌷', word: 'Spring' }, { key: 'melon', glyph: '🍉', word: 'Summer' },
    { key: 'fallleaf', glyph: '🍂', word: 'Autumn' }, { key: 'skate', glyph: '⛸️', word: 'Glide' },
    { key: 'pumpkin', glyph: '🎃', word: 'Boo' }, { key: 'fireworks', glyph: '🎆', word: 'New year' }] },
], 'pings');

/** Pencils: the number is what Play together sends (see room.js EXTRA_PENCIL_BASE). */
export const PENCIL_GOODS = priced(EXTRA_PENCILS.map((p, i) => ({ id: 'pencil-' + p.name.toLowerCase().replace(/ /g, '-'), pencil: 100 + i, name: p.name, rarity: p.rarity, premium: !!p.premium })), 'pencil');

/** Everything for sale, as { id, kind: 'background' | 'pings' | 'pencil', name, price, currency: 'points' | 'gems' }. */
const good = (id, kind, g) => ({ id, kind, name: g.name, price: g.price, currency: g.currency, premium: !!g.premium, rarity: g.rarity });
export const GOODS = [
  ...BACKGROUNDS.filter(b => b.price > 0).map(b => good('bg-' + b.id, 'background', b)),
  ...PING_PACKS.filter(p => p.price > 0).map(p => good('pings-' + p.id, 'pings', p)),
  ...PENCIL_GOODS.map(p => good(p.id, 'pencil', p)),
];

export const goodById = id => GOODS.find(g => g.id === id) || null;

/** Ids from a saved list ("a,b,c"): only real goods, once each. */
export function parseOwned(s) {
  const out = [];
  for (const id of String(s || '').split(',')) if (goodById(id) && !out.includes(id)) out.push(id);
  return out;
}

/** What buying [id] does: { ok, why } given [balance] (points, or gems for a premium good) and the [owned] ids. */
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

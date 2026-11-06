// The ExpenseMonster mark: a small horned monster peeking over the household ledger, on flat ink blue.
// Matches BrandMark in src/ui/components/Aurora.tsx and the "paper and ink" palette (theme.ts heroBase).
const INK = '#1C3577';
const MIST = '#E7ECF8';
const PAW = '#C4D2FA';
const ground = (s) => `<rect width="${s}" height="${s}" fill="${INK}"/>`;

// Mark drawn in a 100x100 box centred at 50,54: the monster peeking over the household ledger.
// `head` is the monster, `page` the ledger sheet, `cut` the eyes, ruled lines and the gap that
// keeps head and page apart (so the single-colour themed icon still reads as two shapes).
const mark = (head, page, cut, mono = false) => `
  <g>
    <path d="M38 35 C31 31 28 22 30 14 C34 20 40 24 46 28 Z" fill="${head}"/>
    <path d="M62 35 C69 31 72 22 70 14 C66 20 60 24 54 28 Z" fill="${head}"/>
    <circle cx="50" cy="46" r="19" fill="${head}"/>
    <ellipse cx="43" cy="43.5" rx="3.4" ry="4.4" fill="${cut}"/>
    <ellipse cx="57" cy="43.5" rx="3.4" ry="4.4" fill="${cut}"/>
    <rect x="22" y="52" width="56" height="34" rx="6" fill="${page}" stroke="${cut}" stroke-width="${mono ? 3.5 : 0}"/>
    <path d="M31 66 H69 M31 75 H58" stroke="${cut}" stroke-opacity="${mono ? 1 : 0.35}" stroke-width="3" stroke-linecap="round"/>
    <g fill="${mono ? head : PAW}">
      <rect x="31" y="47" width="11" height="12" rx="5.5"/>
      <rect x="58" y="47" width="11" height="12" rx="5.5"/>
    </g>
  </g>`;

const svg = (s, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}</svg>`;
const place = (s, scale, inner) => `<g transform="translate(${s / 2 - 50 * scale} ${s / 2 - 54 * scale}) scale(${scale})">${inner}</g>`;

module.exports = {
  INK,
  icon: (s) => svg(s, ground(s) + place(s, s * 0.0078, mark(MIST, '#FFFFFF', INK))),
  bg: (s) => svg(s, ground(s)),
  fg: (s) => svg(s, place(s, s * 0.0062, mark(MIST, '#FFFFFF', INK))),
  // Themed (monochrome) icon: the silhouette with eyes, ruled lines and the head/page gap cut out.
  mono: (s) => svg(s, `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${s}" height="${s}">${place(s, s * 0.0064, mark('#FFFFFF', '#FFFFFF', '#000000', true))}</mask></defs><rect width="${s}" height="${s}" fill="#FFFFFF" mask="url(#m)"/>`),
  splash: (s) => svg(s, place(s, s * 0.0085, mark(MIST, '#FFFFFF', INK))),
};

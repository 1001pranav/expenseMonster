// The ExpenseMonster mark: a friendly coin with two horns, on the Aurora background.
const aurora = (s) => `
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3A22B8"/><stop offset="1" stop-color="#170F45"/></linearGradient>
    <radialGradient id="ga" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8E6CFF" stop-opacity="0.95"/><stop offset="1" stop-color="#8E6CFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="gb" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FF4F8B" stop-opacity="0.85"/><stop offset="1" stop-color="#FF4F8B" stop-opacity="0"/></radialGradient>
    <radialGradient id="gc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFB23F" stop-opacity="0.9"/><stop offset="0.5" stop-color="#FF7A45" stop-opacity="0.35"/><stop offset="1" stop-color="#FF7A45" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#base)"/>
  <ellipse cx="${s*0.1}" cy="${s*0.1}" rx="${s*0.7}" ry="${s*0.7}" fill="url(#ga)"/>
  <ellipse cx="${s*1.0}" cy="${s*0.15}" rx="${s*0.55}" ry="${s*0.55}" fill="url(#gb)"/>
  <ellipse cx="${s*0.85}" cy="${s*1.0}" rx="${s*0.45}" ry="${s*0.4}" fill="url(#gc)"/>`;

// Mark drawn in a 100x100 box centred at 50,54.
const mark = (fill, eye, mono = false) => `
  <g>
    <path d="M30 34 C24 28 22 19 25 11 C30 17 36 22 43 25 Z" fill="${fill}"/>
    <path d="M70 34 C76 28 78 19 75 11 C70 17 64 22 57 25 Z" fill="${fill}"/>
    <circle cx="50" cy="56" r="34" fill="${fill}"/>
    ${mono ? '' : `<circle cx="50" cy="56" r="28" fill="none" stroke="${eye}" stroke-opacity="0.1" stroke-width="2.5"/>`}
    <ellipse cx="39" cy="49" rx="4.8" ry="6.2" fill="${eye}"/>
    <ellipse cx="61" cy="49" rx="4.8" ry="6.2" fill="${eye}"/>
    ${mono ? '' : `<circle cx="40.5" cy="46.8" r="1.6" fill="#fff"/><circle cx="62.5" cy="46.8" r="1.6" fill="#fff"/>`}
    <path d="M36 62 Q50 64 64 62 Q62 78 50 78 Q38 78 36 62 Z" fill="${eye}"/>
    <path d="M44 62.6 L47 69 L50 63 Z" fill="${mono ? '#000' : fill}" ${mono ? 'fill-opacity="0"' : ''}/>
  </g>`;

const svg = (s, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}</svg>`;
const place = (s, scale, inner) => `<g transform="translate(${s/2 - 50*scale} ${s/2 - 54*scale}) scale(${scale})">${inner}</g>`;

module.exports = {
  icon: (s) => svg(s, aurora(s) + place(s, s*0.0068, mark('#FFFFFF', '#2A1F7A'))),
  bg: (s) => svg(s, aurora(s)),
  fg: (s) => svg(s, place(s, s*0.0046, mark('#FFFFFF', '#2A1F7A'))),
  mono: (s) => svg(s, `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${s}" height="${s}">${place(s, s*0.0050, mark('#FFFFFF', '#000000'))}</mask></defs><rect width="${s}" height="${s}" fill="#FFFFFF" mask="url(#m)"/>`),
  splash: (s) => svg(s, place(s, s*0.0085, mark('#FFFFFF', '#2A1F7A'))),
};

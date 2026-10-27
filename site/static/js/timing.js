// Scroll choreography shared by the page and the scenes (no three.js here, so it loads with the page).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* Hero: scroll inside the hero, in screens -> particle stage.
   0 cloud, 1 mark, 2 bubble, 3 lock, 4 ribbon through the barrier; each shape holds for a third of a screen. */
const K = [[0.06, 0], [0.74, 1], [1.1, 1], [1.66, 2], [2.02, 2], [2.58, 3], [2.94, 3], [3.5, 4]];
export function heroStage(u) {
  if (u <= K[0][0]) return 0;
  for (let i = 1; i < K.length; i++) {
    if (u <= K[i][0]) {
      const [y0, s0] = K[i - 1], [y1, s1] = K[i];
      return s0 + (s1 - s0) * (u - y0) / (y1 - y0);
    }
  }
  return 4;
}
/* after the ribbon has passed the barrier the page floods to light over half a screen */
export const FLOOD = [3.6, 4.1];
export const HERO_SCREENS = 5.1;   // matches .gl .hero height in site.css: the stage lets go as the flood completes

/* The phone film: progress 0..1 while its stage is pinned. */
export const PHONE_BEATS = [
  { in: [-1, -0.5], out: [0.22, 0.27] },   // No phone number. No email. No real name.
  { in: [0.33, 0.38], out: [0.58, 0.62] }, // The relay never sees plaintext.
  { in: [0.645, 0.695], out: [2, 3] },     // Only Maya's phone can read it.
];
export function beatAlpha(b, p) {
  const ain = smooth(b.in[0], b.in[1], p), aout = smooth(b.out[0], b.out[1], p);
  return { a: ain * (1 - aout), ain, aout };
}

// Timing shared by the page and the scenes (no three.js here, so it loads with the page).

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* The phone film: progress 0..1 of its timeline. */
export const PHONE_BEATS = [
  { in: [-1, -0.5], out: [0.22, 0.27] },   // No phone number. No email. No real name.
  { in: [0.33, 0.38], out: [0.58, 0.62] }, // The relay never sees plaintext.
  { in: [0.645, 0.695], out: [2, 3] },     // Only Maya's phone can read it.
];
export function beatAlpha(b, p) {
  const ain = smooth(b.in[0], b.in[1], p), aout = smooth(b.out[0], b.out[1], p);
  return { a: ain * (1 - aout), ain, aout };
}

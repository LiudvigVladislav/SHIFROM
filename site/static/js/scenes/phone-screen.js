// Paints the SHIFROM chat screen (design preview) into a canvas (from the round-2 Phone prototype).
// Logical layout is 1080 x 2330; the canvas may be scaled down for phones. Set in Onest, the page's text face.

export const LW = 1080;
export const LH = 2330;

const FONT = '"Onest", system-ui, sans-serif';

const C = {
  bg0: '#0d0d14',
  bg1: '#0a0a10',
  text: '#f1f1f6',
  muted: '#8d8d9c',
  dim: '#5f5f6e',
  them: '#1d1d27',
  meA: '#7a3cf4',
  meB: '#3d5cf5',
  online: '#3ddc97',
  line: 'rgba(255,255,255,0.07)',
};

// One file serves both languages: strings follow <html lang>.
const RU = (document.documentElement.lang || '').toLowerCase().startsWith('ru');
const T = RU ? {
  name: 'Майя Херцог', initials: 'МХ', online: 'в сети', chip: 'Сквозное шифрование · @maya', composer: 'Сообщение',
} : {
  name: 'Maya Hertzog', initials: 'MH', online: 'online', chip: 'End-to-end encrypted · @maya', composer: 'Message',
};

export const MESSAGES = RU ? [
  { me: false, time: '14:18', text: 'Посмотришь проект договора? Есть вопрос по пункту на странице 4.' },
  { me: true, time: '14:20', text: 'Пункт 4.2 об ответственности слишком широкий. Лучше уточнить до подписания.' },
  { me: false, time: '14:21', text: 'Вот он меня и смущал. Попросим юриста исправить?' },
  { me: true, time: '14:22', text: 'Да. Сегодня подготовлю замечания.' },
] : [
  { me: false, time: '14:18', text: 'Can you look over the contract draft? There’s a clause on p.4 I’d like your read on.' },
  { me: true, time: '14:20', text: 'Section 4.2 — the liability clause — reads too broad. I’d flag it before signing.' },
  { me: false, time: '14:21', text: 'That’s exactly what I was unsure about. Ask legal to revise?' },
  { me: true, time: '14:22', text: 'Yes. I’ll draft a note this afternoon.' },
];

const BUB = { maxW: 740, padX: 38, padY: 30, font: 44, lh: 58, meta: 30, gap: 26, radius: 44, tail: 14 };
const TOP = 520; // first bubble y

function rr(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Measure every bubble once (layout never shifts: bubbles stack from the top).
export function layout(ctx) {
  ctx.font = `400 ${BUB.font}px ${FONT}`;
  let y = TOP;
  const boxes = MESSAGES.map((m) => {
    const lines = wrap(ctx, m.text, BUB.maxW - BUB.padX * 2);
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const metaW = m.me ? 150 : 96;
    const lastW = ctx.measureText(lines[lines.length - 1]).width;
    // meta sits on the last line if it fits, else on its own line
    const metaInline = lastW + metaW + 24 <= BUB.maxW - BUB.padX * 2;
    const w = Math.min(BUB.maxW, Math.max(textW, metaInline ? lastW + metaW + 24 : metaW) + BUB.padX * 2);
    const h = BUB.padY * 2 + lines.length * BUB.lh + (metaInline ? 0 : BUB.meta + 8);
    const x = m.me ? LW - 44 - w : 44;
    const box = { x, y, w, h, lines, metaInline };
    y += h + BUB.gap;
    return box;
  });
  // anchor the full conversation just above the composer
  const last = boxes[boxes.length - 1];
  const delta = 2068 - (last.y + last.h);
  boxes.forEach((b) => { b.y += delta; });
  return boxes;
}

function tick(ctx, x, y, s, double, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.4 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const one = (ox) => {
    ctx.beginPath();
    ctx.moveTo(x + ox, y + 9 * s);
    ctx.lineTo(x + ox + 7 * s, y + 16 * s);
    ctx.lineTo(x + ox + 20 * s, y + 1 * s);
    ctx.stroke();
  };
  if (double) { one(0); one(10 * s); } else one(5 * s);
  ctx.restore();
}

function clock(ctx, x, y, s, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x + 14 * s, y + 9 * s, 10 * s, 0, Math.PI * 2);
  ctx.moveTo(x + 14 * s, y + 3.5 * s);
  ctx.lineTo(x + 14 * s, y + 9.5 * s);
  ctx.lineTo(x + 18.5 * s, y + 12 * s);
  ctx.stroke();
  ctx.restore();
}

// Draw one bubble at (box.x, box.y) offset by (dx, dy). status: 'clock' | 'double'
export function drawBubble(ctx, m, box, dx = 0, dy = 0, status = 'double') {
  const x = box.x + dx, y = box.y + dy;
  const t = BUB.tail;
  const r = BUB.radius;
  rr(ctx, x, y, box.w, box.h, m.me ? [r, r, t, r] : [r, r, r, t]);
  if (m.me) {
    const g = ctx.createLinearGradient(x, y, x + box.w, y + box.h);
    g.addColorStop(0, C.meA);
    g.addColorStop(1, C.meB);
    ctx.fillStyle = g;
  } else ctx.fillStyle = C.them;
  ctx.fill();

  ctx.fillStyle = m.me ? '#ffffff' : C.text;
  ctx.font = `400 ${BUB.font}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  box.lines.forEach((l, i) => ctx.fillText(l, x + BUB.padX, y + BUB.padY + 44 + i * BUB.lh));

  // meta: time (+ ticks for my messages), bottom-right
  const metaY = y + box.h - BUB.padY - 2;
  ctx.font = `400 ${BUB.meta}px ${FONT}`;
  const metaCol = m.me ? 'rgba(255,255,255,0.72)' : C.muted;
  ctx.fillStyle = metaCol;
  const tw = ctx.measureText(m.time).width;
  let mx = x + box.w - BUB.padX - (m.me ? 42 : 0) - tw;
  ctx.fillText(m.time, mx, metaY);
  if (m.me) {
    const ix = x + box.w - BUB.padX - 32, iy = metaY - 20;
    if (status === 'clock') clock(ctx, ix, iy, 1, metaCol);
    else tick(ctx, ix, iy, 1, true, '#ffffff');
  }
}

function statusBar(ctx) {
  ctx.fillStyle = C.text;
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText('14:22', 112, 104);
  // Android punch-hole camera (the product is Android-first)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(LW / 2, 86, 26, 0, Math.PI * 2);
  ctx.fill();
  // signal
  for (let i = 0; i < 4; i++) {
    rr(ctx, 812 + i * 17, 98 - 12 - i * 8, 11, 12 + i * 8, 3);
    ctx.fillStyle = C.text;
    ctx.fill();
  }
  // wifi
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(905, 100, 10 + i * 11, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
  }
  ctx.restore();
  // battery
  ctx.save();
  ctx.strokeStyle = 'rgba(241,241,246,0.5)';
  ctx.lineWidth = 3;
  rr(ctx, 944, 72, 70, 34, 10);
  ctx.stroke();
  ctx.fillStyle = C.text;
  rr(ctx, 950, 78, 50, 22, 6);
  ctx.fill();
  rr(ctx, 1017, 83, 5, 12, 2);
  ctx.fill();
  ctx.restore();
}

function header(ctx, logo) {
  // back chevron
  ctx.save();
  ctx.strokeStyle = '#9a8cff';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(84, 216);
  ctx.lineTo(62, 246);
  ctx.lineTo(84, 276);
  ctx.stroke();
  ctx.restore();
  // avatar
  const ax = 186, ay = 246, ar = 58;
  const g = ctx.createLinearGradient(ax - ar, ay - ar, ax + ar, ay + ar);
  g.addColorStop(0, '#ff8a6b');
  g.addColorStop(1, '#c44bd8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 52px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(T.initials, ax, ay + 18);
  ctx.textAlign = 'left';
  // name + presence
  ctx.fillStyle = C.text;
  ctx.font = `600 50px ${FONT}`;
  ctx.fillText(T.name, 272, 236);
  ctx.fillStyle = C.online;
  ctx.beginPath();
  ctx.arc(282, 280, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `400 36px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(T.online, 302, 293);
  // right: call-less, a small info glyph
  ctx.save();
  ctx.strokeStyle = 'rgba(241,241,246,0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(990, 246, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(241,241,246,0.55)';
  ctx.fillRect(987, 240, 6, 24);
  ctx.beginPath();
  ctx.arc(990, 228, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // divider
  ctx.fillStyle = C.line;
  ctx.fillRect(0, 348, LW, 2);

  // encryption chip with the SHIFROM mark
  ctx.font = `400 34px ${FONT}`;
  const label = T.chip;
  const lw = ctx.measureText(label).width;
  const cw = lw + 56 + 60, ch = 70;
  const cx = (LW - cw) / 2, cy = 398;
  rr(ctx, cx, cy, cw, ch, 35);
  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  ctx.fill();
  if (logo && logo.complete) ctx.drawImage(logo, cx + 20, cy + 13, 44, 44);
  ctx.fillStyle = '#b9b9c8';
  ctx.fillText(label, cx + 76, cy + 47);
}

function composer(ctx, typed) {
  const y = 2120;
  rr(ctx, 40, y, 860, 112, 56);
  ctx.fillStyle = '#191922';
  ctx.fill();
  ctx.font = `400 44px ${FONT}`;
  if (typed) {
    ctx.save();
    rr(ctx, 40, y, 860, 112, 56);
    ctx.clip();
    ctx.fillStyle = C.text;
    const w = ctx.measureText(typed).width;
    const tx = Math.min(92, 860 - 60 - w);
    ctx.fillText(typed, tx, y + 72);
    // caret
    ctx.fillStyle = '#9a8cff';
    ctx.fillRect(tx + w + 6, y + 30, 4, 54);
    ctx.restore();
  } else {
    ctx.fillStyle = C.dim;
    ctx.fillText(T.composer, 92, y + 72);
  }
  // send
  const sx = 984, sy = y + 56;
  const g = ctx.createLinearGradient(sx - 56, sy - 56, sx + 56, sy + 56);
  g.addColorStop(0, C.meA);
  g.addColorStop(1, C.meB);
  ctx.fillStyle = typed ? g : '#22222c';
  ctx.beginPath();
  ctx.arc(sx, sy, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = typed ? '#fff' : '#6c6c7a';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy + 24);
  ctx.lineTo(sx, sy - 22);
  ctx.moveTo(sx - 20, sy - 4);
  ctx.lineTo(sx, sy - 24);
  ctx.lineTo(sx + 20, sy - 4);
  ctx.stroke();
  ctx.restore();
  // home indicator
  rr(ctx, LW / 2 - 150, 2290, 300, 11, 6);
  ctx.fillStyle = 'rgba(241,241,246,0.6)';
  ctx.fill();
}

// state: { shown: [0..1 x4], typed: 0..1, status4: 'clock'|'double' }
export function paint(ctx, k, boxes, state, logo) {
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, C.bg0);
  g.addColorStop(1, C.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LW, LH);
  let w = ctx.createRadialGradient(140, 2050, 0, 140, 2050, 1500);
  w.addColorStop(0, 'rgba(112,60,245,0.30)');
  w.addColorStop(1, 'rgba(112,60,245,0)');
  ctx.fillStyle = w;
  ctx.fillRect(0, 0, LW, LH);
  w = ctx.createRadialGradient(1000, 700, 0, 1000, 700, 1100);
  w.addColorStop(0, 'rgba(48,98,240,0.16)');
  w.addColorStop(1, 'rgba(48,98,240,0)');
  ctx.fillStyle = w;
  ctx.fillRect(0, 0, LW, LH);
  // header plate
  ctx.fillStyle = 'rgba(10,10,16,0.72)';
  ctx.fillRect(0, 0, LW, 350);

  statusBar(ctx);
  header(ctx, logo);

  for (let i = 0; i < MESSAGES.length; i++) {
    const a = state.shown[i];
    if (a <= 0.001) continue;
    const m = MESSAGES[i];
    const b = boxes[i];
    let shift = 0;
    for (let j = i + 1; j < MESSAGES.length; j++) shift += (1 - state.shown[j]) * (boxes[j].h + BUB.gap);
    ctx.save();
    ctx.translate(0, shift);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    const s = 0.94 + 0.06 * a;
    const ox = m.me ? b.x + b.w : b.x;
    const oy = b.y + b.h;
    ctx.translate(ox, oy + (1 - a) * 46);
    ctx.scale(s, s);
    ctx.translate(-ox, -oy);
    drawBubble(ctx, m, b, 0, 0, i === 3 ? state.status4 : 'double');
    ctx.restore();
  }

  const t = MESSAGES[3].text;
  const n = Math.round(state.typed * t.length);
  composer(ctx, n > 0 && state.shown[3] < 0.02 ? t.slice(0, n) : '');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

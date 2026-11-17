'use strict';
/* Explosiovania Map: public, static version of the guide kit's map viewer.
   Data: world.js (window.WORLD), built by tools/build_public.py from the game files.
   Saves are parsed in the browser (Godot FileAccess.store_var format); nothing is uploaded. */

const CATS = {
  upgrade:     { label: 'Health/Soul upgrade', plural: 'Health/Soul upgrades', color: '#f06595', glyph: '+', guide: true, sprite: 'upgrade' },
  ability:     { label: 'Ability',             plural: 'Abilities', color: '#fcc419', glyph: '★', guide: true, frame: 7 },
  red_eye:     { label: 'Red key',             color: '#ff6b6b', glyph: '●', guide: true, frame: 2 },
  end_key:     { label: 'Golden key',          color: '#ffe066', glyph: 'K', guide: true, frame: 3 },
  soul_door:   { label: 'Soul door',           color: '#cc5de8', glyph: 'S', guide: true, frame: 1 },
  red_door:    { label: 'Red key door',        color: '#e03131', glyph: 'D', guide: true, frame: 0 },
  golden_door: { label: 'Golden key door',     color: '#f59f00', glyph: 'G', guide: true, frame: 6 },
  race:        { label: 'Snake race',          color: '#51cf66', glyph: 'R', guide: true, frame: 9 },
  exit:        { label: 'Exit to region',      color: '#4dabf7', glyph: '→', plural: 'Exits', hidden: true },
  checkpoint:  { label: 'Checkpoint (flowers)', plural: 'Checkpoints (flowers)', color: '#8ce99a', glyph: '✿', numbered: true, frame: 4 },
  npc:         { label: 'NPC hint',            color: '#ced4da', glyph: '?', frame: 11 },
  lever_blue:  { label: 'Lever (blue)',        color: '#4dabf7', glyph: 'L', numbered: true, lever: '#4dabf7' },
  lever_gold:  { label: 'Lever (golden/chained)', color: '#fcc419', glyph: 'L', numbered: true, lever: '#fcc419', pull: true },
  lever_red:   { label: 'Lever (red/timed)',   color: '#ff6b6b', glyph: 'L', numbered: true, lever: '#ff6b6b' },
  lever_black: { label: 'Lever (black)',       color: '#868e96', glyph: 'L', numbered: true, lever: '#25222b', pull: true },
};
const DEFAULT_OFF = new Set();

/* ---------- game art ---------- */
const SPRITES = new Image();
SPRITES.onload = () => draw();
SPRITES.src = 'assets/karta_icons.webp';
try {
  const ff = new FontFace('Notable', 'url(assets/Notable-Regular.ttf)');
  ff.load().then(f => { document.fonts.add(f); draw(); }).catch(() => {});
} catch (_) {}
function pixelArt(art, pal) {
  const cnv = document.createElement('canvas'); cnv.width = 16; cnv.height = 16;
  const g = cnv.getContext('2d');
  art.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return cnv;
}
// The game has no map icon for health/soul upgrades, so this one is drawn in the same pixel style.
const UPGRADE_SPRITE = pixelArt([
  '................', '.....######.....', '....#pppppp#....', '...#pppppppp#...', '..#pppp##pppp#..', '..#pppp#w#ppp#..',
  '..#pp###w###p#..', '..#pp#wwwwww#p#.', '..#pp###w###p#..', '..#pppp#w#ppp#..', '..#pppp##pppp#..', '...#pppppppp#...',
  '....#pppppp#....', '.....######.....', '................', '................'], { '#': '#000', p: '#f06595', w: '#fff' });
const LEVER_ART = [
  '................', '..........###...', '.........#ccc#..', '.........#ccc#..', '.........#ccc#..', '........#####...',
  '.......#ss#.....', '......#ss#......', '.....#ss#.......', '....#ss#........', '...#########....', '..#bbbbbbbbb#...',
  '..#bbbbbbbbb#...', '..###########...', '................', '................'];
const LEVER_SPRITES = {};
const leverSprite = col => LEVER_SPRITES[col] || (LEVER_SPRITES[col] = pixelArt(LEVER_ART,
  { '#': col === '#25222b' ? '#d0cbe0' : '#000', c: col, s: '#c9c4d6', b: '#5b5568' }));
function drawSprite(c, cat, x, y, size, rot) {
  c.save();
  c.imageSmoothingEnabled = false;
  c.translate(x, y);
  if (rot) c.rotate(rot);
  if (cat.sprite === 'upgrade') c.drawImage(UPGRADE_SPRITE, -size / 2, -size / 2, size, size);
  else if (cat.lever) c.drawImage(leverSprite(cat.lever), -size / 2, -size / 2, size, size);
  else if (SPRITES.complete && SPRITES.naturalWidth) {
    const f = cat.frame;
    c.drawImage(SPRITES, (f % 8) * 16, Math.floor(f / 8) * 16, 16, 16, -size / 2, -size / 2, size, size);
  }
  c.restore();
}

/* ---------- state + helpers ---------- */
const W = window.WORLD;
const S = {
  region: null, sel: null, prog: null, saveName: '',
  catOn: new Set(Object.keys(CATS).filter(c => !DEFAULT_OFF.has(c))),
  view: { cx: 0, cz: 0, scale: 2 },
};
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};
const store = {
  get(k) { try { return localStorage.getItem('exmap.' + k); } catch (_) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem('exmap.' + k) : localStorage.setItem('exmap.' + k, v); } catch (_) {} },
};
const regionById = id => W.regions.find(r => r.id === id);
const fmtTime = s => { if (s == null || s < 0) return '--:--.---'; const m = Math.floor(s / 60), x = s - m * 60; return String(m).padStart(2, '0') + ':' + x.toFixed(3).padStart(6, '0'); };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hasSave = () => !!S.prog;

function collected(reg, e) {
  const v = S.prog && S.prog.items[reg.id] ? S.prog.items[reg.id][e.id] : undefined;
  if (e.cat === 'race') return typeof v === 'number' && v > 0;
  return v === true;
}
function itemTitle(reg, e) {
  if (e.cat === 'ability') return (e.name || e.ability) + (e.mini ? ' (optional)' : '');
  if (e.cat === 'exit') return 'Exit → ' + (regionById(e.to) ? regionById(e.to).name : e.to);
  if (e.cat === 'npc' && e.text) return '“' + e.text.slice(0, 38) + (e.text.length > 38 ? '…”' : '”');
  if (e.cat === 'soul_door' || e.cat === 'golden_door') return CATS[e.cat].label + (e.required ? ` (${e.required})` : '');
  return CATS[e.cat].label;
}

/* ---------- numbering: nearest-neighbour chain from the region start, per category ---------- */
const orderCache = new Map();
function ordered(reg, cat) {
  const ck = reg.id + '|' + cat;
  if (orderCache.has(ck)) return orderCache.get(ck);
  const pool = reg.entities.filter(e => e.cat === cat), chain = [];
  let cur = reg.player_start || (pool[0] && pool[0].pos) || [0, 0, 0];
  while (pool.length) {
    let bi = 0, bd = Infinity;
    pool.forEach((e, i) => { const d = dist(cur, e.pos); if (d < bd) { bd = d; bi = i; } });
    const [e] = pool.splice(bi, 1); chain.push(e); cur = e.pos;
  }
  orderCache.set(ck, chain);
  return chain;
}
const numberOf = (reg, e) => ordered(reg, e.cat).indexOf(e) + 1;

function landmarks(reg, e) {
  const out = [];
  const near = (cat, maxd) => reg.entities.filter(x => x.cat === cat && x !== e).map(x => [dist(x.pos, e.pos), x]).filter(([d]) => d <= maxd).sort((a, b) => a[0] - b[0]);
  const ex = near('exit', 60)[0];
  if (ex) out.push(`near the exit to ${regionById(ex[1].to) ? regionById(ex[1].to).name : ex[1].to}`);
  const cp = near('checkpoint', 45)[0];
  if (cp) out.push(`${Math.round(cp[0])} m from checkpoint flowers #${numberOf(reg, cp[1])}`);
  for (const c of ['soul_door', 'red_door', 'race', 'npc']) {
    const n = near(c, 25)[0];
    if (n) out.push(`near ${c === 'npc' ? 'an NPC' : 'the ' + CATS[c].label.toLowerCase()}`);
  }
  const dy = e.pos[1] - (cp ? cp[1].pos[1] : e.pos[1]);
  if (cp && Math.abs(dy) > 8) out.push(`${Math.round(Math.abs(dy))} m ${dy > 0 ? 'above' : 'below'} those flowers`);
  return out;
}

/* ---------- in-game map (karta) ---------- */
const kartaCache = {};
function rotK(px, py, K) {
  const k = ((K.rotate % 4) + 4) % 4, dx = px - K.w / 2, dy = py - K.h / 2;
  return k === 0 ? [dx, dy] : k === 1 ? [-dy, dx] : k === 2 ? [-dx, -dy] : [dy, -dx];
}
function kartaInfo(reg) {
  if (kartaCache[reg.id]) return kartaCache[reg.id];
  const K = reg.karta;
  if (!K) return null;
  const tbb = {};
  for (const [name, c] of Object.entries(K.rooms)) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < c.length; i += 3) { x0 = Math.min(x0, c[i]); y0 = Math.min(y0, c[i + 1]); x1 = Math.max(x1, c[i] + 1); y1 = Math.max(y1, c[i + 1] + 1); }
    tbb[name] = [x0, y0, x1, y1];
  }
  const wb = {};
  for (const rm of reg.rooms) {
    const b = wb[rm.name] || (wb[rm.name] = [rm.min.slice(), rm.max.slice()]);
    for (let a = 0; a < 3; a++) { b[0][a] = Math.min(b[0][a], rm.min[a]); b[1][a] = Math.max(b[1][a], rm.max[a]); }
  }
  // pixel image: room fill + white outline, like the game draws it
  const occ = new Set();
  for (const c of Object.values(K.rooms)) for (let i = 0; i < c.length; i += 3) occ.add(c[i] + ',' + c[i + 1]);
  const img = document.createElement('canvas'); img.width = K.w; img.height = K.h;
  const g = img.getContext('2d');
  const col = '#' + (K.color || '6d83bdff').slice(0, 6);
  const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [-1, 1], [1, -1]];
  for (const c of Object.values(K.rooms)) for (let i = 0; i < c.length; i += 3) {
    const x = c[i], y = c[i + 1];
    let edge = false;
    for (const [ox, oy] of N8) if (!occ.has((x + ox) + ',' + (y + oy))) { edge = true; break; }
    g.fillStyle = edge && c[i + 2] === 0 ? '#f1eef6' : col;
    g.fillRect(x, y, 1, 1);
  }
  return (kartaCache[reg.id] = { K, img, tbb, wb, masks: {} });
}
function worldToMap(reg, pos) {  // rough: player position -> map pixel, through the room it is in
  const ki = kartaInfo(reg); if (!ki) return null;
  let best = null;
  for (const rm of reg.rooms) if ([0, 1, 2].every(a => rm.min[a] - 0.5 <= pos[a] && pos[a] <= rm.max[a] + 0.5)) {
    const vol = (rm.max[0] - rm.min[0]) * (rm.max[1] - rm.min[1]) * (rm.max[2] - rm.min[2]);
    if (!best || vol < best[0]) best = [vol, rm.name];
  }
  const room = best && best[1];
  if (!room || !ki.tbb[room] || !ki.wb[room]) return null;
  const t = ki.tbb[room], w = ki.wb[room];
  const u = Math.min(1, Math.max(0, (pos[2] - w[0][2]) / Math.max(1e-6, w[1][2] - w[0][2])));
  const v = Math.min(1, Math.max(0, (w[1][0] - pos[0]) / Math.max(1e-6, w[1][0] - w[0][0])));
  return [t[0] + u * (t[2] - t[0]), t[1] + v * (t[3] - t[1])];
}
const P = e => rotK(e.map[0], e.map[1], S.region.karta);
const onMap = e => !!e.map && !CATS[e.cat].hidden;

/* ---------- map ---------- */
const cv = $('#map'), ctx = cv.getContext('2d');
function setRegion(id) {
  S.region = regionById(id); S.sel = null;
  fit();
  renderSidebar(); renderItemList(); renderDetail(); draw();
  store.set('region', id);
}
function bounds() {
  const K = S.region.karta, odd = ((K.rotate % 4) + 4) % 2 === 1;
  const hw = (odd ? K.h : K.w) / 2, hh = (odd ? K.w : K.h) / 2;
  let b = [-hw, hw, -hh, hh];
  for (const l of K.labels || []) {  // keep region labels in frame
    const [lx, ly] = rotK(l.pos[0], l.pos[1], K);
    const r = 6 * (l.scale || 1) * ((l.stage && (W.stage_names[l.stage] || l.stage).length) || 4) / 2;
    b = [Math.min(b[0], lx - (l.vertical ? 8 : r)), Math.max(b[1], lx + (l.vertical ? 8 : r)), Math.min(b[2], ly - (l.vertical ? r : 8)), Math.max(b[3], ly + (l.vertical ? r : 8))];
  }
  for (const e of S.region.entities) if (onMap(e)) {  // keep markers in frame
    const [x, y] = P(e);
    b = [Math.min(b[0], x - 6), Math.max(b[1], x + 6), Math.min(b[2], y - 6), Math.max(b[3], y + 6)];
  }
  return b;
}
function fit() {
  const w = cv.clientWidth, h = cv.clientHeight - 44;
  if (!w || !h) return;
  const [x0, x1, z0, z1] = bounds();
  S.view.cx = (x0 + x1) / 2;
  S.view.scale = Math.min(w / (x1 - x0 + 6), h / (z1 - z0 + 6));
  S.view.cz = (z0 + z1) / 2 + 22 / S.view.scale;
  draw();
}
const toScreen = (x, z) => [(x - S.view.cx) * S.view.scale + cv.clientWidth / 2, (z - S.view.cz) * S.view.scale + cv.clientHeight / 2];
const toPlane = (sx, sz) => [(sx - cv.clientWidth / 2) / S.view.scale + S.view.cx, (sz - cv.clientHeight / 2) / S.view.scale + S.view.cz];

function visibleItems() {
  const hide = $('#hideCollected').checked;
  return S.region.entities.filter(e => onMap(e) && S.catOn.has(e.cat) && !(hide && collected(S.region, e)));
}
function markerSize() { return Math.min(64, Math.max(24, 16 * S.view.scale / (S.region.karta.px || 1))); }

function draw() {
  if (!S.region) return;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = ctx, v = S.view, reg = S.region, ki = kartaInfo(reg), K = ki.K;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#0b0a0f'; c.fillRect(0, 0, w, h);
  const ts = (x, z) => toScreen(x, z);
  // room tiles
  c.save();
  const [ox, oy] = ts(0, 0);
  c.translate(ox, oy); c.rotate(K.rotate * Math.PI / 2); c.scale(v.scale, v.scale);
  c.imageSmoothingEnabled = false;
  c.drawImage(ki.img, -K.w / 2, -K.h / 2);
  const hl = S.sel && S.sel.room;
  if (hl && K.rooms[hl]) {
    let m = ki.masks[hl];
    if (!m) {
      m = document.createElement('canvas'); m.width = K.w; m.height = K.h;
      const g = m.getContext('2d'); g.fillStyle = '#ff6b3d';
      const cells = K.rooms[hl];
      for (let i = 0; i < cells.length; i += 3) g.fillRect(cells[i], cells[i + 1], 1, 1);
      ki.masks[hl] = m;
    }
    c.globalAlpha = 0.8; c.shadowColor = 'rgba(255,107,61,0.95)'; c.shadowBlur = 16;
    c.drawImage(m, -K.w / 2, -K.h / 2);
    c.shadowBlur = 0; c.globalAlpha = 1;
  }
  c.restore();
  // decorative icons from the game's map (breakable walls, sliding blocks, ...)
  const dsz = Math.min(56, Math.max(12, 16 * v.scale / (K.px || 1)));
  for (const d of K.deco || []) {
    const [dx, dy] = ts(...rotK(d.pos[0], d.pos[1], K));
    const rot = d.frame >= 12 && d.frame <= 14 ? (d.dir + 1 + K.rotate) * Math.PI / 2 + (d.rot || 0) : 0;
    drawSprite(c, { frame: d.frame }, dx, dy, dsz, rot);
  }
  // region transition labels, placed and styled like the in-game map
  S._labelHits = [];
  const fs = Math.min(42, Math.max(10, 8 * v.scale / (K.px || 1)));
  for (const l of K.labels || []) {
    const [lx, ly] = ts(...rotK(l.pos[0], l.pos[1], K));
    const text = W.stage_names[l.stage] || l.stage, lfs = fs * (l.scale || 1);
    drawRegionLabel(c, text, lx, ly, lfs, l.vertical);
    const wbox = l.vertical ? lfs * 1.1 : lfs * 0.62 * text.length, hbox = l.vertical ? lfs * 0.8 * text.length : lfs * 1.1;
    S._labelHits.push({ x0: lx - wbox / 2, x1: lx + wbox / 2, y0: ly - hbox / 2, y1: ly + hbox / 2, stage: l.stage });
  }
  // markers
  const showNum = $('#showNumbers').checked, size0 = markerSize();
  const items = visibleItems().sort((a, b) => (CATS[a.cat].small ? 0 : 1) - (CATS[b.cat].small ? 0 : 1));
  for (const e of items) {
    const [sx, sy] = ts(...P(e));
    if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue;
    const cat = CATS[e.cat], got = collected(reg, e);
    if (cat.small) { c.fillStyle = got ? '#495057' : cat.color; c.beginPath(); c.arc(sx, sy, 2.5, 0, 7); c.fill(); continue; }
    const size = size0 * (cat.lever ? 0.5 : 1);  // levers drawn at half size to reduce clutter
    c.globalAlpha = got ? 0.45 : 1;
    drawSprite(c, cat, sx, sy, size);
    c.globalAlpha = 1;
    if (got && (cat.guide || cat.pull)) {  // green tick on collected items
      const tx = sx - size * 0.3, ty = sy + size * 0.3, tr = 7 * (cat.lever ? 0.7 : 1);
      c.beginPath(); c.arc(tx, ty, tr, 0, 7); c.fillStyle = '#2b8a3e'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#000'; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(tx - tr * 0.45, ty); c.lineTo(tx - tr * 0.1, ty + tr * 0.4); c.lineTo(tx + tr * 0.5, ty - tr * 0.35); c.stroke();
    }
    if (showNum && (cat.guide || cat.numbered)) {
      const bx = sx + size * 0.33, by = sy - size * 0.33, br = 7.5 * (cat.lever ? 0.7 : 1);
      c.globalAlpha = got ? 0.6 : 1;
      c.beginPath(); c.arc(bx, by, br, 0, 7); c.fillStyle = cat.color; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#000'; c.stroke();
      c.fillStyle = '#111'; c.font = `bold ${10 * (cat.lever ? 0.75 : 1)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(numberOf(reg, e)), bx, by + 0.5);
      c.globalAlpha = 1;
    }
    if (S.sel === e) { c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.beginPath(); c.arc(sx, sy, size * 0.45, 0, 7); c.stroke(); }
  }
  // player (rough: placed inside the room it is in)
  if ($('#showPlayer').checked && S.prog && S.prog.position && S.prog.stage && S.prog.stage.includes('map_' + reg.id + '.')) {
    const m = worldToMap(reg, S.prog.position);
    if (m) {
      const [sx, sy] = ts(...rotK(m[0], m[1], K));
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(sx, sy - 9); c.lineTo(sx + 7, sy + 7); c.lineTo(sx - 7, sy + 7); c.closePath(); c.fill();
      c.strokeStyle = '#000'; c.lineWidth = 1.5; c.stroke();
    }
  }
}
function drawRegionLabel(c, text, x, y, fs, vertical) {
  c.save();
  c.font = `${fs}px Notable, Impact, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = Math.max(2, fs * 0.22); c.strokeStyle = 'rgba(0,0,0,0.85)'; c.fillStyle = '#fff';
  const lines = vertical ? [...text] : [text], lh = fs * 0.8;
  lines.forEach((t, i) => { const yy = y + (i - (lines.length - 1) / 2) * lh; c.strokeText(t, x, yy); c.fillText(t, x, yy); });
  c.restore();
}
window.addEventListener('resize', draw);

/* ---------- pan / zoom / pick (mouse + touch) ---------- */
const ptrs = new Map();
let gesture = null;
function local(ev) { const r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function zoomAt(mx, my, f) {
  const [wx, wz] = toPlane(mx, my);
  S.view.scale = Math.min(60, Math.max(0.2, S.view.scale * f));
  S.view.cx = wx - (mx - cv.clientWidth / 2) / S.view.scale; S.view.cz = wz - (my - cv.clientHeight / 2) / S.view.scale;
  draw();
}
cv.addEventListener('pointerdown', ev => {
  cv.setPointerCapture(ev.pointerId);
  ptrs.set(ev.pointerId, local(ev));
  if (ptrs.size === 1) gesture = { start: local(ev), cx: S.view.cx, cz: S.view.cz, moved: false };
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), moved: true };
  }
  cv.classList.add('drag');
});
cv.addEventListener('pointermove', ev => {
  const p = local(ev);
  if (!ptrs.has(ev.pointerId)) { hover(ev, p); return; }
  ptrs.set(ev.pointerId, p);
  if (!gesture) return;
  if (ptrs.size >= 2 && gesture.pinch) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / gesture.pinch);
    gesture.pinch = d;
    return;
  }
  if (gesture.start) {
    const dx = p[0] - gesture.start[0], dy = p[1] - gesture.start[1];
    if (Math.abs(dx) + Math.abs(dy) > 4) gesture.moved = true;
    if (gesture.moved) { S.view.cx = gesture.cx - dx / S.view.scale; S.view.cz = gesture.cz - dy / S.view.scale; draw(); }
  }
});
function pointerEnd(ev) {
  if (!ptrs.has(ev.pointerId)) return;
  const p = local(ev);
  ptrs.delete(ev.pointerId);
  if (gesture && gesture.start && !gesture.moved && ev.type === 'pointerup') click(p, ev.pointerType === 'touch');
  if (ptrs.size === 1) { const [q] = [...ptrs.values()]; gesture = { start: q, cx: S.view.cx, cz: S.view.cz, moved: true }; }
  else if (!ptrs.size) { gesture = null; cv.classList.remove('drag'); }
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('pointerleave', () => { $('#tooltip').hidden = true; });
cv.addEventListener('wheel', ev => { ev.preventDefault(); const [mx, my] = local(ev); zoomAt(mx, my, Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });
function pick([mx, my], touch) {
  let best = null, bd = Math.max(touch ? 22 : 14, markerSize() / 2);
  for (const e of visibleItems()) {
    if (CATS[e.cat].small) continue;
    const [sx, sy] = toScreen(...P(e));
    const d = Math.hypot(sx - mx, sy - my) * (CATS[e.cat].lever ? 1.8 : 1);  // small levers lose ties to other markers
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function click(p, touch) {
  const hit = pick(p, touch);
  if (hit) return select(hit);
  const lab = (S._labelHits || []).find(b => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1);
  if (lab && regionById(lab.stage)) return setRegion(lab.stage);
  if (S.sel) { S.sel = null; renderItemList(); renderDetail(); draw(); }
}
function hover(ev, p) {
  const tt = $('#tooltip');
  if (ev.pointerType === 'touch') { tt.hidden = true; return; }
  const hit = pick(p);
  if (!hit) { tt.hidden = true; return; }
  const reg = S.region, cat = CATS[hit.cat];
  tt.innerHTML = `<b>${escapeHtml(itemTitle(reg, hit))}</b>${cat.guide || cat.numbered ? ' #' + numberOf(reg, hit) : ''}` +
    (hasSave() && (cat.guide || cat.pull) ? `<br><span class="${collected(reg, hit) ? 'ok' : 'bad'}">${collected(reg, hit) ? 'collected' : 'missing'}</span>` : '') +
    (hit.text ? '<br><i>“' + escapeHtml(hit.text.slice(0, 120)) + '”</i>' : '');
  tt.style.left = Math.min(p[0] + 14, cv.clientWidth - 240) + 'px'; tt.style.top = (p[1] + 14) + 'px'; tt.hidden = false;
}
function select(e, center) {
  S.sel = e;
  if (center) { [S.view.cx, S.view.cz] = P(e); S.view.scale = Math.max(S.view.scale, 4); }
  renderItemList(); renderDetail(); draw();
  if (center && matchMedia('(max-width: 800px)').matches) $('#mapWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (center === undefined && matchMedia('(max-width: 800px)').matches) $('#detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
$('#btnFit').onclick = () => fit();
$('#regionSel').onchange = ev => setRegion(ev.target.value);
for (const id of ['#hideCollected', '#showNumbers', '#showPlayer']) $(id).addEventListener('change', () => {
  store.set(id.slice(1), $(id).checked ? '1' : '0'); renderItemList(); draw();
});

/* ---------- sidebar & lists ---------- */
function regionStats(reg) {
  let got = 0, tot = 0;
  for (const e of reg.entities) if (CATS[e.cat].guide) { tot++; if (collected(reg, e)) got++; }
  return [got, tot];
}
function renderSidebar() {
  let G = 0, T = 0;
  const ul = $('#regionList'); ul.innerHTML = '';
  for (const reg of W.regions) {
    const [g, t] = regionStats(reg); G += g; T += t;
    ul.append(el('li', { class: reg === S.region ? 'sel' : '', onclick: () => setRegion(reg.id) },
      el('div', { class: 'rname' }, el('span', {}, reg.name), el('span', { class: 'muted' }, hasSave() ? `${g}/${t}` : String(t))),
      hasSave() ? el('div', { class: 'pbar' }, el('i', { style: `width:${t ? 100 * g / t : 0}%` })) : null));
  }
  const rs = $('#regionSel');
  rs.innerHTML = '';
  for (const reg of W.regions) {
    const [g, t] = regionStats(reg);
    rs.append(el('option', { value: reg.id }, reg.name + (hasSave() ? ` (${g}/${t})` : '')));
  }
  rs.value = S.region.id;
  $('#total').innerHTML = hasSave()
    ? `<b>${G} / ${T}</b> found <span class="muted">(${Math.round(100 * G / T)}%)</span><div class="muted small">upgrades, abilities, keys, doors, races. Not the in-game completion %.</div>`
    : `<b>${T}</b> items to find<div class="muted small">Load your save to see what you are missing.</div>`;
  const cf = $('#catFilters'); cf.innerHTML = '';
  for (const [k, c] of Object.entries(CATS)) {
    if (c.hidden) continue;
    const items = S.region.entities.filter(e => e.cat === k && onMap(e));
    if (!items.length) continue;
    const got = items.filter(e => collected(S.region, e)).length;
    cf.append(el('div', { class: 'chip' + (S.catOn.has(k) ? '' : ' off'), onclick: () => {
      S.catOn.has(k) ? S.catOn.delete(k) : S.catOn.add(k);
      store.set('cats', [...S.catOn].join(','));
      renderSidebar(); renderItemList(); draw();
    } },
      el('span', { class: 'sw', style: `background:${c.color}` }), c.label,
      el('span', { class: 'cnt' }, hasSave() && (c.guide || c.pull) ? `${got}/${items.length}` : String(items.length))));
  }
}
function renderItemList() {
  const box = $('#itemList'); box.innerHTML = '';
  const reg = S.region, hide = $('#hideCollected').checked;
  box.append(el('h2', { class: 'rtitle' }, reg.name));
  let any = false;
  for (const k of Object.keys(CATS)) {
    if (!S.catOn.has(k) || CATS[k].small || CATS[k].hidden) continue;
    const items = ordered(reg, k).filter(e => onMap(e) && !(hide && collected(reg, e)));
    if (!items.length) continue;
    any = true;
    box.append(el('h2', {}, CATS[k].plural || CATS[k].label + 's'));
    for (const e of items) {
      const tracked = hasSave() && (CATS[k].guide || CATS[k].pull);
      box.append(el('div', { class: 'item-row' + (S.sel === e ? ' sel' : '') + (collected(reg, e) ? ' collected' : ''), onclick: () => select(e, true) },
        el('span', { class: 'num', style: `background:${CATS[k].color}` }, (CATS[k].guide || CATS[k].numbered) ? String(numberOf(reg, e)) : CATS[k].glyph),
        el('span', { class: 'lbl' }, itemTitle(reg, e)),
        tracked ? (collected(reg, e) ? el('span', { class: 'got ok', title: 'collected in your save' }, '✓') : el('span', { class: 'got bad', title: 'missing' }, '✗')) : null));
    }
  }
  if (!any) box.append(el('p', { class: 'muted' }, hide && hasSave() ? 'Nothing left here for the shown categories.' : 'Nothing to show. Turn on a category on the left.'));
}
function renderDetail() {
  const d = $('#detail');
  const e = S.sel, reg = S.region;
  if (!e) { d.hidden = true; return; }
  d.hidden = false; d.innerHTML = '';
  const cat = CATS[e.cat];
  d.append(el('button', { class: 'close', title: 'Close', onclick: () => { S.sel = null; renderItemList(); renderDetail(); draw(); } }, '✕'));
  d.append(el('h3', {}, itemTitle(reg, e) + (cat.guide || cat.numbered ? '  #' + numberOf(reg, e) : '')));
  const dl = el('dl');
  const row = (k, v, cls) => { if (v != null && v !== '') dl.append(el('dt', {}, k), el('dd', cls ? { class: cls } : {}, String(v))); };
  row('Region', reg.name);
  if (cat.lever) row('Status', cat.pull ? (!hasSave() ? 'stays pulled (saved)' : collected(reg, e) ? 'pulled ✓' : 'not pulled') : 'resets (not saved)');
  else if (cat.guide) row('Status', !hasSave() ? 'load a save to check' : collected(reg, e) ? 'collected ✓' : 'missing', hasSave() ? (collected(reg, e) ? 'ok' : 'bad') : '');
  row('Height', e.pos[1] + ' m');
  row('Map marker', e.map_src === 'game-icon' ? "exact (the game's own map icon)" : e.map_src === 'manual' ? 'checked by hand' : 'approximate (placed in the right room)');
  if (e.cat === 'ability') {
    const ab = W.abilities[e.ability] || {};
    row('Type', e.mini ? 'Optional upgrade' : 'Main ability');
    if (ab.descriptions && ab.descriptions.length) row('In-game text', ab.descriptions.join(' / '));
  }
  if (e.required) row('Souls needed', e.required);
  if (e.cat === 'race') {
    row('Bronze', fmtTime(e.medals[0])); row('Silver', fmtTime(e.medals[1])); row('Gold', fmtTime(e.medals[2])); row('Developer', fmtTime(e.medals[3]));
    if (hasSave()) row('Your best', fmtTime(S.prog.items[reg.id] ? S.prog.items[reg.id][e.id] : -1));
  }
  d.append(dl);
  if (e.text) d.append(el('div', { class: 'quote' }, e.text));
  const lm = landmarks(reg, e);
  if (lm.length) d.append(el('div', { class: 'muted' }, 'Landmarks: ' + lm.join('; ')));
}

/* ---------- save file (Godot store_var) ---------- */
function parseSave(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let o = 0;
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const i32 = () => { const v = dv.getInt32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const f64 = () => { const v = dv.getFloat64(o, true); o += 8; return v; };
  const i64 = () => { const v = Number(dv.getBigInt64(o, true)); o += 8; return v; };
  const n = (fn, k) => { const a = []; for (let i = 0; i < k; i++) a.push(fn()); return a; };
  const str = () => { const len = u32(); const s = new TextDecoder().decode(u8.subarray(o, o + len)); o += (len + 3) & ~3; return s; };
  function v() {
    const h = u32(), t = h & 0xff, wide = !!(h & (1 << 16)), R = wide ? f64 : f32;
    switch (t) {
      case 0: return null;
      case 1: return !!u32();
      case 2: return wide ? i64() : i32();
      case 3: return wide ? f64() : f32();
      case 4: case 21: return str();
      case 5: return n(R, 2);
      case 6: return n(i32, 2);
      case 7: case 12: case 14: case 15: return n(R, 4);
      case 8: case 13: return n(i32, 4);
      case 9: return n(R, 3);
      case 10: return n(i32, 3);
      case 11: case 16: return n(R, 6);
      case 17: return n(R, 9);
      case 18: return n(R, 12);
      case 19: return n(R, 16);
      case 20: return n(f32, 4);
      case 27: { const c = u32() & 0x7fffffff, d = {}; for (let i = 0; i < c; i++) { const k = v(); d[Array.isArray(k) ? JSON.stringify(k) : String(k)] = v(); } return d; }
      case 28: { const c = u32() & 0x7fffffff; return n(v, c); }
      case 29: { const len = u32(); const a = Array.from(u8.subarray(o, o + len)); o += (len + 3) & ~3; return a; }
      case 30: return n(i32, u32());
      case 31: return n(i64, u32());
      case 32: return n(f32, u32());
      case 33: return n(f64, u32());
      case 34: return n(str, u32());
      case 35: return n(R, 2 * u32());
      case 36: return n(R, 3 * u32());
      default: throw new Error(`unsupported value type ${t} at byte ${o - 4}`);
    }
  }
  u32();  // length prefix
  const save = v();
  if (!save || typeof save !== 'object' || Array.isArray(save)) throw new Error('not an Explosiovania save');
  return save;
}
function computeProgress(save) {
  const items = {};
  for (const reg of W.regions) {
    const rp = items[reg.id] = {};
    for (const e of reg.entities) {
      if (e.save_key) rp[e.id] = !!save[e.save_key];
      else if (e.cat === 'golden_door') { const l = save['golden_eye_door/' + e.id]; rp[e.id] = Array.isArray(l) && l.length === 0; }
      else if (e.cat === 'race') { const b = save[reg.id + '/race_time']; rp[e.id] = typeof b === 'number' ? b : -1; }
    }
  }
  return { items, stage: save['player/stage'], position: save['player/position'], playtime: save.playtime_seconds || 0 };
}
const b64 = { enc: buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); },
  dec: s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; } };
function applySave(buf, name, remember) {
  const save = parseSave(buf);
  const prog = computeProgress(save);
  const before = S.prog;
  S.prog = prog; S.saveName = name;
  const h = prog.playtime / 3600;
  $('#saveInfo').textContent = `${name} · ${h >= 1 ? h.toFixed(1) + ' h' : Math.round(prog.playtime / 60) + ' min'} played`;
  $('#saveInfo').classList.remove('muted');
  $('#btnClear').hidden = false;
  if (remember) { store.set('save', b64.enc(buf)); store.set('saveName', name); }
  renderSidebar(); renderItemList(); renderDetail(); draw();
  return before;
}
async function loadFile(f) {
  if (!f) return;
  try {
    applySave(await f.arrayBuffer(), f.name, true);
    toast('Save loaded. Collected items are dimmed with a ✓; “Hide collected” shows only what is missing.');
  } catch (err) { toast('Could not read that file: ' + err.message, true); }
}
$('#btnLoad').onclick = () => $('#saveFile').click();
$('#saveFile').onchange = ev => { loadFile(ev.target.files[0]); ev.target.value = ''; };
$('#btnClear').onclick = () => {
  S.prog = null; store.set('save', null); store.set('saveName', null);
  $('#saveInfo').textContent = 'No save loaded'; $('#saveInfo').classList.add('muted'); $('#btnClear').hidden = true;
  renderSidebar(); renderItemList(); renderDetail(); draw();
};
$('#btnHelp').onclick = () => { $('#help').hidden = !$('#help').hidden; };
$('#btnHelpClose').onclick = () => { $('#help').hidden = true; };
let dragDepth = 0;
window.addEventListener('dragenter', ev => { if ([...ev.dataTransfer.types].includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
window.addEventListener('dragover', ev => ev.preventDefault());
window.addEventListener('drop', ev => { ev.preventDefault(); dragDepth = 0; $('#drop').hidden = true; loadFile(ev.dataTransfer.files[0]); });

function toast(msg, bad) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!bad); t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 4500);
}

/* ---------- boot ---------- */
(function boot() {
  for (const id of ['hideCollected', 'showNumbers', 'showPlayer']) { const v = store.get(id); if (v != null) $('#' + id).checked = v === '1'; }
  const cats = store.get('cats');
  if (cats != null) S.catOn = new Set(cats.split(',').filter(k => CATS[k]));
  const saved = store.get('save');
  if (saved) { try { applySave(b64.dec(saved), store.get('saveName') || 'save', false); } catch (_) { store.set('save', null); } }
  const qs = new URLSearchParams(location.search);
  let start = qs.get('region') || store.get('region') || W.regions[0].id;
  setRegion(regionById(start) ? start : W.regions[0].id);
  requestAnimationFrame(fit);
})();

// Katalog mebli – modele parametryczne o typowych (normatywnych) wymiarach.
// Wymiary w katalogu podane w cm; budowa w metrach. Front mebla skierowany w stronę +Z.
import * as THREE from 'three';
import { addBox, addCyl, addRounded, boxGeo } from './geometry.js';
import { getMaterial, HANDLE_FINISHES } from './materials.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const T = 0.018;   // grubość płyty
const GAP = 0.003; // szczelina między frontami

// ---------- uchwyty ----------
function handleMesh(type, finishKey, len) {
  const f = HANDLE_FINISHES[finishKey] ?? HANDLE_FINISHES.steel;
  const mat = getMaterial(f.mat, f.color);
  const g = new THREE.Group();
  const cylZ = (r, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z + h / 2);
    m.castShadow = true;
    g.add(m);
  };
  switch (type) {
    case 'bar':
    case 'barLong': {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len + 0.03, 16), mat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 0, 0.032);
      bar.castShadow = true;
      g.add(bar);
      cylZ(0.005, 0.032, -len / 2, 0, 0);
      cylZ(0.005, 0.032, len / 2, 0, 0);
      break;
    }
    case 'knob': {
      cylZ(0.006, 0.022, 0, 0, 0);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 12), mat);
      s.scale.z = 0.7;
      s.position.z = 0.032;
      s.castShadow = true;
      g.add(s);
      break;
    }
    case 'cup': {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.004), mat);
      plate.position.z = 0.002;
      g.add(plate);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.085, 20, 1, true, 0, Math.PI), mat);
      shell.material = mat.clone();
      shell.material.side = THREE.DoubleSide;
      shell.rotation.z = Math.PI / 2;
      shell.rotation.y = 0;
      shell.position.set(0, 0.008, 0.004);
      shell.rotation.x = Math.PI / 2;
      shell.castShadow = true;
      g.add(shell);
      break;
    }
    case 'ring': {
      cylZ(0.012, 0.01, 0, 0, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0035, 10, 32), mat);
      ring.position.set(0, -0.022, 0.016);
      ring.castShadow = true;
      g.add(ring);
      break;
    }
    case 'edge': {
      // profil krawędziowy: płaska półka nad frontem + zagięcie w dół
      const top = new THREE.Mesh(new THREE.BoxGeometry(len, 0.003, 0.03), mat);
      top.position.set(0, 0, 0.012);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.022, 0.003), mat);
      lip.position.set(0, -0.011, 0.027);
      g.add(top, lip);
      break;
    }
    case 'gola': {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(len, 0.028, 0.012), mat);
      ch.position.set(0, 0, -0.004);
      g.add(ch);
      break;
    }
    case 'leather': {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.003, 6, 24, Math.PI), mat);
      strap.scale.set(1, 1, 1);
      strap.rotation.x = Math.PI / 2;
      strap.rotation.z = Math.PI;
      strap.scale.y = 0.6;
      strap.position.set(0, 0, 0.002);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.025, 0.006), mat);
      pad.position.z = 0.003;
      g.add(strap, pad);
      strap.castShadow = true;
      break;
    }
    default:
      return null;
  }
  return g;
}

/**
 * Front (drzwi/szuflada) z uchwytem.
 * rect: {x, y, w, h} – x = środek, y = dół; z = płaszczyzna, na której leży tył frontu.
 * opt: { kind:'door'|'drawer', hinge:'left'|'right', place:'top'|'bottom'|'middle'|'center' }
 */
function addFront(g, item, m, rect, z, opt = {}) {
  const { x, y, w, h } = rect;
  const fw = w - GAP, fh = h - GAP;
  addBox(g, m('front'), fw, fh, T, x, y + GAP / 2, z + T / 2);
  const type = item.handle?.type ?? 'none';
  if (type === 'none') return;
  const finish = item.handle?.finish ?? 'steel';
  const zf = z + T;
  const kind = opt.kind ?? 'door';
  let vertical = kind === 'door' && !['edge', 'gola', 'cup'].includes(type);
  let len;
  if (type === 'barLong') len = vertical ? Math.min(fh * 0.6, 0.6) : Math.min(fw * 0.75, 0.6);
  else if (type === 'bar') len = vertical ? 0.16 : Math.min(fw * 0.5, fw > 0.5 ? 0.192 : 0.128);
  else if (type === 'edge') len = Math.min(fw * 0.5, 0.3);
  else if (type === 'gola') len = fw;
  else len = 0.1;
  const hm = handleMesh(type, finish, len);
  if (!hm) return;
  let hx = x, hy;
  const top = y + h, inset = 0.05;
  if (kind === 'drawer') {
    hy = type === 'edge' || type === 'gola' ? top - GAP / 2 : opt.place === 'center' ? y + h / 2 : top - Math.min(0.06, h / 3);
  } else {
    const side = opt.hinge === 'right' ? -1 : 1; // uchwyt po przeciwnej stronie zawiasów
    if (type === 'edge' || type === 'gola') {
      hy = opt.place === 'bottom' ? y + GAP / 2 : top - GAP / 2;
      if (type === 'edge') hx = x + side * (fw / 2 - len / 2 - 0.03);
      if (opt.place === 'bottom') hm.rotation.x = Math.PI; // profil od spodu (szafki górne)
    } else {
      hx = x + side * (fw / 2 - inset);
      const extent = vertical ? len / 2 : 0.02;
      if (opt.place === 'bottom') hy = y + 0.06 + extent;
      else if (opt.place === 'middle') hy = Math.min(Math.max(1.05 - (item.elev ?? 0) / 100, y + 0.1 + extent), top - 0.1 - extent);
      else hy = top - 0.06 - extent;
    }
  }
  if (vertical) hm.rotation.z = Math.PI / 2;
  hm.position.set(hx, hy, zf);
  if (type === 'gola') hm.position.z = zf - T;
  g.add(hm);
}

function doorsRow(g, item, m, x0, y, w, h, z, count, place) {
  const dw = w / count;
  for (let i = 0; i < count; i++) {
    const hinge = count === 1 ? (item.hinge ?? 'left') : i % 2 === 0 ? 'left' : 'right';
    addFront(g, item, m, { x: x0 - w / 2 + dw * (i + 0.5), y, w: dw, h }, z, { kind: 'door', hinge, place });
  }
}

function drawersCol(g, item, m, x, y, w, h, z, count) {
  const dh = h / count;
  for (let i = 0; i < count; i++) addFront(g, item, m, { x, y: y + dh * i, w, h: dh }, z, { kind: 'drawer' });
}

/** Korpus szafki (bez frontu) – boki, góra, dół, plecy. */
function carcass(g, mat, w, h, d, y = 0, shelves = 0) {
  addBox(g, mat, T, h, d, -w / 2 + T / 2, y, 0);
  addBox(g, mat, T, h, d, w / 2 - T / 2, y, 0);
  addBox(g, mat, w - 2 * T, T, d, 0, y, 0);
  addBox(g, mat, w - 2 * T, T, d, 0, y + h - T, 0);
  addBox(g, mat, w - 2 * T, h - 2 * T, 0.004, 0, y + T, -d / 2 + 0.002);
  for (let i = 1; i <= shelves; i++) addBox(g, mat, w - 2 * T, T, d - 0.02, 0, y + (h * i) / (shelves + 1), 0.01);
}

const legs4 = (g, mat, w, d, h, r = 0.02, inset = 0.05, x0 = 0, z0 = 0, taper = 1) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addCyl(g, mat, r, h, x0 + sx * (w / 2 - inset), 0, z0 + sz * (d / 2 - inset), 14, r * taper);
};

// ---------- definicje katalogu ----------
const S = {
  body: (mat = 'matt', color = '#f2f0eb') => ({ label: 'Korpus', mat, color }),
  front: (mat = 'matt', color = '#f2f0eb') => ({ label: 'Fronty', mat, color }),
  top: (mat = 'oak', color = '#ffffff') => ({ label: 'Blat', mat, color }),
  legs: (mat = 'blackMetal', color = '#222222') => ({ label: 'Nogi', mat, color }),
  fabric: (mat = 'fabric', color = '#8a9199') => ({ label: 'Tapicerka', mat, color }),
};

const kitchenBase = (item, m) => {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const plinth = 0.1, topT = 0.038;
  const ch = h - plinth - topT, cd = d - 0.02 - T;
  addBox(g, m('body'), w - 0.01, plinth, 0.02, 0, 0, d / 2 - 0.07); // cokół
  const cz = -d / 2 + cd / 2;
  carcass(g, m('body'), w, ch, cd, plinth, 1);
  addBox(g, m('top'), w, topT, d, 0, h - topT, 0);
  return { g, ch, cd, plinth, z: cz + cd / 2 };
};


/** Schody proste wchodzące w stronę -Z (pierwszy stopień z przodu, przy +Z). */
function buildStairs(item, m, open) {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const n = item.p?.steps ?? 15;
  const rise = h / n, run = d / n, tt = 0.04;
  for (let i = 0; i < n; i++) {
    const top = rise * (i + 1);
    const zc = d / 2 - run * (i + 0.5);
    if (open) {
      addBox(g, m('treads'), w, tt, run + 0.02, 0, top - tt, zc);
    } else {
      addBox(g, m('body'), w, top - tt, run, 0, 0, zc);
      addBox(g, m('treads'), w + 0.01, tt, run + 0.025, 0, top - tt, zc + 0.0125);
    }
  }
  const len = Math.hypot(d, h), ang = Math.atan2(h, d);
  if (open) {
    // dwie belki policzkowe
    for (const s of [-1, 1]) {
      const beam = addBox(g, m('body'), 0.05, 0.22, len, s * (w / 2 + 0.025), 0, 0);
      beam.rotation.x = ang;
      beam.position.set(s * (w / 2 + 0.025), h / 2 - 0.11 + 0.02, 0);
    }
  }
  const rails = item.p?.rails ?? 1;
  for (let r = 0; r < rails; r++) {
    const s = r === 0 ? 1 : -1;
    const x = s * (w / 2 + (open ? 0.07 : 0.03));
    const hand = addBox(g, m('rail'), 0.045, 0.045, len, x, 0, 0);
    hand.rotation.x = ang;
    hand.position.set(x, h / 2 + 0.9, 0);
    const posts = Math.max(2, Math.round(n / 3));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const z = d / 2 - t * d, y = t * h;
      addBox(g, m('rail'), 0.025, 0.9, 0.025, x, y, z);
    }
  }
  return g;
}

/** Dodaje do kształtu otwory (wielokąty w cm, układ lokalny elementu). */
function addShapeHoles(shape, holes) {
  for (const h of holes ?? []) if (h.length >= 3) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x / 100, -z / 100))));
}

/** Strop z kształtu: cienka warstwa podłogi na wierzchu + korpus pod spodem. */
function addSlabFromShape(g, shape, h, topMat, bodyMat) {
  const top = new THREE.Mesh(new THREE.ShapeGeometry(shape), topMat);
  top.geometry.rotateX(-Math.PI / 2);
  top.position.y = 0.001;
  top.receiveShadow = true;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: h - 0.001, bevelEnabled: false }), bodyMat);
  body.rotation.x = -Math.PI / 2;
  body.position.y = -h;
  body.castShadow = body.receiveShadow = true;
  g.add(top, body);
}

export function polygonArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-6) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  return [cx / (3 * a), cy / (3 * a)];
}

export function pointInPolygon(x, y, p) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const CATALOG = {
  // ===== KUCHNIA =====
  kBase: {
    label: 'Szafka dolna z drzwiami', cat: 'Kuchnia', icon: '▭', dims: { w: 60, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top() }, handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      const n = item.m.w > 0.5 ? 2 : 1;
      doorsRow(g, item, m, 0, plinth, item.m.w, ch, z, n, 'top');
      return g;
    },
  },
  kDrawers: {
    label: 'Szafka dolna z szufladami', cat: 'Kuchnia', icon: '☰', dims: { w: 60, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top() }, handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    params: { drawers: { label: 'Liczba szuflad', min: 1, max: 6, def: 3 } },
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      drawersCol(g, item, m, 0, plinth, item.m.w, ch, z, item.p?.drawers ?? 3);
      return g;
    },
  },
  kSink: {
    label: 'Szafka zlewowa', cat: 'Kuchnia', icon: '⌴', dims: { w: 80, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top(), sink: { label: 'Zlew', mat: 'steel', color: '#c8cacc' } },
    handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      const { w, d, h } = item.m;
      doorsRow(g, item, m, 0, plinth, w, ch, z, w > 0.5 ? 2 : 1, 'top');
      const sw = Math.min(w - 0.12, 0.6), sd = d - 0.16;
      addBox(g, m('sink'), sw, 0.004, sd, 0, h + 0.0005, 0);
      const basin = addBox(g, getMaterial('blackMetal', '#333'), sw - 0.06, 0.002, sd - 0.06, 0, h + 0.0045, 0);
      basin.castShadow = false;
      // bateria
      const chrome = getMaterial('chrome', '#fff');
      addCyl(g, chrome, 0.018, 0.05, 0, h, -d / 2 + 0.06);
      const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 10, 24, Math.PI), chrome);
      pipe.rotation.y = Math.PI / 2;
      pipe.position.set(0, h + 0.05, -d / 2 + 0.16);
      pipe.scale.set(1, 1.4, 1);
      g.add(pipe);
      return g;
    },
  },
  kOven: {
    label: 'Szafka z piekarnikiem i płytą', cat: 'Kuchnia', icon: '◫', dims: { w: 60, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top(), appliance: { label: 'AGD', mat: 'steel', color: '#c8cacc' } },
    handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      const { w, d, h } = item.m;
      const ovenH = 0.6;
      drawersCol(g, item, m, 0, plinth, w, ch - ovenH, z, 1);
      const oy = plinth + ch - ovenH;
      addBox(g, m('appliance'), w - GAP, ovenH - GAP, T, 0, oy + GAP / 2, z + T / 2);
      addBox(g, getMaterial('glass', '#111'), w - 0.08, ovenH - 0.2, 0.004, 0, oy + 0.08, z + T + 0.002).material = getMaterial('gloss', '#111111');
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, w - 0.12, 14), getMaterial('steel', '#ddd'));
      hb.rotation.z = Math.PI / 2;
      hb.position.set(0, oy + ovenH - 0.06, z + T + 0.03);
      g.add(hb);
      // płyta indukcyjna
      addBox(g, getMaterial('gloss', '#0d0d0d'), Math.min(w - 0.04, 0.58), 0.006, Math.min(d - 0.08, 0.51), 0, h, 0);
      const ringMat = getMaterial('matt', '#555');
      for (const [px, pz, r] of [[-0.14, -0.1, 0.09], [0.14, -0.1, 0.07], [-0.14, 0.12, 0.07], [0.14, 0.12, 0.09]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.002, 6, 40), ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(px * (w / 0.6), h + 0.0065, pz);
        g.add(ring);
      }
      return g;
    },
  },
  kWall: {
    label: 'Szafka górna', cat: 'Kuchnia', icon: '▔', dims: { w: 60, d: 35, h: 72 }, elev: 145,
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0, 1);
      g.children.forEach((c) => (c.position.z -= T / 2));
      doorsRow(g, item, m, 0, 0, w, h, cd / 2 - T / 2, w > 0.5 ? 2 : 1, 'bottom');
      return g;
    },
  },
  kTall: {
    label: 'Słupek kuchenny (wysoki)', cat: 'Kuchnia', icon: '▯', dims: { w: 60, d: 60, h: 215 },
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'bar', finish: 'steel' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const plinth = 0.1, cd = d - T;
      addBox(g, m('body'), w - 0.01, plinth, 0.02, 0, 0, d / 2 - 0.07);
      carcass(g, m('body'), w, h - plinth, cd, plinth, 4);
      g.children.forEach((c) => (c.position.z -= T / 2));
      const z = cd / 2 - T / 2;
      const lower = (h - plinth) * 0.62;
      doorsRow(g, item, m, 0, plinth, w, lower, z, 1, 'top');
      doorsRow(g, item, m, 0, plinth + lower, w, h - plinth - lower, z, 1, 'bottom');
      return g;
    },
  },
  fridge: {
    label: 'Lodówka wolnostojąca', cat: 'Kuchnia', icon: '❄', dims: { w: 60, d: 65, h: 186 },
    slots: { body: { label: 'Obudowa', mat: 'steel', color: '#c8cacc' } }, handles: true, handleDefault: { type: 'barLong', finish: 'steel' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addRounded(g, m('body'), w, h - 0.02, d - 0.04, 0.02, 0, 0.02, -0.02);
      const it = { ...item, slotsOverride: true };
      const fm = (s) => (s === 'front' ? m('body') : m(s));
      const lower = h * 0.62;
      addFront(g, it, fm, { x: 0, y: 0.02, w, h: lower }, d / 2 - 0.04, { kind: 'door', hinge: 'left', place: 'top' });
      addFront(g, it, fm, { x: 0, y: 0.02 + lower, w, h: h - 0.02 - lower }, d / 2 - 0.04, { kind: 'door', hinge: 'left', place: 'bottom' });
      return g;
    },
  },

  // ===== SALON =====
  sofa: {
    label: 'Sofa 3-osobowa', cat: 'Salon', icon: '🛋', dims: { w: 210, d: 92, h: 84 },
    slots: { fabric: S.fabric(), legs: S.legs('oak', '#ffffff') },
    params: { seats: { label: 'Liczba siedzisk', min: 1, max: 4, def: 3 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.1, armW = 0.18, seatH = 0.44;
      legs4(g, m('legs'), w, d, legH, 0.02, 0.06, 0, 0, 0.7);
      addRounded(g, m('fabric'), w, 0.2, d, 0.03, 0, legH, 0);
      addRounded(g, m('fabric'), w, h - legH - 0.12, 0.2, 0.05, 0, legH + 0.12, -d / 2 + 0.1);
      for (const s of [-1, 1]) addRounded(g, m('fabric'), armW, 0.62 - legH, d, 0.05, s * (w / 2 - armW / 2), legH, 0);
      const n = item.p?.seats ?? 3, sw = (w - 2 * armW) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + armW + sw * (i + 0.5);
        addRounded(g, m('fabric'), sw - 0.01, seatH - legH - 0.2, d - 0.26, 0.05, x, legH + 0.2, 0.06);
        addRounded(g, m('fabric'), sw - 0.03, 0.42, 0.16, 0.07, x, seatH, -d / 2 + 0.28);
      }
      return g;
    },
  },
  armchair: {
    label: 'Fotel', cat: 'Salon', icon: '◖', dims: { w: 82, d: 85, h: 88 },
    slots: { fabric: S.fabric('velvet', '#2f5d50'), legs: S.legs('oak', '#ffffff') },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.14, armW = 0.14;
      legs4(g, m('legs'), w, d, legH, 0.018, 0.07, 0, 0, 0.6);
      addRounded(g, m('fabric'), w, 0.16, d, 0.03, 0, legH, 0);
      addRounded(g, m('fabric'), w, h - legH - 0.1, 0.16, 0.05, 0, legH + 0.1, -d / 2 + 0.08);
      for (const s of [-1, 1]) addRounded(g, m('fabric'), armW, 0.5, d, 0.05, s * (w / 2 - armW / 2), legH + 0.1, 0);
      addRounded(g, m('fabric'), w - 2 * armW, 0.14, d - 0.2, 0.05, 0, legH + 0.16, 0.05);
      return g;
    },
  },
  coffeeTable: {
    label: 'Stolik kawowy', cat: 'Salon', icon: '▬', dims: { w: 110, d: 60, h: 42 },
    slots: { top: S.top('oak'), legs: S.legs() },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      legs4(g, m('legs'), w, d, h - 0.03, 0.015, 0.06);
      addBox(g, m('top'), w - 0.1, 0.018, d - 0.1, 0, 0.12, 0);
      addBox(g, m('top'), w, 0.03, d, 0, h - 0.03, 0);
      return g;
    },
  },
  tvStand: {
    label: 'Szafka RTV', cat: 'Salon', icon: '▭', dims: { w: 180, d: 42, h: 50 },
    slots: { body: S.body('walnut', '#ffffff'), front: S.front('matt', '#2b2b2b'), legs: S.legs() }, handles: true, handleDefault: { type: 'none', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.1, cd = d - T;
      legs4(g, m('legs'), w, d, legH, 0.012, 0.06);
      carcass(g, m('body'), w, h - legH, cd, legH);
      g.children.forEach((c) => c.position.z -= T / 2);
      const n = Math.max(2, Math.round(w / 0.6));
      const fw = (w - 2 * T) / n;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + T + fw * (i + 0.5);
        if (i === Math.floor(n / 2) && n % 2 === 1) drawersCol(g, item, m, x, legH + T, fw, h - legH - 2 * T, cd / 2 - T / 2, 2);
        else addFront(g, item, m, { x, y: legH + T, w: fw, h: h - legH - 2 * T }, cd / 2 - T / 2, { kind: 'drawer', place: 'center' });
      }
      return g;
    },
  },
  bookcase: {
    label: 'Regał na książki', cat: 'Salon', icon: '▥', dims: { w: 80, d: 30, h: 200 },
    slots: { body: S.body('oak', '#ffffff') },
    params: { shelves: { label: 'Liczba półek', min: 1, max: 10, def: 4 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      carcass(g, m('body'), w, h, d, 0, item.p?.shelves ?? 4);
      // przykładowe książki
      const n = (item.p?.shelves ?? 4) + 1, sh = h / n;
      const r = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
      const cols = ['#8c3b2f', '#2f4f6b', '#d8c8a0', '#3c5a3a', '#6b6b6b', '#b07a3c'];
      for (let s = 0; s < n; s += 2) {
        let x = -w / 2 + T + 0.01;
        for (let i = 0; x < w / 4; i++) {
          const bw = 0.02 + r(s * 31 + i) * 0.03, bh = Math.min(sh - T - 0.03, 0.18 + r(i + s) * 0.1);
          addBox(g, getMaterial('matt', cols[(i + s) % cols.length]), bw, bh, d * 0.7, x + bw / 2, s * sh + T, 0);
          x += bw + 0.002;
        }
      }
      return g;
    },
  },
  sideboard: {
    label: 'Komoda / kredens', cat: 'Salon', icon: '▤', dims: { w: 150, d: 45, h: 85 },
    slots: { body: S.body('oak', '#ffffff'), front: S.front('matt', '#e8e4dc'), legs: S.legs() }, handles: true, handleDefault: { type: 'knob', finish: 'brass' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.15, cd = d - T;
      legs4(g, m('legs'), w, d, legH, 0.014, 0.05, 0, 0, 0.6);
      carcass(g, m('body'), w, h - legH, cd, legH, 1);
      g.children.forEach((c) => c.position.z -= T / 2);
      const n = Math.max(2, Math.round(w / 0.5));
      doorsRow(g, item, m, 0, legH + T, w - 2 * T, h - legH - 2 * T, cd / 2 - T / 2, n, 'top');
      return g;
    },
  },
  rug: {
    label: 'Dywan', cat: 'Salon', icon: '▦', dims: { w: 200, d: 300, h: 1 },
    slots: { fabric: { label: 'Dywan', mat: 'carpet', color: '#b7a991' } },
    build(item, m) {
      const g = new THREE.Group();
      const r = addBox(g, m('fabric'), item.m.w, Math.max(item.m.h, 0.005), item.m.d, 0, 0.001, 0);
      r.castShadow = false;
      return g;
    },
  },
  floorLamp: {
    label: 'Lampa podłogowa', cat: 'Salon', icon: '💡', dims: { w: 40, d: 40, h: 160 },
    slots: { body: { label: 'Stelaż', mat: 'blackMetal', color: '#222222' }, shade: { label: 'Abażur', mat: 'fabric', color: '#efe7d6' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      addCyl(g, m('body'), w * 0.4, 0.025, 0, 0, 0, 32);
      addCyl(g, m('body'), 0.01, h - 0.3, 0, 0.025, 0);
      const shade = addCyl(g, m('shade'), w / 2, 0.3, 0, h - 0.32, 0, 32, w * 0.35);
      shade.material = shade.material.clone();
      shade.material.side = THREE.DoubleSide;
      shade.material.emissive = new THREE.Color('#ffd9a0');
      shade.material.emissiveIntensity = 0.35;
      shade.castShadow = false;
      return g;
    },
  },
  plant: {
    label: 'Roślina w donicy', cat: 'Salon', icon: '🌿', dims: { w: 45, d: 45, h: 120 },
    slots: { body: { label: 'Donica', mat: 'ceramic', color: '#e8e2d8' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      addCyl(g, m('body'), w * 0.35, Math.min(0.35, h * 0.3), 0, 0, 0, 24, w * 0.45);
      const leaf = getMaterial('matt', '#3f6b3a');
      const ph = Math.min(0.35, h * 0.3);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = 0.06 + (i % 3) * 0.05;
        const s = new THREE.Mesh(new THREE.SphereGeometry(w * 0.28, 12, 8), leaf);
        s.scale.set(1, 1.4, 1);
        s.position.set(Math.cos(a) * rr, ph + (h - ph) * (0.35 + (i / 9) * 0.5), Math.sin(a) * rr);
        s.castShadow = true;
        g.add(s);
      }
      addCyl(g, getMaterial('matt', '#5a4632'), 0.012, (h - ph) * 0.6, 0, ph, 0);
      return g;
    },
  },

  // ===== SYPIALNIA =====
  bed: {
    label: 'Łóżko', cat: 'Sypialnia', icon: '🛏', dims: { w: 160, d: 200, h: 100 },
    slots: { body: { label: 'Rama', mat: 'oak', color: '#ffffff' }, fabric: { label: 'Zagłówek', mat: 'fabric', color: '#9aa3a8' }, bedding: { label: 'Pościel', mat: 'fabric', color: '#f1eee8' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const frameH = 0.3, mat = 0.2, fd = d + 0.06;
      legs4(g, m('body'), w, fd, 0.1, 0.025, 0.06, 0, 0.03);
      addBox(g, m('body'), w + 0.04, frameH - 0.1, fd, 0, 0.1, 0.03);
      addRounded(g, m('bedding'), w - 0.02, mat, d - 0.02, 0.04, 0, frameH, 0.04);
      addRounded(g, m('bedding'), w - 0.01, 0.06, d * 0.62, 0.03, 0, frameH + mat - 0.02, 0.04 + d * 0.19);
      const pw = w > 1.2 ? w / 2 - 0.08 : w - 0.16;
      for (const s of w > 1.2 ? [-1, 1] : [0]) addRounded(g, getMaterial('fabric', '#ffffff'), pw, 0.12, 0.38, 0.05, s * (w / 4), frameH + mat, -d / 2 + 0.3);
      addRounded(g, m('fabric'), w + 0.06, h - 0.1, 0.1, 0.03, 0, 0.1, -d / 2 - 0.02);
      return g;
    },
  },
  wardrobe: {
    label: 'Szafa', cat: 'Sypialnia', icon: '▯', dims: { w: 150, d: 60, h: 220 },
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'barLong', finish: 'black' },
    params: { doors: { label: 'Liczba drzwi', min: 1, max: 6, def: 3 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const plinth = 0.06, cd = d - T;
      addBox(g, m('body'), w - 0.02, plinth, cd - 0.04, 0, 0, 0);
      carcass(g, m('body'), w, h - plinth, cd, plinth, 0);
      g.children.forEach((c) => (c.position.z -= T / 2));
      doorsRow(g, item, m, 0, plinth, w, h - plinth, cd / 2 - T / 2, item.p?.doors ?? 3, 'middle');
      return g;
    },
  },
  dresser: {
    label: 'Komoda z szufladami', cat: 'Sypialnia', icon: '☰', dims: { w: 80, d: 48, h: 85 },
    slots: { body: S.body('oak', '#ffffff'), front: S.front('oak', '#ffffff'), legs: S.legs('oak', '#ffffff') }, handles: true, handleDefault: { type: 'cup', finish: 'brass' },
    params: { drawers: { label: 'Liczba szuflad', min: 1, max: 8, def: 4 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.08, cd = d - T;
      legs4(g, m('legs'), w, d, legH, 0.015, 0.04);
      carcass(g, m('body'), w, h - legH, cd, legH);
      g.children.forEach((c) => c.position.z -= T / 2);
      drawersCol(g, item, m, 0, legH + T, w - 2 * T, h - legH - 2 * T, cd / 2 - T / 2, item.p?.drawers ?? 4);
      return g;
    },
  },
  nightstand: {
    label: 'Szafka nocna', cat: 'Sypialnia', icon: '▫', dims: { w: 45, d: 40, h: 50 },
    slots: { body: S.body('oak', '#ffffff'), front: S.front('matt', '#f2f0eb'), legs: S.legs('oak', '#ffffff') }, handles: true, handleDefault: { type: 'knob', finish: 'brass' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.15, cd = d - T;
      legs4(g, m('legs'), w, d, legH, 0.012, 0.04, 0, 0, 0.6);
      carcass(g, m('body'), w, h - legH, cd, legH, 1);
      g.children.forEach((c) => c.position.z -= T / 2);
      const ih = h - legH - 2 * T;
      addFront(g, item, m, { x: 0, y: legH + T + ih / 2, w: w - 2 * T, h: ih / 2 }, cd / 2 - T / 2, { kind: 'drawer', place: 'center' });
      return g;
    },
  },

  // ===== JADALNIA / BIURO =====
  table: {
    label: 'Stół', cat: 'Jadalnia i biuro', icon: '▭', dims: { w: 160, d: 90, h: 75 },
    slots: { top: S.top('oak'), legs: S.legs() },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const tt = 0.035;
      legs4(g, m('legs'), w, d, h - tt, 0.025, 0.08);
      addBox(g, m('legs'), w - 0.2, 0.06, 0.02, 0, h - tt - 0.06, d / 2 - 0.08);
      addBox(g, m('legs'), w - 0.2, 0.06, 0.02, 0, h - tt - 0.06, -d / 2 + 0.08);
      addBox(g, m('top'), w, tt, d, 0, h - tt, 0);
      return g;
    },
  },
  roundTable: {
    label: 'Stół okrągły', cat: 'Jadalnia i biuro', icon: '●', dims: { w: 110, d: 110, h: 75 },
    slots: { top: S.top('walnut'), legs: S.legs() },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addCyl(g, m('legs'), 0.25, 0.03, 0, 0, 0, 32);
      addCyl(g, m('legs'), 0.04, h - 0.06, 0, 0.03, 0);
      const t = addCyl(g, m('top'), w / 2, 0.03, 0, h - 0.03, 0, 48);
      t.scale.z = d / w;
      return g;
    },
  },
  chair: {
    label: 'Krzesło', cat: 'Jadalnia i biuro', icon: '⑁', dims: { w: 45, d: 52, h: 85 },
    slots: { body: { label: 'Siedzisko', mat: 'fabric', color: '#b9a48a' }, legs: S.legs('oak', '#ffffff') },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const sh = 0.46;
      legs4(g, m('legs'), w, d, sh - 0.04, 0.015, 0.03);
      addRounded(g, m('body'), w, 0.05, d, 0.015, 0, sh - 0.05, 0);
      for (const s of [-1, 1]) addBox(g, m('legs'), 0.025, h - sh, 0.025, s * (w / 2 - 0.03), sh, -d / 2 + 0.03);
      addRounded(g, m('body'), w, 0.22, 0.03, 0.01, 0, h - 0.25, -d / 2 + 0.03);
      return g;
    },
  },
  desk: {
    label: 'Biurko z kontenerem', cat: 'Jadalnia i biuro', icon: '▭', dims: { w: 140, d: 70, h: 75 },
    slots: { top: S.top('oak'), body: S.body('matt', '#ffffff'), front: S.front('matt', '#ffffff'), legs: S.legs() }, handles: true, handleDefault: { type: 'edge', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const tt = 0.025, pw = 0.42, ph = h - tt - 0.01, pd = d - 0.1;
      for (const sz of [-1, 1]) addBox(g, m('legs'), 0.04, h - tt, 0.04, -w / 2 + 0.05, 0, sz * (d / 2 - 0.05));
      addBox(g, m('legs'), 0.04, 0.04, d - 0.1, -w / 2 + 0.05, 0, 0);
      const px = w / 2 - pw / 2 - 0.01;
      const pg = new THREE.Group();
      carcass(pg, m('body'), pw, ph, pd - T, 0);
      pg.children.forEach((c) => c.position.z -= T / 2);
      drawersCol(pg, item, m, 0, T, pw - 2 * T, ph - 2 * T, (pd - T) / 2 - T / 2, 3);
      pg.position.set(px, 0, 0);
      g.add(pg);
      addBox(g, m('top'), w, tt, d, 0, h - tt, 0);
      return g;
    },
  },
  officeChair: {
    label: 'Krzesło biurowe', cat: 'Jadalnia i biuro', icon: '⑂', dims: { w: 62, d: 62, h: 110 },
    slots: { body: { label: 'Tapicerka', mat: 'fabric', color: '#3a3f45' }, legs: { label: 'Podstawa', mat: 'blackMetal', color: '#222222' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const arm = addBox(g, m('legs'), 0.03, 0.03, w / 2 - 0.03, Math.cos(a) * (w / 4 - 0.01), 0.04, Math.sin(a) * (w / 4 - 0.01));
        arm.rotation.y = -a + Math.PI / 2;
        const wh = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), m('legs'));
        wh.position.set(Math.cos(a) * (w / 2 - 0.04), 0.025, Math.sin(a) * (w / 2 - 0.04));
        g.add(wh);
      }
      addCyl(g, getMaterial('chrome', '#fff'), 0.025, 0.4, 0, 0.05, 0);
      addRounded(g, m('body'), w - 0.1, 0.08, d - 0.12, 0.03, 0, 0.45, 0.02);
      addBox(g, m('legs'), 0.04, 0.3, 0.03, 0, 0.5, -d / 2 + 0.08);
      addRounded(g, m('body'), w - 0.14, h - 0.6, 0.06, 0.025, 0, 0.58, -d / 2 + 0.06);
      return g;
    },
  },

  // ===== ŁAZIENKA =====
  vanity: {
    label: 'Szafka pod umywalkę', cat: 'Łazienka', icon: '◡', dims: { w: 80, d: 46, h: 55 }, elev: 30,
    slots: { body: S.body('oak', '#ffffff'), front: S.front('oak', '#ffffff'), top: { label: 'Umywalka', mat: 'ceramic', color: '#fafafa' } },
    handles: true, handleDefault: { type: 'gola', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T, ch = h - 0.04;
      carcass(g, m('body'), w, ch, cd, 0);
      g.children.forEach((c) => c.position.z -= T / 2);
      drawersCol(g, item, m, 0, 0, w, ch, cd / 2 - T / 2, 2);
      addRounded(g, m('top'), w, 0.04, d, 0.01, 0, ch, 0);
      const basin = addRounded(g, getMaterial('ceramic', '#e8e8e8'), w - 0.2, 0.01, d - 0.16, 0.004, 0, h - 0.008, 0.02);
      basin.castShadow = false;
      const chrome = getMaterial('chrome', '#fff');
      addCyl(g, chrome, 0.016, 0.16, 0, h, -d / 2 + 0.06);
      addBox(g, chrome, 0.02, 0.02, 0.12, 0, h + 0.14, -d / 2 + 0.11);
      return g;
    },
  },
  bathtub: {
    label: 'Wanna', cat: 'Łazienka', icon: '◯', dims: { w: 170, d: 75, h: 58 },
    slots: { body: { label: 'Wanna', mat: 'ceramic', color: '#fafafa' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addRounded(g, m('body'), w, h, d, 0.04, 0, 0, 0);
      const water = addRounded(g, getMaterial('glass', '#bfe3ea'), w - 0.14, 0.01, d - 0.14, 0.004, 0, h - 0.004, 0);
      water.castShadow = false;
      return g;
    },
  },
  shower: {
    label: 'Kabina prysznicowa', cat: 'Łazienka', icon: '▢', dims: { w: 90, d: 90, h: 200 },
    slots: { body: { label: 'Profile', mat: 'chrome', color: '#ffffff' }, tray: { label: 'Brodzik', mat: 'ceramic', color: '#fafafa' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('tray'), w, 0.04, d, 0, 0, 0);
      const glass = getMaterial('glass', '#dfeef0');
      addBox(g, glass, w, h - 0.04, 0.008, 0, 0.04, d / 2 - 0.004);
      addBox(g, glass, 0.008, h - 0.04, d, -w / 2 + 0.004, 0.04, 0);
      addBox(g, m('body'), w, 0.02, 0.02, 0, h - 0.02, d / 2 - 0.004);
      addBox(g, m('body'), 0.02, 0.02, d, -w / 2 + 0.004, h - 0.02, 0);
      addCyl(g, m('body'), 0.1, 0.01, w / 4, h - 0.1, -d / 4, 24);
      return g;
    },
  },
  toilet: {
    label: 'WC podwieszane', cat: 'Łazienka', icon: '◒', dims: { w: 36, d: 54, h: 40 },
    slots: { body: { label: 'Ceramika', mat: 'ceramic', color: '#fafafa' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const bowl = addRounded(g, m('body'), w, 0.3, d, 0.08, 0, h - 0.34, 0);
      bowl.scale.x = 1;
      addRounded(g, m('body'), w, 0.03, d, 0.015, 0, h - 0.03, 0);
      addBox(g, m('body'), w + 0.1, 0.12, 0.05, 0, h + 0.55, -d / 2 + 0.025).material = getMaterial('chrome', '#fff');
      addBox(g, getMaterial('matt', '#f5f5f5'), w + 0.2, h + 0.7, 0.12, 0, 0, -d / 2 - 0.06);
      return g;
    },
  },

  // ===== ANTRESOLA I SCHODY =====
  slab: {
    label: 'Podłoga antresoli (strop)', cat: 'Antresola i schody', icon: '▀', dims: { w: 300, d: 200, h: 20 },
    slots: { top: { label: 'Podłoga', mat: 'floorOak', color: '#ffffff' }, body: { label: 'Spód / czoło', mat: 'paint', color: '#f4f2ee' } },
    build(item, m) {
      // płyta budowana w dół od poziomu podłogi – jej wierzch = poziom antresoli
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      if (!item.holes?.length) {
        addBox(g, m('body'), w, h - 0.015, d, 0, -h, 0);
        addBox(g, m('top'), w, 0.015, d, 0, -0.015, 0);
        return g;
      }
      // z otworami (np. na schody lub antresolę otwartą na salon)
      const shape = new THREE.Shape([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => new THREE.Vector2(x, -z)));
      addShapeHoles(shape, item.holes);
      addSlabFromShape(g, shape, h, m('top'), m('body'));
      return g;
    },
  },
  stairs: {
    label: 'Schody proste (pełne)', cat: 'Antresola i schody', icon: '⫽', dims: { w: 90, d: 330, h: 260 },
    slots: { treads: { label: 'Stopnie', mat: 'oak', color: '#ffffff' }, body: { label: 'Podstopnice / korpus', mat: 'matt', color: '#f2f0eb' }, rail: { label: 'Poręcz', mat: 'blackMetal', color: '#222222' } },
    params: { steps: { label: 'Liczba stopni', min: 3, max: 25, def: 15 }, rails: { label: 'Poręcze (0–2)', min: 0, max: 2, def: 1 } },
    build(item, m) { return buildStairs(item, m, false); },
  },
  stairsOpen: {
    label: 'Schody ażurowe (na belce)', cat: 'Antresola i schody', icon: '⫻', dims: { w: 80, d: 300, h: 260 },
    slots: { treads: { label: 'Stopnie', mat: 'oak', color: '#ffffff' }, body: { label: 'Belka / policzki', mat: 'blackMetal', color: '#222222' }, rail: { label: 'Poręcz', mat: 'blackMetal', color: '#222222' } },
    params: { steps: { label: 'Liczba stopni', min: 3, max: 25, def: 14 }, rails: { label: 'Poręcze (0–2)', min: 0, max: 2, def: 1 } },
    build(item, m) { return buildStairs(item, m, true); },
  },
  stairsU: {
    label: 'Schody zabiegowe (w kształcie U)', cat: 'Antresola i schody', icon: '⟲', dims: { w: 168, d: 211, h: 265 },
    slots: { treads: { label: 'Stopnie', mat: 'oak', color: '#ffffff' }, body: { label: 'Słupek / konstrukcja', mat: 'blackMetal', color: '#222222' } },
    params: { steps: { label: 'Liczba stopni', min: 7, max: 25, def: 15 }, winders: { label: 'Stopnie zabiegowe', min: 2, max: 9, def: 5 } },
    build(item, m) {
      // bieg 1: lewa połowa od przodu (+Z) do tyłu, zabiegi po półokręgu z tyłu, bieg 2: prawa połowa z powrotem do przodu
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const n = item.p?.steps ?? 15, nw = Math.min(item.p?.winders ?? 5, n - 2);
      const k1 = Math.floor((n - nw) / 2), k2 = n - nw - k1;
      const rise = h / n, tt = 0.04, r = w / 2, L = Math.max(d - r, 0.1), cz = -d / 2 + r;
      let step = 0;
      const top = () => rise * ++step;
      for (let i = 0; i < k1; i++) {
        const run = L / k1;
        addBox(g, m('treads'), r - 0.01, tt, run + 0.02, -r / 2, top() - tt, d / 2 - run * (i + 0.5));
      }
      for (let i = 0; i < nw; i++) {
        const len = Math.PI / nw;
        const wedge = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.01, r - 0.01, tt, 24, 1, false, (3 * Math.PI) / 2 - (i + 1) * len, len), m('treads'));
        wedge.position.set(0, top() - tt / 2, cz);
        wedge.castShadow = wedge.receiveShadow = true;
        g.add(wedge);
      }
      for (let i = 0; i < k2; i++) {
        const run = L / k2;
        addBox(g, m('treads'), r - 0.01, tt, run + 0.02, r / 2, top() - tt, cz + run * (i + 0.5));
      }
      addCyl(g, m('body'), 0.04, h, 0, 0, cz, 16);
      // poręcz nad osią między biegami
      const ang = Math.atan2(rise * k1, L);
      const rail = addBox(g, m('body'), 0.04, 0.04, Math.hypot(L, rise * k1), 0, 0, 0);
      rail.rotation.x = ang;
      rail.position.set(0, (rise * k1) / 2 + 0.9, cz + L / 2);
      return g;
    },
  },
  railing: {
    label: 'Balustrada prętowa', cat: 'Antresola i schody', icon: '⦀', dims: { w: 200, d: 5, h: 110 },
    slots: { body: { label: 'Balustrada', mat: 'blackMetal', color: '#222222' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      addBox(g, m('body'), w, 0.04, 0.05, 0, h - 0.04, 0);
      addBox(g, m('body'), w, 0.03, 0.03, 0, 0.08, 0);
      const n = Math.max(2, Math.round(w / 0.11));
      for (let i = 0; i <= n; i++) addBox(g, m('body'), 0.015, h - 0.04, 0.015, -w / 2 + 0.01 + ((w - 0.02) * i) / n, 0, 0);
      return g;
    },
  },
  railingGlass: {
    label: 'Balustrada szklana', cat: 'Antresola i schody', icon: '▯', dims: { w: 200, d: 5, h: 110 },
    slots: { glass: { label: 'Szkło', mat: 'glass', color: '#dfeef0' }, body: { label: 'Profile / pochwyt', mat: 'steel', color: '#c8cacc' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      addBox(g, m('body'), w, 0.1, 0.06, 0, 0, 0);
      addBox(g, m('glass'), w - 0.01, h - 0.14, 0.017, 0, 0.1, 0);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, w, 16), m('body'));
      rail.rotation.z = Math.PI / 2;
      rail.position.y = h - 0.02;
      rail.castShadow = true;
      g.add(rail);
      return g;
    },
  },

  roofSlope: {
    label: 'Skos dachu (z oknem dachowym)', cat: 'Antresola i schody', icon: '◺', dims: { w: 300, d: 200, h: 250 },
    slots: { body: { label: 'Skos (sufit)', mat: 'paint', color: '#f4f2ee' }, frame: { label: 'Rama okna', mat: 'satin', color: '#e9e9e9' }, knee: { label: 'Ścianka kolankowa', mat: 'paint', color: '#efeae2' } },
    params: {
      low: { label: 'Wysokość niższej krawędzi [cm]', min: 0, max: 400, def: 100 },
      windows: { label: 'Okna dachowe', min: 0, max: 4, def: 1 },
      winW: { label: 'Szer. okna [cm]', min: 40, max: 200, def: 78 },
      winL: { label: 'Dł. okna [cm]', min: 40, max: 200, def: 118 },
      winPos: { label: 'Położenie okna na skosie [%]', min: 0, max: 100, def: 50 },
      winShift: { label: 'Przesunięcie okna w bok [cm]', min: -500, max: 500, def: 0 },
      knee: { label: 'Ścianka kolankowa (0/1)', min: 0, max: 1, def: 1 },
    },
    build(item, m) {
      // szerokość w = wzdłuż okapu (oś X), głębokość d = rzut skosu; niższa krawędź z przodu (+Z), wyższa z tyłu
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const low = Math.min((item.p?.low ?? 100) / 100, h - 0.01);
      const rise = h - low, L = Math.hypot(d, rise), ang = Math.atan2(rise, d), t = 0.06;
      const panel = new THREE.Group();
      // otwory na okna dachowe (u – wzdłuż okapu, v – wzdłuż spadku od dolnej krawędzi)
      const n = item.p?.windows ?? 1, ww = (item.p?.winW ?? 78) / 100, wl = Math.min((item.p?.winL ?? 118) / 100, L * 0.95);
      const vc = Math.min(Math.max(((item.p?.winPos ?? 50) / 100) * L, wl / 2), L - wl / 2), shift = (item.p?.winShift ?? 0) / 100;
      const holes = [];
      for (let i = 0; i < n; i++) {
        const uc = shift + (i - (n - 1) / 2) * (ww + 0.4);
        holes.push({ x0: Math.max(-w / 2, uc - ww / 2), x1: Math.min(w / 2, uc + ww / 2), y0: vc - wl / 2, y1: vc + wl / 2 });
      }
      const piece = (u0, u1, v0, v1, mat) => {
        if (u1 - u0 < 0.002 || v1 - v0 < 0.002) return;
        const b = new THREE.Mesh(boxGeo(u1 - u0, t, v1 - v0), mat);
        b.position.set((u0 + u1) / 2, t / 2, -(v0 + v1) / 2);
        b.castShadow = b.receiveShadow = true;
        panel.add(b);
      };
      let u = -w / 2;
      for (const o of holes.sort((a, b) => a.x0 - b.x0)) {
        piece(u, o.x0, 0, L, m('body'));
        piece(o.x0, o.x1, 0, o.y0, m('body'));
        piece(o.x0, o.x1, o.y1, L, m('body'));
        // rama i szyba
        const f = 0.05;
        piece(o.x0, o.x1, o.y0, o.y0 + f, m('frame'));
        piece(o.x0, o.x1, o.y1 - f, o.y1, m('frame'));
        piece(o.x0, o.x0 + f, o.y0, o.y1, m('frame'));
        piece(o.x1 - f, o.x1, o.y0, o.y1, m('frame'));
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.x1 - o.x0 - 2 * f, o.y1 - o.y0 - 2 * f), getMaterial('glass', '#bcd6e6'));
        glass.rotation.x = -Math.PI / 2;
        glass.position.set((o.x0 + o.x1) / 2, t * 0.6, -(o.y0 + o.y1) / 2);
        panel.add(glass);
        u = o.x1;
      }
      piece(u, w / 2, 0, L, m('body'));
      panel.rotation.x = ang;
      panel.position.set(0, low, d / 2);
      g.add(panel);
      if ((item.p?.knee ?? 1) && low > 0.02) addBox(g, m('knee'), w, low, 0.1, 0, 0, d / 2 + 0.05);
      return g;
    },
  },
  floorVoid: {
    label: 'Otwór w podłodze antresoli', cat: 'Antresola i schody', icon: '⬜', dims: { w: 200, d: 150, h: 1 },
    slots: {},
    build(item) {
      // sam otwór wycina dziurę w podłodze/stropie poziomu; tu tylko obrys (widoczny przy zaznaczaniu)
      const g = new THREE.Group();
      const { w, d } = item.m;
      const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.01, z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#e5484d', dashSize: 0.12, gapSize: 0.08 }));
      line.computeLineDistances();
      g.add(line);
      // niewidoczna płaszczyzna, żeby dało się otwór kliknąć i przesunąć
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ visible: false }));
      hit.rotation.x = -Math.PI / 2;
      hit.position.y = 0.01;
      g.add(hit);
      return g;
    },
  },
  // ===== ARCHITEKTURA =====
  room: {
    label: 'Pomieszczenie', cat: 'Architektura', icon: '⬚', dims: { w: 300, d: 300, h: 1 }, hidden: true,
    slots: { floor: { label: 'Podłoga pomieszczenia', mat: 'floorOak', color: '#ffffff' } },
    build(item, m) {
      // wielokąt podłogi (punkty w cm względem środka), skalowany do bieżących w × d
      const g = new THREE.Group();
      const pts = item.points?.length >= 3 ? item.points : [[-150, -150], [150, -150], [150, 150], [-150, 150]];
      const sx = item.pw ? item.w / item.pw : 1, sz = item.pd ? item.d / item.pd : 1;
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2((x * sx) / 100, (-z * sz) / 100)));
      addShapeHoles(shape, item.holes);
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const floor = new THREE.Mesh(geo, m('floor'));
      floor.position.y = 0.002;
      floor.receiveShadow = true;
      g.add(floor);
      if (item.slab > 0) {
        // strop pod pomieszczeniem na wyższym poziomie (antresola)
        const t = item.slab / 100;
        const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }), getMaterial('paint', '#f4f2ee'));
        slab.rotation.x = -Math.PI / 2;
        slab.position.y = -t;
        slab.castShadow = slab.receiveShadow = true;
        g.add(slab);
      }
      const line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3((x * sx) / 100, 0.006, (z * sz) / 100))),
        new THREE.LineBasicMaterial({ color: '#1f7aec', transparent: true, opacity: 0.55 }),
      );
      g.add(line);
      const el = document.createElement('div');
      el.className = 'room-label';
      const area = polygonArea(pts.map(([x, z]) => [x * sx, z * sz])) / 10000;
      el.innerHTML = `<b></b><span>${area.toFixed(2).replace('.', ',')} m²</span>`;
      el.querySelector('b').textContent = item.name;
      const lbl = new CSS2DObject(el);
      const c = polygonCentroid(pts);
      lbl.position.set((c[0] * sx) / 100, 0.01, (c[1] * sz) / 100);
      g.add(lbl);
      return g;
    },
  },
  washer: {
    label: 'Pralka', cat: 'Łazienka', icon: '◎', dims: { w: 60, d: 55, h: 85 },
    slots: { body: { label: 'Obudowa', mat: 'gloss', color: '#f6f6f6' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('body'), w, h, d - 0.02, 0, 0, -0.01);
      addBox(g, getMaterial('matt', '#d9dcdf'), w - 0.02, 0.1, 0.01, 0, h - 0.12, d / 2 - 0.015);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w, h) * 0.24, 0.02, 12, 40), getMaterial('chrome', '#ffffff'));
      ring.position.set(0, h * 0.45, d / 2 - 0.01);
      g.add(ring);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w, h) * 0.23, 40), getMaterial('glass', '#9fb3c0'));
      glass.position.set(0, h * 0.45, d / 2 - 0.005);
      g.add(glass);
      return g;
    },
  },
  wall: {
    label: 'Ściana', cat: 'Architektura', icon: '▮', dims: { w: 200, d: 12, h: 260 },
    slots: { body: { label: 'Ściana', mat: 'paint', color: '#efeae2' } },
    build(item, m) {
      // ściana składana z prostopadłościanów, z otworami na drzwi i okna (item.holes, w metrach)
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const mat = m('body');
      const holes = (item.holes ?? [])
        .map((o) => ({ x0: Math.max(-w / 2, o.x0), x1: Math.min(w / 2, o.x1), y0: Math.max(0, o.y0), y1: Math.min(h, o.y1) }))
        .filter((o) => o.x1 - o.x0 > 0.01 && o.y1 - o.y0 > 0.01)
        .sort((a, b) => a.x0 - b.x0);
      let x = -w / 2;
      for (const o of holes) {
        const x0 = Math.max(o.x0, x);
        if (x0 > x + 0.001) addBox(g, mat, x0 - x, h, d, (x + x0) / 2, 0, 0);
        const ow = o.x1 - x0;
        if (ow > 0.001) {
          if (o.y0 > 0.001) addBox(g, mat, ow, o.y0, d, x0 + ow / 2, 0, 0);
          if (o.y1 < h - 0.001) addBox(g, mat, ow, h - o.y1, d, x0 + ow / 2, o.y1, 0);
        }
        x = Math.max(x, o.x1);
      }
      if (x < w / 2 - 0.001) addBox(g, mat, w / 2 - x, h, d, (x + w / 2) / 2, 0, 0);
      return g;
    },
  },
  door: {
    label: 'Drzwi', cat: 'Architektura', icon: '🚪', dims: { w: 90, d: 14, h: 208 },
    slots: { front: { label: 'Skrzydło', mat: 'matt', color: '#ffffff' }, body: { label: 'Ościeżnica', mat: 'matt', color: '#ffffff' } },
    handles: true, handleDefault: { type: 'lever', finish: 'black' }, handleTypes: { lever: 'Klamka', bar: 'Pochwyt' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const fr = 0.06;
      addBox(g, m('body'), fr, h, d, -w / 2 + fr / 2, 0, 0);
      addBox(g, m('body'), fr, h, d, w / 2 - fr / 2, 0, 0);
      addBox(g, m('body'), w, fr, d, 0, h - fr, 0);
      addBox(g, m('front'), w - 2 * fr, h - fr, 0.04, 0, 0, 0);
      const f = HANDLE_FINISHES[item.handle?.finish] ?? HANDLE_FINISHES.black;
      const hm = getMaterial(f.mat, f.color);
      const hx = w / 2 - fr - 0.07;
      for (const s of [-1, 1]) {
        addBox(g, hm, 0.04, 0.16, 0.008, hx, 0.98, s * 0.024);
        if (item.handle?.type === 'bar') {
          addBox(g, hm, 0.025, 0.8, 0.025, hx, 0.65, s * 0.07);
        } else {
          addBox(g, hm, 0.13, 0.018, 0.018, hx - 0.05, 1.04, s * 0.05);
        }
      }
      return g;
    },
  },
  window: {
    label: 'Okno', cat: 'Architektura', icon: '⊞', dims: { w: 120, d: 14, h: 140 }, elev: 90,
    slots: { body: { label: 'Rama', mat: 'matt', color: '#ffffff' }, sill: { label: 'Parapet', mat: 'marble', color: '#ffffff' } },
    params: { sashes: { label: 'Liczba skrzydeł', min: 1, max: 4, def: 2 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const fr = 0.07, n = item.p?.sashes ?? 2;
      addBox(g, m('body'), w, fr, d * 0.6, 0, 0, 0);
      addBox(g, m('body'), w, fr, d * 0.6, 0, h - fr, 0);
      for (let i = 0; i <= n; i++) addBox(g, m('body'), fr, h - 2 * fr, d * 0.6, -w / 2 + fr / 2 + ((w - fr) * i) / n, fr, 0);
      addBox(g, getMaterial('glass', '#cfe6f0'), w - 2 * fr, h - 2 * fr, 0.01, 0, fr, 0);
      addBox(g, m('sill'), w + 0.1, 0.03, 0.3, 0, -0.03, d / 2 + 0.08);
      return g;
    },
  },
};

export function newItem(type, overrides = {}) {
  const def = CATALOG[type];
  const parts = {};
  for (const [k, s] of Object.entries(def.slots ?? {})) parts[k] = { mat: s.mat, color: s.color };
  const p = {};
  for (const [k, prm] of Object.entries(def.params ?? {})) p[k] = prm.def;
  return {
    id: crypto.randomUUID?.() ?? String(Math.random()).slice(2),
    type,
    name: def.label,
    x: 0, z: 0, rot: 0,
    elev: def.elev ?? 0,
    w: def.dims.w, d: def.dims.d, h: def.dims.h,
    parts,
    p,
    handle: def.handles ? { ...def.handleDefault } : undefined,
    hinge: 'left',
    ...overrides,
  };
}

/** Buduje obiekt 3D dla elementu projektu. */
export function buildItem(item, gltfCache) {
  const def = CATALOG[item.type];
  const m = (slot) => {
    const p = item.parts?.[slot] ?? def?.slots?.[slot] ?? { mat: 'matt', color: '#cccccc' };
    return getMaterial(p.mat, p.color);
  };
  let g;
  if (item.type === 'gltf') {
    g = new THREE.Group();
    const src = gltfCache?.get(item.src);
    if (src) {
      const clone = src.scene.clone(true);
      const box = new THREE.Box3().setFromObject(clone);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      clone.position.set(-c.x, -box.min.y, -c.z);
      const wrap = new THREE.Group();
      wrap.add(clone);
      wrap.scale.set(item.w / 100 / (size.x || 1), item.h / 100 / (size.y || 1), item.d / 100 / (size.z || 1));
      clone.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true;
          if (item.tint && item.tint !== '#ffffff') {
            o.material = o.material.clone();
            o.material.color = new THREE.Color(item.tint);
          }
        }
      });
      g.add(wrap);
    } else {
      // placeholder do czasu pobrania modelu
      const ph = addBox(g, getMaterial('matt', '#c9d3dd'), item.w / 100, item.h / 100, item.d / 100);
      ph.material = ph.material.clone();
      ph.material.transparent = true;
      ph.material.opacity = 0.5;
    }
  } else {
    const it = { ...item, m: { w: item.w / 100, d: item.d / 100, h: item.h / 100 } };
    g = def.build(it, m);
  }
  const root = new THREE.Group();
  root.add(g);
  root.position.set(item.x / 100, (item.elev ?? 0) / 100, item.z / 100);
  root.rotation.y = THREE.MathUtils.degToRad(-item.rot);
  root.userData.itemId = item.id;
  return root;
}

export function catalogByCategory() {
  const out = {};
  for (const [k, d] of Object.entries(CATALOG)) if (!d.hidden) (out[d.cat] ??= []).push([k, d]);
  return out;
}

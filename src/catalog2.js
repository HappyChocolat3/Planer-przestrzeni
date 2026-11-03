// Rozszerzony katalog mebli: kanapy, szafki, szafy, zlewy, łazienka, przedpokój…
// Elementy dopisywane są do CATALOG z furniture.js (po zaimportowaniu tego modułu).
import * as THREE from 'three';
import { addBox, addCyl, addRounded } from './geometry.js';
import { getMaterial } from './materials.js';
import {
  CATALOG, T, GAP, handleMesh, addFront, doorsRow, drawersCol, carcass, legs4, S, kitchenBase,
} from './furniture.js';

const chrome = () => getMaterial('chrome', '#ffffff');
const H = { type: 'bar', finish: 'steel' };

// ---------- pomocnicze ----------

/** Zlew (1 lub 2 komory, opcjonalnie ociekacz) wpuszczony w blat na wysokości h. */
function sinkTop(g, m, w, d, h, { bowls = 1, drainer = 0 } = {}) {
  const sinkMat = m('sink');
  const total = Math.min(w - 0.1, bowls === 2 ? 0.86 : 0.56) + (drainer ? 0.38 : 0);
  const sd = Math.min(d - 0.12, 0.5);
  const x0 = -total / 2;
  addBox(g, sinkMat, total, 0.006, sd, 0, h, 0.01);
  const dark = getMaterial('matt', '#2a2d30');
  const bw = (total - (drainer ? 0.38 : 0) - 0.06 - (bowls - 1) * 0.04) / bowls;
  for (let i = 0; i < bowls; i++) {
    const bx = x0 + 0.03 + bw / 2 + i * (bw + 0.04) + (drainer && i === 0 ? 0 : 0);
    const b = addBox(g, dark, bw, 0.002, sd - 0.08, bx, h + 0.006, 0.01);
    b.castShadow = false;
  }
  if (drainer) {
    // ociekacz – żłobienia
    const dx0 = x0 + total - 0.38;
    for (let i = 0; i < 6; i++) addBox(g, getMaterial('steel', '#b5b8bb'), 0.3, 0.003, 0.012, dx0 + 0.19, h + 0.006, -sd / 2 + 0.1 + i * 0.05);
  }
  // bateria
  const fx = x0 + 0.03 + (bowls === 2 ? bw + 0.02 : bw / 2);
  addCyl(g, chrome(), 0.018, 0.05, fx, h, -d / 2 + 0.07);
  const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 10, 24, Math.PI), chrome());
  pipe.rotation.y = Math.PI / 2;
  pipe.position.set(fx, h + 0.05, -d / 2 + 0.17);
  pipe.scale.set(1, 1.4, 1);
  g.add(pipe);
}

/** Front urządzenia (piekarnik, mikrofala): stalowa rama + czarna szyba + uchwyt. */
function applianceFront(g, m, x, y, w, h, z, kind = 'oven') {
  addBox(g, m('appliance'), w - GAP, h - GAP, T, x, y + GAP / 2, z + T / 2);
  const glassH = kind === 'micro' ? h - 0.1 : h - 0.2;
  const glassW = kind === 'micro' ? w * 0.68 : w - 0.08;
  const gx = kind === 'micro' ? x - w * 0.12 : x;
  addBox(g, getMaterial('gloss', '#111111'), glassW, glassH, 0.004, gx, y + (kind === 'micro' ? 0.05 : 0.08), z + T + 0.002);
  if (kind === 'oven') {
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, w - 0.12, 14), getMaterial('steel', '#dddddd'));
    hb.rotation.z = Math.PI / 2;
    hb.position.set(x, y + h - 0.06, z + T + 0.03);
    g.add(hb);
  }
}

/** Szafka na nogach / cokole z frontami – baza dla komód, witryn itp. */
function cabinetOnLegs(g, m, w, h, d, legH) {
  const cd = d - T;
  if (legH > 0) legs4(g, m('legs'), w, d, legH, 0.014, 0.05, 0, 0, 0.6);
  const before = g.children.length;
  carcass(g, m('body'), w, h - legH, cd, legH);
  for (let i = before; i < g.children.length; i++) g.children[i].position.z -= T / 2;
  return cd / 2 - T / 2; // płaszczyzna frontów
}

/** Sofa: proste siedziska, oparcie, podłokietniki (używane przez kilka modeli). */
function sofaBody(g, m, w, d, h, { seats = 3, legH = 0.1, armW = 0.18, armL = true, armR = true } = {}) {
  legs4(g, m('legs'), w, d, legH, 0.02, 0.06, 0, 0, 0.7);
  addRounded(g, m('fabric'), w, 0.2, d, 0.03, 0, legH, 0);
  addRounded(g, m('fabric'), w, h - legH - 0.12, 0.2, 0.05, 0, legH + 0.12, -d / 2 + 0.1);
  const left = armL ? armW : 0, right = armR ? armW : 0;
  if (armL) addRounded(g, m('fabric'), armW, 0.62 - legH, d, 0.05, -w / 2 + armW / 2, legH, 0);
  if (armR) addRounded(g, m('fabric'), armW, 0.62 - legH, d, 0.05, w / 2 - armW / 2, legH, 0);
  const inner = w - left - right, sw = inner / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + left + sw * (i + 0.5);
    addRounded(g, m('fabric'), sw - 0.01, 0.24 - 0.0, d - 0.26, 0.05, x, legH + 0.2, 0.06);
    addRounded(g, m('fabric'), sw - 0.03, 0.42, 0.16, 0.07, x, 0.44, -d / 2 + 0.28);
  }
}

/** Szafka łazienkowa z umywalką (zintegrowaną lub nablatową). */
function vanityBuild(item, m, { basins = 1, countertop = false } = {}) {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const cd = d - T, topT = 0.04, ch = h - topT;
  carcass(g, m('body'), w, ch, cd, 0);
  g.children.forEach((c) => (c.position.z -= T / 2));
  const cols = basins;
  const cw = w / cols;
  for (let i = 0; i < cols; i++) drawersCol(g, item, m, -w / 2 + cw * (i + 0.5), 0, cw, ch, cd / 2 - T / 2, 2);
  addRounded(g, m('top'), w, topT, d, 0.008, 0, ch, 0);
  for (let i = 0; i < basins; i++) {
    const bx = basins === 1 ? 0 : -w / 4 + (i * w) / 2;
    if (countertop) {
      // umywalka nablatowa (miska) + wysoka bateria
      const bowl = addCyl(g, m('basin'), 0.2, 0.13, bx, h, 0.02, 36, 0.21);
      bowl.scale.z = 0.8;
      const inner = addCyl(g, getMaterial('ceramic', '#e4e4e4'), 0.185, 0.005, bx, h + 0.125, 0.02, 36);
      inner.scale.z = 0.8;
      addCyl(g, chrome(), 0.014, 0.3, bx, h, -d / 2 + 0.06);
      addBox(g, chrome(), 0.02, 0.02, 0.14, bx, h + 0.28, -d / 2 + 0.12);
    } else {
      const basin = addRounded(g, getMaterial('ceramic', '#e8e8e8'), Math.min(w / basins - 0.16, 0.5), 0.01, d - 0.16, 0.004, bx, h - 0.008, 0.02);
      basin.castShadow = false;
      addCyl(g, chrome(), 0.016, 0.16, bx, h, -d / 2 + 0.06);
      addBox(g, chrome(), 0.02, 0.02, 0.12, bx, h + 0.14, -d / 2 + 0.11);
    }
  }
  return g;
}

/** Słupek kuchenny: cokół, korpus, lista frontów od dołu [{h (m), type: 'door'|'drawers'|'oven'|'micro', n}]. */
function tallUnit(item, m, parts) {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const plinth = 0.1, cd = d - T;
  addBox(g, m('body'), w - 0.01, plinth, 0.02, 0, 0, d / 2 - 0.07);
  carcass(g, m('body'), w, h - plinth, cd, plinth, 3);
  g.children.forEach((c) => (c.position.z -= T / 2));
  const z = cd / 2 - T / 2;
  let y = plinth;
  const fixed = parts.filter((p) => p.h).reduce((s, p) => s + p.h, 0);
  const rest = Math.max(0.2, h - plinth - fixed);
  parts.forEach((p, i) => {
    const ph = p.h ?? rest;
    if (p.type === 'oven' || p.type === 'micro') applianceFront(g, m, 0, y, w, ph, z, p.type);
    else if (p.type === 'drawers') drawersCol(g, item, m, 0, y, w, ph, z, p.n ?? 2);
    else doorsRow(g, item, m, 0, y, w, ph, z, 1, i === parts.length - 1 ? 'bottom' : 'top');
    y += ph;
  });
  return g;
}

// ---------- katalog ----------
export const EXTRA = {
  // ===== KUCHNIA =====
  kSinkDouble: {
    label: 'Szafka zlewowa – zlew 2-komorowy', cat: 'Kuchnia', icon: '⌴', dims: { w: 100, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top(), sink: { label: 'Zlew', mat: 'steel', color: '#c8cacc' } }, handles: true, handleDefault: H,
    params: { bowls: { label: 'Komory zlewu', min: 1, max: 2, def: 2 }, drainer: { label: 'Ociekacz (0/1)', min: 0, max: 1, def: 0 } },
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      doorsRow(g, item, m, 0, plinth, item.m.w, ch, z, 2, 'top');
      sinkTop(g, m, item.m.w, item.m.d, item.m.h, { bowls: item.p?.bowls ?? 2, drainer: item.p?.drainer ?? 0 });
      return g;
    },
  },
  kSinkDrainer: {
    label: 'Szafka zlewowa – zlew z ociekaczem', cat: 'Kuchnia', icon: '⌴', dims: { w: 90, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top(), sink: { label: 'Zlew', mat: 'steel', color: '#c8cacc' } }, handles: true, handleDefault: H,
    params: { bowls: { label: 'Komory zlewu', min: 1, max: 2, def: 1 }, drainer: { label: 'Ociekacz (0/1)', min: 0, max: 1, def: 1 } },
    build(item, m) { return EXTRA.kSinkDouble.build(item, m); },
  },
  kSinkGranite: {
    label: 'Szafka zlewowa – zlew granitowy', cat: 'Kuchnia', icon: '⌴', dims: { w: 80, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front('matt', '#4a4d50'), top: S.top('oak'), sink: { label: 'Zlew', mat: 'granite', color: '#3a3a3a' } }, handles: true, handleDefault: { type: 'bar', finish: 'black' },
    params: { bowls: { label: 'Komory zlewu', min: 1, max: 2, def: 1 }, drainer: { label: 'Ociekacz (0/1)', min: 0, max: 1, def: 0 } },
    build(item, m) { return EXTRA.kSinkDouble.build(item, m); },
  },
  kCorner: {
    label: 'Szafka narożna (L)', cat: 'Kuchnia', icon: '⌐', dims: { w: 90, d: 90, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top() }, handles: true, handleDefault: H,
    build(item, m) {
      // dwie szafki 60 cm głębokości w kształcie litery L (lewy tylny narożnik)
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const dd = 0.6;
      const main = kitchenBase({ ...item, m: { w, d: dd, h } }, m);
      doorsRow(main.g, item, m, dd / 2, main.plinth, w - dd, main.ch, main.z, 1, 'top');
      main.g.position.z = -d / 2 + dd / 2;
      g.add(main.g);
      if (d - dd > 0.05) {
        const wing = kitchenBase({ ...item, m: { w: d - dd, d: dd, h } }, m);
        doorsRow(wing.g, item, m, 0, wing.plinth, d - dd, wing.ch, wing.z, 1, 'top');
        wing.g.rotation.y = Math.PI / 2; // front w stronę +X
        wing.g.position.set(-w / 2 + dd / 2, 0, (-d / 2 + dd + d / 2) / 2);
        g.add(wing.g);
      }
      return g;
    },
  },
  kDishwasher: {
    label: 'Zmywarka do zabudowy', cat: 'Kuchnia', icon: '◧', dims: { w: 60, d: 60, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top() }, handles: true, handleDefault: H,
    build(item, m) {
      const { g, ch, plinth, z } = kitchenBase(item, m);
      addFront(g, item, m, { x: 0, y: plinth, w: item.m.w, h: ch }, z, { kind: 'drawer' });
      return g;
    },
  },
  kTallFridge: {
    label: 'Słupek z lodówką do zabudowy', cat: 'Kuchnia', icon: '❄', dims: { w: 60, d: 60, h: 215 },
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'barLong', finish: 'steel' },
    build(item, m) { return tallUnit(item, m, [{ h: 0.72, type: 'door' }, { h: 1.05, type: 'door' }, { type: 'door' }]); },
  },
  kTallOven: {
    label: 'Słupek z piekarnikiem i mikrofalą', cat: 'Kuchnia', icon: '◫', dims: { w: 60, d: 60, h: 215 },
    slots: { body: S.body(), front: S.front(), appliance: { label: 'AGD', mat: 'steel', color: '#c8cacc' } }, handles: true, handleDefault: H,
    build(item, m) { return tallUnit(item, m, [{ h: 0.6, type: 'drawers', n: 2 }, { h: 0.6, type: 'oven' }, { h: 0.38, type: 'micro' }, { type: 'door' }]); },
  },
  kWallGlass: {
    label: 'Szafka górna z witryną', cat: 'Kuchnia', icon: '▔', dims: { w: 60, d: 35, h: 72 }, elev: 145,
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: H,
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0, 1);
      g.children.forEach((c) => (c.position.z -= T / 2));
      const n = w > 0.5 ? 2 : 1, dw = w / n;
      for (let i = 0; i < n; i++) addFront(g, item, m, { x: -w / 2 + dw * (i + 0.5), y: 0, w: dw, h }, cd / 2 - T / 2, { kind: 'door', hinge: n === 1 ? item.hinge : i ? 'right' : 'left', place: 'bottom', glass: true });
      return g;
    },
  },
  kWallFlap: {
    label: 'Szafka górna z frontem uchylnym', cat: 'Kuchnia', icon: '▔', dims: { w: 80, d: 35, h: 36 }, elev: 181,
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'gola', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0);
      g.children.forEach((c) => (c.position.z -= T / 2));
      addFront(g, item, m, { x: 0, y: 0, w, h }, cd / 2 - T / 2, { kind: 'flap' });
      return g;
    },
  },
  kHood: {
    label: 'Okap kominowy', cat: 'Kuchnia', icon: '⏏', dims: { w: 60, d: 50, h: 90 }, elev: 155,
    slots: { body: { label: 'Okap', mat: 'steel', color: '#c8cacc' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('body'), w, 0.05, d, 0, 0, 0);
      // ostrosłup ścięty: kwadratowa podstawa (geometria obrócona o 45°, potem skalowana do w × d)
      const geo = new THREE.CylinderGeometry(0.18 * Math.SQRT2, Math.SQRT2 / 2, 0.12, 4);
      geo.rotateY(Math.PI / 4);
      const hood = new THREE.Mesh(geo, m('body'));
      hood.scale.set(w, 1, d * 0.9);
      hood.position.set(0, 0.11, -d * 0.05);
      hood.castShadow = true;
      g.add(hood);
      addBox(g, m('body'), 0.26, h - 0.17, 0.24, 0, 0.17, -d / 2 + 0.12);
      return g;
    },
  },
  kIsland: {
    label: 'Wyspa kuchenna', cat: 'Kuchnia', icon: '▬', dims: { w: 180, d: 90, h: 90 },
    slots: { body: S.body(), front: S.front(), top: S.top('marble') }, handles: true, handleDefault: { type: 'barLong', finish: 'black' },
    build(item, m) {
      // szafki z szufladami od przodu, z tyłu nadwieszony blat (miejsce na hokery)
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const dd = Math.min(0.6, d - 0.05);
      const base = kitchenBase({ ...item, m: { w, d: dd, h } }, m);
      const n = Math.max(1, Math.round(w / 0.6)), cw = w / n;
      for (let i = 0; i < n; i++) drawersCol(base.g, item, m, -w / 2 + cw * (i + 0.5), base.plinth, cw, base.ch, base.z, 3);
      base.g.position.z = d / 2 - dd / 2;
      g.add(base.g);
      if (d - dd > 0.01) addBox(g, m('top'), w, 0.038, d - dd, 0, h - 0.038, -d / 2 + (d - dd) / 2);
      return g;
    },
  },
  barStool: {
    label: 'Hoker (krzesło barowe)', cat: 'Kuchnia', icon: '⑁', dims: { w: 42, d: 42, h: 95 },
    slots: { body: { label: 'Siedzisko', mat: 'leather', color: '#7a4a2a' }, legs: S.legs() },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const sh = Math.min(0.68, h - 0.1);
      legs4(g, m('legs'), w - 0.04, d - 0.04, sh - 0.04, 0.012, 0.03, 0, 0, 1);
      const ring = new THREE.Mesh(new THREE.TorusGeometry((w - 0.08) / 2, 0.008, 8, 32), m('legs'));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      g.add(ring);
      addCyl(g, m('body'), w / 2, 0.05, 0, sh - 0.05, 0, 28);
      addRounded(g, m('body'), w * 0.85, h - sh - 0.05, 0.03, 0.012, 0, sh + 0.05, -d / 2 + 0.03);
      return g;
    },
  },

  // ===== SALON =====
  sofa2: {
    label: 'Sofa 2-osobowa', cat: 'Salon', icon: '🛋', dims: { w: 160, d: 90, h: 84 },
    slots: { fabric: S.fabric('fabric', '#b8a993'), legs: S.legs('oak', '#ffffff') },
    params: { seats: { label: 'Liczba siedzisk', min: 1, max: 4, def: 2 } },
    build(item, m) { return CATALOG.sofa.build(item, m); },
  },
  sofa4: {
    label: 'Sofa 4-osobowa', cat: 'Salon', icon: '🛋', dims: { w: 260, d: 95, h: 84 },
    slots: { fabric: S.fabric('velvet', '#3b4a5c'), legs: S.legs('blackMetal', '#222222') },
    params: { seats: { label: 'Liczba siedzisk', min: 1, max: 5, def: 4 } },
    build(item, m) { return CATALOG.sofa.build(item, m); },
  },
  cornerSofa: {
    label: 'Narożnik (sofa narożna L)', cat: 'Salon', icon: '⌙', dims: { w: 270, d: 170, h: 84 },
    slots: { fabric: S.fabric('fabric', '#8a9199'), legs: S.legs('blackMetal', '#222222') },
    params: { side: { label: 'Szezlong: 0 – lewy, 1 – prawy', min: 0, max: 1, def: 1 }, seats: { label: 'Siedziska w części głównej', min: 1, max: 4, def: 2 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const dd = 0.95, cw = 0.95, right = (item.p?.side ?? 1) === 1;
      const main = new THREE.Group();
      sofaBody(main, m, w, dd, h, { seats: (item.p?.seats ?? 2) + 1, armL: right, armR: !right });
      main.position.z = -d / 2 + dd / 2;
      g.add(main);
      // szezlong
      const cx = right ? w / 2 - cw / 2 : -w / 2 + cw / 2, len = d - dd + 0.2, cz = d / 2 - len / 2;
      legs4(g, m('legs'), cw, len, 0.1, 0.02, 0.06, cx, cz, 0.7);
      addRounded(g, m('fabric'), cw, 0.2, len, 0.03, cx, 0.1, cz);
      addRounded(g, m('fabric'), cw - 0.02, 0.14, len - 0.02, 0.05, cx, 0.3, cz);
      addRounded(g, m('fabric'), 0.18, 0.52, len, 0.05, right ? w / 2 - 0.09 : -w / 2 + 0.09, 0.1, cz);
      return g;
    },
  },
  pouf: {
    label: 'Pufa', cat: 'Salon', icon: '●', dims: { w: 50, d: 50, h: 42 },
    slots: { fabric: S.fabric('velvet', '#c2714f') },
    build(item, m) {
      const g = new THREE.Group();
      const p = addRounded(g, m('fabric'), item.m.w, item.m.h, item.m.d, Math.min(item.m.w, item.m.h) * 0.25, 0, 0, 0);
      p.geometry.computeVertexNormals();
      return g;
    },
  },
  roundCoffeeTable: {
    label: 'Stolik kawowy okrągły', cat: 'Salon', icon: '◯', dims: { w: 80, d: 80, h: 40 },
    slots: { top: S.top('walnut'), legs: S.legs('brass', '#c9a447') },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        addCyl(g, m('legs'), 0.012, h - 0.03, Math.cos(a) * w * 0.32, 0, Math.sin(a) * d * 0.32, 10);
      }
      const t = addCyl(g, m('top'), w / 2, 0.03, 0, h - 0.03, 0, 48);
      t.scale.z = d / w;
      return g;
    },
  },
  tv: {
    label: 'Telewizor', cat: 'Salon', icon: '📺', dims: { w: 145, d: 6, h: 84 }, elev: 55,
    slots: { body: { label: 'Obudowa', mat: 'matt', color: '#1b1b1b' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('body'), w, h, d, 0, 0, 0);
      addBox(g, getMaterial('gloss', '#0b0d10'), w - 0.02, h - 0.02, 0.002, 0, 0.01, d / 2 + 0.001);
      return g;
    },
  },
  tvWall: {
    label: 'Zabudowa RTV (komplet)', cat: 'Salon', icon: '▥', dims: { w: 300, d: 40, h: 220 },
    slots: { body: S.body('matt', '#f2f0eb'), front: S.front('matt', '#f2f0eb'), panel: { label: 'Panel ścienny (lamele)', mat: 'oak', color: '#ffffff' } },
    handles: true, handleDefault: { type: 'none', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      // panel lamelowy za telewizorem
      const pw = Math.min(w * 0.45, 1.8), n = Math.round(pw / 0.04);
      for (let i = 0; i < n; i++) addBox(g, m('panel'), 0.025, h - 0.02, 0.02, -pw / 2 + 0.02 + i * (pw / n), 0, -d / 2 + 0.01);
      // dolna szafka wisząca
      const low = new THREE.Group();
      carcass(low, m('body'), w, 0.42, d - T, 0);
      const cols = Math.max(2, Math.round(w / 0.6));
      for (let i = 0; i < cols; i++) addFront(low, item, m, { x: -w / 2 + (w / cols) * (i + 0.5), y: 0, w: w / cols, h: 0.42 }, (d - T) / 2, { kind: 'flap' });
      low.position.set(0, 0.2, -T / 2);
      g.add(low);
      // górna półka-szafka
      const up = new THREE.Group();
      const uw = Math.min(w, pw + 0.6);
      carcass(up, m('body'), uw, 0.3, 0.3, 0);
      up.position.set(0, h - 0.32, -d / 2 + 0.15);
      g.add(up);
      return g;
    },
  },
  vitrine: {
    label: 'Witryna (szafka przeszklona)', cat: 'Salon', icon: '▯', dims: { w: 90, d: 40, h: 190 },
    slots: { body: S.body('walnut', '#ffffff'), front: S.front('walnut', '#ffffff'), legs: S.legs('blackMetal', '#222222') }, handles: true, handleDefault: { type: 'knob', finish: 'brass' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.12, z = cabinetOnLegs(g, m, w, h, d, legH);
      const lowH = 0.75;
      doorsRow(g, item, m, 0, legH + T, w - 2 * T, lowH, z, 2, 'top');
      for (let i = 0; i < 2; i++) addFront(g, item, m, { x: -w / 4 + (i * w) / 2, y: legH + T + lowH, w: (w - 2 * T) / 2, h: h - legH - 2 * T - lowH }, z, { kind: 'door', hinge: i ? 'right' : 'left', place: 'bottom', glass: true });
      for (let i = 1; i <= 2; i++) addBox(g, getMaterial('glass', '#dfeef0'), w - 2 * T, 0.008, d - 0.06, 0, legH + lowH + ((h - legH - lowH) * i) / 3, -0.01);
      return g;
    },
  },
  shelfWall: {
    label: 'Półka ścienna', cat: 'Salon', icon: '▁', dims: { w: 80, d: 22, h: 3 }, elev: 150,
    slots: { body: { label: 'Półka', mat: 'oak', color: '#ffffff' }, legs: { label: 'Wsporniki', mat: 'blackMetal', color: '#222222' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('body'), w, h, d, 0, 0, 0);
      for (const s of [-1, 1]) {
        addBox(g, m('legs'), 0.02, 0.003, d - 0.03, s * (w / 2 - 0.12), -0.003, 0);
        addBox(g, m('legs'), 0.02, 0.12, 0.004, s * (w / 2 - 0.12), -0.12, -d / 2 + 0.002);
      }
      return g;
    },
  },
  pendantLamp: {
    label: 'Lampa wisząca', cat: 'Salon', icon: '💡', dims: { w: 40, d: 40, h: 25 }, elev: 180,
    slots: { body: { label: 'Klosz', mat: 'blackMetal', color: '#222222' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      const shade = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), m('body').clone());
      shade.material.side = THREE.DoubleSide;
      shade.scale.y = h / (w / 2);
      shade.castShadow = true;
      g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff3d6' }));
      bulb.position.y = 0.02;
      g.add(bulb);
      addCyl(g, getMaterial('matt', '#111111'), 0.003, 1.2, 0, h, 0, 6);
      return g;
    },
  },

  // ===== SYPIALNIA =====
  wardrobeSliding: {
    label: 'Szafa z drzwiami przesuwnymi', cat: 'Sypialnia', icon: '▯', dims: { w: 200, d: 65, h: 240 },
    slots: { body: S.body(), front: S.front('oak', '#ffffff'), frame: { label: 'Profile', mat: 'blackMetal', color: '#222222' } },
    params: { doors: { label: 'Liczba drzwi', min: 2, max: 4, def: 2 }, mirror: { label: 'Lustro na drzwiach (0/1)', min: 0, max: 1, def: 1 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - 0.08;
      carcass(g, m('body'), w, h, cd, 0, 0);
      g.children.forEach((c) => (c.position.z -= 0.04));
      const n = item.p?.doors ?? 2, dw = w / n + 0.02;
      addBox(g, m('frame'), w, 0.04, 0.08, 0, h - 0.04, d / 2 - 0.04);
      addBox(g, m('frame'), w, 0.03, 0.08, 0, 0, d / 2 - 0.04);
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5), z = d / 2 - (i % 2 ? 0.02 : 0.055);
        const mirror = (item.p?.mirror ?? 1) && (n === 2 ? i === 1 : i === Math.floor(n / 2));
        addBox(g, mirror ? getMaterial('chrome', '#e6ecef') : m('front'), dw - 0.03, h - 0.08, 0.015, x, 0.035, z);
        for (const s of [-1, 1]) addBox(g, m('frame'), 0.02, h - 0.08, 0.025, x + s * (dw / 2 - 0.015), 0.035, z);
      }
      return g;
    },
  },
  wardrobeOpen: {
    label: 'Garderoba otwarta (regał z drążkiem)', cat: 'Sypialnia', icon: '⫠', dims: { w: 150, d: 50, h: 210 },
    slots: { body: S.body('oak', '#ffffff'), legs: { label: 'Drążek', mat: 'chrome', color: '#ffffff' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      for (const s of [-1, 0, 1]) addBox(g, m('body'), T, h, d, s * (w / 2 - T / 2), 0, 0);
      addBox(g, m('body'), w, T, d, 0, h - T, 0);
      for (const y of [0.05, 1.75]) addBox(g, m('body'), w - 2 * T, T, d - 0.02, 0, y, 0);
      // lewa komora – drążek z ubraniami, prawa – półki
      const half = w / 2 - T;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, half - 0.02, 12), m('legs'));
      rail.rotation.z = Math.PI / 2;
      rail.position.set(-w / 4, 1.65, 0);
      g.add(rail);
      const cols = ['#2e3e57', '#d6cbb8', '#8a9a7b', '#ffffff', '#4a4d50', '#c2714f'];
      for (let i = 0; i < Math.floor(half / 0.06); i++) addBox(g, getMaterial('fabric', cols[i % cols.length]), 0.03, 0.75 + (i % 3) * 0.12, 0.42, -w / 2 + T + 0.05 + i * 0.06, 1.62 - 0.75 - (i % 3) * 0.12, 0);
      for (let i = 1; i <= 4; i++) addBox(g, m('body'), half, T, d - 0.02, w / 4, 0.05 + (1.7 * i) / 5, 0);
      return g;
    },
  },
  bedUpholstered: {
    label: 'Łóżko tapicerowane', cat: 'Sypialnia', icon: '🛏', dims: { w: 160, d: 210, h: 120 },
    slots: { fabric: S.fabric('velvet', '#9aa3a8'), bedding: { label: 'Pościel', mat: 'fabric', color: '#f1eee8' }, legs: S.legs('blackMetal', '#222222') },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      legs4(g, m('legs'), w, d - 0.1, 0.06, 0.02, 0.06, 0, 0.05);
      addRounded(g, m('fabric'), w, 0.3, d - 0.1, 0.04, 0, 0.06, 0.05);
      addRounded(g, m('bedding'), w - 0.06, 0.2, d - 0.18, 0.04, 0, 0.36, 0.06);
      addRounded(g, m('bedding'), w - 0.04, 0.06, (d - 0.18) * 0.62, 0.03, 0, 0.54, 0.06 + d * 0.18);
      for (const s of w > 1.2 ? [-1, 1] : [0]) addRounded(g, getMaterial('fabric', '#ffffff'), w > 1.2 ? w / 2 - 0.1 : w - 0.2, 0.12, 0.38, 0.05, s * (w / 4), 0.56, -d / 2 + 0.38);
      // wysoki zagłówek z przeszyciami
      const n = Math.max(3, Math.round(w / 0.25));
      for (let i = 0; i < n; i++) addRounded(g, m('fabric'), w / n - 0.004, h - 0.06, 0.12, 0.04, -w / 2 + (w / n) * (i + 0.5), 0.06, -d / 2 + 0.06);
      return g;
    },
  },
  bedSingle: {
    label: 'Łóżko pojedyncze', cat: 'Sypialnia', icon: '🛏', dims: { w: 90, d: 200, h: 90 },
    slots: { body: { label: 'Rama', mat: 'pine', color: '#ffffff' }, fabric: { label: 'Zagłówek', mat: 'fabric', color: '#b8b2a7' }, bedding: { label: 'Pościel', mat: 'fabric', color: '#e7ecf2' } },
    build(item, m) { return CATALOG.bed.build(item, m); },
  },
  dresserWide: {
    label: 'Komoda szeroka (2 × 3 szuflady)', cat: 'Sypialnia', icon: '☰', dims: { w: 140, d: 48, h: 80 },
    slots: { body: S.body('matt', '#f2f0eb'), front: S.front('matt', '#f2f0eb'), legs: S.legs('oak', '#ffffff') }, handles: true, handleDefault: { type: 'edge', finish: 'gold' },
    params: { drawers: { label: 'Szuflady w kolumnie', min: 1, max: 6, def: 3 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const legH = 0.1, z = cabinetOnLegs(g, m, w, h, d, legH);
      const cw = (w - 2 * T) / 2;
      for (let i = 0; i < 2; i++) drawersCol(g, item, m, -w / 2 + T + cw * (i + 0.5), legH + T, cw, h - legH - 2 * T, z, item.p?.drawers ?? 3);
      return g;
    },
  },
  dressingTable: {
    label: 'Toaletka z lustrem', cat: 'Sypialnia', icon: '◚', dims: { w: 100, d: 45, h: 76 },
    slots: { top: S.top('oak'), front: S.front('matt', '#f2f0eb'), legs: S.legs('oak', '#ffffff') }, handles: true, handleDefault: { type: 'knob', finish: 'gold' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      legs4(g, m('legs'), w, d, h - 0.03, 0.016, 0.04, 0, 0, 0.6);
      addBox(g, m('top'), w, 0.15, d - 0.04, 0, h - 0.18, 0);
      addFront(g, item, m, { x: 0, y: h - 0.17, w: w * 0.6, h: 0.13 }, d / 2 - 0.02, { kind: 'drawer', place: 'center' });
      addBox(g, m('top'), w, 0.03, d, 0, h - 0.03, 0);
      const mir = new THREE.Mesh(new THREE.CircleGeometry(Math.min(w * 0.32, 0.38), 48), getMaterial('chrome', '#e6ecef'));
      mir.position.set(0, h + 0.5, -d / 2 + 0.02);
      g.add(mir);
      const frame = new THREE.Mesh(new THREE.TorusGeometry(Math.min(w * 0.32, 0.38), 0.012, 10, 64), getMaterial('brass', '#c9a447'));
      frame.position.copy(mir.position);
      g.add(frame);
      return g;
    },
  },
  mirror: {
    label: 'Lustro ścienne', cat: 'Sypialnia', icon: '▭', dims: { w: 60, d: 3, h: 160 }, elev: 20,
    slots: { frame: { label: 'Rama', mat: 'blackMetal', color: '#222222' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const f = 0.025;
      addBox(g, m('frame'), w, f, d, 0, 0, 0);
      addBox(g, m('frame'), w, f, d, 0, h - f, 0);
      addBox(g, m('frame'), f, h, d, -w / 2 + f / 2, 0, 0);
      addBox(g, m('frame'), f, h, d, w / 2 - f / 2, 0, 0);
      addBox(g, getMaterial('chrome', '#e6ecef'), w - 2 * f, h - 2 * f, 0.006, 0, f, 0);
      return g;
    },
  },

  // ===== ŁAZIENKA =====
  vanityDouble: {
    label: 'Szafka z dwiema umywalkami', cat: 'Łazienka', icon: '◡◡', dims: { w: 140, d: 48, h: 55 }, elev: 30,
    slots: { body: S.body('walnut', '#ffffff'), front: S.front('walnut', '#ffffff'), top: { label: 'Blat z umywalkami', mat: 'ceramic', color: '#fafafa' } },
    handles: true, handleDefault: { type: 'gola', finish: 'black' },
    build(item, m) { return vanityBuild(item, m, { basins: 2 }); },
  },
  vanityCountertop: {
    label: 'Szafka z umywalką nablatową', cat: 'Łazienka', icon: '◒', dims: { w: 100, d: 46, h: 50 }, elev: 35,
    slots: { body: S.body('matt', '#4a4d50'), front: S.front('matt', '#4a4d50'), top: { label: 'Blat', mat: 'oak', color: '#ffffff' }, basin: { label: 'Umywalka', mat: 'ceramic', color: '#fafafa' } },
    handles: true, handleDefault: { type: 'none', finish: 'black' },
    params: { basins: { label: 'Liczba umywalek', min: 1, max: 2, def: 1 } },
    build(item, m) { return vanityBuild(item, m, { basins: item.p?.basins ?? 1, countertop: true }); },
  },
  bathtubFree: {
    label: 'Wanna wolnostojąca', cat: 'Łazienka', icon: '◯', dims: { w: 170, d: 80, h: 60 },
    slots: { body: { label: 'Wanna', mat: 'gloss', color: '#fafafa' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addRounded(g, m('body'), w, h, d, Math.min(d, h) * 0.45, 0, 0, 0);
      const water = addRounded(g, getMaterial('glass', '#bfe3ea'), w - 0.12, 0.01, d - 0.12, 0.004, 0, h - 0.004, 0);
      water.castShadow = false;
      // bateria wolnostojąca
      addCyl(g, chrome(), 0.02, h + 0.35, w / 2 + 0.15, 0, 0, 16);
      addBox(g, chrome(), 0.25, 0.02, 0.02, w / 2 + 0.03, h + 0.33, 0);
      return g;
    },
  },
  showerWalkIn: {
    label: 'Prysznic walk-in (ścianka szklana)', cat: 'Łazienka', icon: '▕', dims: { w: 120, d: 90, h: 200 },
    slots: { body: { label: 'Profile i deszczownica', mat: 'blackMetal', color: '#222222' }, tray: { label: 'Brodzik / posadzka', mat: 'concrete', color: '#ffffff' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('tray'), w, 0.02, d, 0, 0, 0);
      addBox(g, m('body'), w * 0.5, 0.004, 0.08, w / 4, 0.02, d / 2 - 0.12);
      addBox(g, getMaterial('glass', '#dfeef0'), 0.008, h - 0.02, d * 0.85, w / 2 - 0.004, 0.02, -d * 0.075);
      addBox(g, m('body'), 0.03, 0.03, d * 0.85, w / 2 - 0.004, h - 0.03, -d * 0.075);
      addBox(g, m('body'), 0.02, 0.02, 0.4, w / 2 - 0.004, h - 0.02, -d / 2 + 0.2);
      addCyl(g, m('body'), 0.15, 0.01, 0, h - 0.1, -d / 2 + 0.25, 32);
      addBox(g, m('body'), 0.02, 0.02, 0.25, 0, h - 0.09, -d / 2 + 0.12);
      return g;
    },
  },
  bathTall: {
    label: 'Słupek łazienkowy', cat: 'Łazienka', icon: '▯', dims: { w: 40, d: 33, h: 160 }, elev: 25,
    slots: { body: S.body('walnut', '#ffffff'), front: S.front('walnut', '#ffffff') }, handles: true, handleDefault: { type: 'gola', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0, 4);
      g.children.forEach((c) => (c.position.z -= T / 2));
      doorsRow(g, item, m, 0, 0, w, h, cd / 2 - T / 2, 1, 'middle');
      return g;
    },
  },
  mirrorCabinet: {
    label: 'Szafka z lustrem', cat: 'Łazienka', icon: '▭', dims: { w: 80, d: 15, h: 70 }, elev: 115,
    slots: { body: S.body('matt', '#ffffff'), front: { label: 'Lustro', mat: 'chrome', color: '#e6ecef' } }, handles: true, handleDefault: { type: 'none', finish: 'chrome' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0, 1);
      g.children.forEach((c) => (c.position.z -= T / 2));
      doorsRow(g, item, m, 0, 0, w, h, cd / 2 - T / 2, w > 0.6 ? 2 : 1, 'bottom');
      addBox(g, new THREE.MeshBasicMaterial({ color: '#fff7e6' }), w - 0.1, 0.01, 0.02, 0, -0.012, 0.02);
      return g;
    },
  },
  towelRadiator: {
    label: 'Grzejnik drabinkowy', cat: 'Łazienka', icon: '☷', dims: { w: 50, d: 6, h: 120 }, elev: 20,
    slots: { body: { label: 'Grzejnik', mat: 'satin', color: '#2a2a2a' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      for (const s of [-1, 1]) addCyl(g, m('body'), 0.016, h, s * (w / 2 - 0.02), 0, 0, 12);
      const n = Math.max(4, Math.round(h / 0.06));
      for (let i = 0; i < n; i++) {
        if (i % 6 === 5) continue; // przerwy jak w grzejnikach łazienkowych
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, w - 0.04, 10), m('body'));
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, 0.04 + ((h - 0.08) * i) / (n - 1), 0);
        bar.castShadow = true;
        g.add(bar);
      }
      return g;
    },
  },

  // ===== PRZEDPOKÓJ =====
  shoeCabinet: {
    label: 'Szafka na buty', cat: 'Przedpokój', icon: '☰', dims: { w: 80, d: 30, h: 105 },
    slots: { body: S.body('oak', '#ffffff'), front: S.front('matt', '#f2f0eb') }, handles: true, handleDefault: { type: 'edge', finish: 'black' },
    params: { flaps: { label: 'Liczba klap', min: 1, max: 4, def: 3 } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const cd = d - T;
      carcass(g, m('body'), w, h, cd, 0);
      g.children.forEach((c) => (c.position.z -= T / 2));
      const n = item.p?.flaps ?? 3, fh = (h - 2 * T) / n;
      for (let i = 0; i < n; i++) addFront(g, item, m, { x: 0, y: T + fh * i, w: w - 2 * T, h: fh }, cd / 2 - T / 2, { kind: 'drawer' });
      return g;
    },
  },
  hallWardrobe: {
    label: 'Szafa do przedpokoju (z lustrem)', cat: 'Przedpokój', icon: '▯', dims: { w: 100, d: 40, h: 220 },
    slots: { body: S.body(), front: S.front() }, handles: true, handleDefault: { type: 'barLong', finish: 'black' },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      const plinth = 0.06, cd = d - T;
      addBox(g, m('body'), w - 0.02, plinth, cd - 0.04, 0, 0, 0);
      carcass(g, m('body'), w, h - plinth, cd, plinth, 3);
      g.children.forEach((c) => (c.position.z -= T / 2));
      const z = cd / 2 - T / 2, dw = w / 2;
      addFront(g, item, m, { x: -w / 4, y: plinth, w: dw, h: h - plinth }, z, { kind: 'door', hinge: 'left', place: 'middle' });
      // drzwi z lustrem
      addBox(g, getMaterial('chrome', '#e6ecef'), dw - GAP, h - plinth - GAP, T, w / 4, plinth + GAP / 2, z + T / 2);
      return g;
    },
  },
  coatRack: {
    label: 'Wieszak stojący', cat: 'Przedpokój', icon: '⚲', dims: { w: 45, d: 45, h: 175 },
    slots: { body: { label: 'Wieszak', mat: 'oak', color: '#ffffff' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, h } = item.m;
      addCyl(g, m('body'), 0.02, h, 0, 0, 0, 12);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = addBox(g, m('body'), 0.025, 0.025, w / 2, Math.cos(a) * w / 4, 0, Math.sin(a) * w / 4);
        leg.rotation.y = -a + Math.PI / 2;
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), m('body'));
        hook.position.set(Math.cos(a) * 0.06, h - 0.12, Math.sin(a) * 0.06);
        hook.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        g.add(hook);
      }
      return g;
    },
  },
  bench: {
    label: 'Ławka z poduszką', cat: 'Przedpokój', icon: '▬', dims: { w: 100, d: 35, h: 46 },
    slots: { body: { label: 'Ławka', mat: 'oak', color: '#ffffff' }, fabric: S.fabric('fabric', '#8a9a7b'), legs: S.legs() },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      legs4(g, m('legs'), w, d, h - 0.08, 0.014, 0.05);
      addBox(g, m('body'), w, 0.03, d, 0, h - 0.08, 0);
      addBox(g, m('body'), w - 0.1, 0.02, d - 0.06, 0, 0.12, 0);
      addRounded(g, m('fabric'), w - 0.02, 0.05, d - 0.02, 0.015, 0, h - 0.05, 0);
      return g;
    },
  },

  // ===== ARCHITEKTURA =====
  radiator: {
    label: 'Grzejnik płytowy', cat: 'Architektura', icon: '▤', dims: { w: 80, d: 10, h: 60 }, elev: 15,
    slots: { body: { label: 'Grzejnik', mat: 'satin', color: '#f6f6f6' } },
    build(item, m) {
      const g = new THREE.Group();
      const { w, d, h } = item.m;
      addBox(g, m('body'), w, h, d * 0.6, 0, 0, 0);
      const n = Math.round(w / 0.05);
      for (let i = 0; i < n; i++) addBox(g, m('body'), 0.012, h - 0.06, 0.012, -w / 2 + 0.025 + (i * (w - 0.05)) / (n - 1), 0.03, d * 0.3 + 0.006);
      addBox(g, m('body'), w, 0.015, d, 0, h - 0.015, 0);
      return g;
    },
  },
};

Object.assign(CATALOG, EXTRA);
export { handleMesh, legs4 };

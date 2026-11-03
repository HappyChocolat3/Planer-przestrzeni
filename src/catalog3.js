// Kanapa rozkładana i biurko narożne – w wielu stylach (wybór w panelu „Konfiguracja”).
import * as THREE from 'three';
import { addBox, addCyl, addRounded } from './geometry.js';
import { getMaterial } from './materials.js';
import { CATALOG, T, drawersCol, carcass, legs4, S } from './furniture.js';

// ===================== KANAPA ROZKŁADANA =====================
const SOFA_STYLES = {
  scandi: { label: 'Skandynawska (drewniane nóżki)', legs: 'wood', legH: 0.17, arm: 'slim', armW: 0.1, armH: 0.6, back: 'cushions', seat: 'cushions' },
  modern: { label: 'Nowoczesna (niska, bryłowa)', legs: 'plinth', legH: 0.05, arm: 'block', armW: 0.24, armH: 0.56, back: 'solid', seat: 'bench' },
  loft: { label: 'Loft (metalowe płozy)', legs: 'sled', legH: 0.15, arm: 'block', armW: 0.13, armH: 0.62, back: 'cushions', seat: 'cushions' },
  chesterfield: { label: 'Chesterfield (pikowana)', legs: 'bun', legH: 0.07, arm: 'rolled', armW: 0.22, armH: 0.74, back: 'tufted', seat: 'cushions' },
  classic: { label: 'Klasyczna (zaokrąglone boki)', legs: 'bun', legH: 0.08, arm: 'rolled', armW: 0.19, armH: 0.62, back: 'cushions', seat: 'cushions' },
  versalka: { label: 'Wersalka (bez boków)', legs: 'metal', legH: 0.12, arm: 'none', armW: 0, armH: 0, back: 'solid', seat: 'bench' },
  futon: { label: 'Futon (drewniana rama, materac)', legs: 'frame', legH: 0.2, arm: 'wood', armW: 0.05, armH: 0.55, back: 'mattress', seat: 'mattress' },
};

const MECHANISMS = [
  ['delfin', 'Delfin – materac wysuwany z przodu'],
  ['amerykanka', 'Amerykanka – rozkładana do przodu'],
  ['clickclack', 'Click-clack – oparcie kładzie się na płasko'],
];

function sofaBedBuild(item, m) {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const st = SOFA_STYLES[item.p?.style] ?? SOFA_STYLES.scandi;
  const open = item.p?.state === 'open';
  const flat = item.p?.mech === 'clickclack';
  const legH = st.legH, baseH = 0.17, armW = Math.min(st.armW, w / 4);
  const inner = w - 2 * armW;
  const seatTop = legH + baseH + 0.14;
  const fab = m('fabric');

  // nogi / podstawa
  if (st.legs === 'wood') legs4(g, m('legs'), w - 0.04, d - 0.06, legH, 0.022, 0.07, 0, 0, 0.55);
  else if (st.legs === 'metal') legs4(g, m('legs'), w - 0.06, d - 0.08, legH, 0.011, 0.06);
  else if (st.legs === 'bun') legs4(g, m('legs'), w - 0.04, d - 0.06, legH, 0.035, 0.07, 0, 0, 0.75);
  else if (st.legs === 'plinth') addBox(g, getMaterial('matt', '#1e1e1e'), w - 0.12, legH, d - 0.12, 0, 0, 0);
  else if (st.legs === 'sled') {
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - 0.08);
      addBox(g, m('legs'), 0.025, 0.015, d - 0.1, x, 0, 0);
      for (const z of [-1, 1]) addBox(g, m('legs'), 0.025, legH, 0.025, x, 0, z * (d / 2 - 0.07));
    }
  }

  // korpus (siedzisko bazowe)
  if (st.legs === 'frame') {
    // futon: drewniana rama z listwami
    for (const s of [-1, 1]) addBox(g, m('legs'), 0.05, st.armH, d, s * (w / 2 - 0.025), 0, 0);
    addBox(g, m('legs'), w - 0.1, 0.05, 0.05, 0, legH, d / 2 - 0.05);
    addBox(g, m('legs'), w - 0.1, 0.05, 0.05, 0, legH, -d / 2 + 0.05);
    const n = Math.round((d - 0.1) / 0.1);
    for (let i = 0; i < n; i++) addBox(g, m('legs'), w - 0.1, 0.02, 0.06, 0, legH + 0.05, -d / 2 + 0.08 + i * ((d - 0.16) / (n - 1)));
  } else {
    addRounded(g, fab, w, baseH, d, 0.03, 0, legH, 0);
  }

  // boki
  if (st.arm === 'slim' || st.arm === 'block') {
    for (const s of [-1, 1]) addRounded(g, fab, armW, st.armH - legH, d, st.arm === 'slim' ? 0.035 : 0.02, s * (w / 2 - armW / 2), legH, 0);
  } else if (st.arm === 'rolled') {
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - armW / 2);
      addRounded(g, fab, armW * 0.85, st.armH - legH - armW * 0.45, d, 0.03, x + s * 0.01, legH, 0);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(armW * 0.55, armW * 0.55, d, 24), fab);
      roll.rotation.x = Math.PI / 2;
      roll.position.set(x + s * 0.03, st.armH - armW * 0.5, 0);
      roll.castShadow = true;
      g.add(roll);
    }
  }

  const backZ = -d / 2 + 0.12;
  const seatD = d - 0.24;
  if (!open || !flat) {
    // oparcie
    if (st.back === 'mattress') {
      const back = addRounded(g, m('bedding'), inner - 0.02, 0.14, 0.62, 0.05, 0, 0, 0);
      back.rotation.x = -Math.PI / 2 + 0.25;
      back.position.set(0, seatTop + 0.29, -d / 2 + 0.16);
    } else {
      addRounded(g, fab, inner + (st.arm === 'none' ? 0 : 0.02), h - legH - baseH, 0.2, 0.05, 0, legH + baseH, backZ);
      if (st.back === 'cushions' && !open) {
        const n = Math.max(1, Math.round(inner / 0.7)), cw = inner / n;
        for (let i = 0; i < n; i++) addRounded(g, fab, cw - 0.03, 0.42, 0.16, 0.07, -inner / 2 + cw * (i + 0.5), seatTop - 0.02, backZ + 0.17);
      }
      if (st.back === 'tufted') {
        const btn = getMaterial('leather', '#3a2a20');
        const cols = Math.max(4, Math.round(inner / 0.18)), rows = 3;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), btn);
          b.position.set(-inner / 2 + 0.09 + (c + (r % 2) * 0.5) * ((inner - 0.18) / cols), seatTop + 0.08 + r * 0.11, backZ + 0.105);
          g.add(b);
        }
      }
    }
  }

  if (!open) {
    // siedziska
    if (st.seat === 'mattress') addRounded(g, m('bedding'), inner - 0.02, 0.15, seatD + 0.1, 0.05, 0, legH + 0.07, 0.04);
    else if (st.seat === 'bench') addRounded(g, fab, inner - 0.02, 0.14, seatD, 0.05, 0, legH + baseH, 0.1);
    else {
      const n = Math.max(1, Math.round(inner / 0.7)), cw = inner / n;
      for (let i = 0; i < n; i++) addRounded(g, fab, cw - 0.01, 0.14, seatD, 0.05, -inner / 2 + cw * (i + 0.5), legH + baseH, 0.1);
    }
  } else if (flat) {
    // click-clack / futon: oparcie położone – spanie wzdłuż kanapy, głębokość ok. 130 cm
    const L = 1.3;
    addRounded(g, m('bedding'), inner - 0.02, 0.14, L, 0.05, 0, legH + baseH, d / 2 - L / 2);
    addBox(g, m('legs'), inner * 0.9, legH + baseH, 0.03, 0, 0, d / 2 - L + 0.02);
    addRounded(g, getMaterial('fabric', '#ffffff'), 0.5, 0.1, 0.34, 0.04, -inner / 2 + 0.32, legH + baseH + 0.14, d / 2 - L + 0.25);
  } else {
    // delfin / amerykanka: materac wysunięty do przodu – spanie w poprzek, długość ok. 195 cm
    const L = 1.95, z0 = backZ + 0.1;
    addRounded(g, m('bedding'), inner - 0.02, 0.16, L, 0.05, 0, seatTop - 0.06, z0 + L / 2);
    legs4(g, m('legs'), inner - 0.1, 0.3, seatTop - 0.06, 0.015, 0.05, 0, z0 + L - 0.15);
    for (const s of inner > 1.3 ? [-1, 1] : [0]) addRounded(g, getMaterial('fabric', '#ffffff'), Math.min(0.55, inner / 2 - 0.06), 0.11, 0.34, 0.04, s * inner / 4, seatTop + 0.1, z0 + 0.24);
  }
  return g;
}

// ===================== BIURKO NAROŻNE =====================
const DESK_STYLES = {
  modern: { label: 'Nowoczesne (białe, metalowe ramy)', legs: 'frame', tt: 0.025 },
  scandi: { label: 'Skandynawskie (drewniane nogi)', legs: 'round', tt: 0.025 },
  industrial: { label: 'Industrialne (gruby blat, czarne ramy z poprzeczką)', legs: 'frameX', tt: 0.04 },
  gaming: { label: 'Gamingowe (czarne, podświetlenie LED)', legs: 'frame', tt: 0.025, led: true, monitor: true },
  office: { label: 'Biurowe (boki z płyty, panel osłonowy)', legs: 'panel', tt: 0.025, modesty: true },
  hutch: { label: 'Z nadstawką na książki', legs: 'panel', tt: 0.025, hutch: true },
  minimal: { label: 'Minimalistyczne (cienki blat, nogi hairpin)', legs: 'hairpin', tt: 0.018 },
};

function deskBuild(item, m) {
  const g = new THREE.Group();
  const { w, d, h } = item.m;
  const st = DESK_STYLES[item.p?.style] ?? DESK_STYLES.modern;
  const right = item.p?.side === 'right'; // strona, po której jest krótsze ramię (zwrot)
  const md = Math.min((item.p?.mainDepth ?? 70) / 100, d - 0.3), sd = Math.min((item.p?.sideDepth ?? 60) / 100, w - 0.3);
  const tt = st.tt, legH = h - tt;
  // x krawędzi ramienia bocznego
  const sOut = right ? w / 2 : -w / 2, sIn = right ? w / 2 - sd : -w / 2 + sd, xFree = right ? -w / 2 : w / 2;
  const dir = right ? 1 : -1; // od środka w stronę ramienia bocznego

  // blat w kształcie L z zaokrąglonym wewnętrznym narożnikiem
  const r = 0.12;
  const zi = -d / 2 + md; // przednia krawędź ramienia głównego
  // obrys w (x, z); q = narożnik zaokrąglony krzywą (punkt kontrolny cx, cz)
  const outline = right
    ? [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [w / 2 - sd, d / 2], [w / 2 - sd, zi + r], { cx: w / 2 - sd, cz: zi, x: w / 2 - sd - r, z: zi }, [-w / 2, zi]]
    : [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, zi], [-w / 2 + sd + r, zi], { cx: -w / 2 + sd, cz: zi, x: -w / 2 + sd, z: zi + r }, [-w / 2 + sd, d / 2], [-w / 2, d / 2]];
  const shape = new THREE.Shape();
  outline.forEach((p, i) => {
    if (Array.isArray(p)) i === 0 ? shape.moveTo(p[0], -p[1]) : shape.lineTo(p[0], -p[1]);
    else shape.quadraticCurveTo(p.cx, -p.cz, p.x, -p.z);
  });
  const topGeo = new THREE.ExtrudeGeometry(shape, { depth: tt, bevelEnabled: false });
  topGeo.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(topGeo, m('top'));
  top.position.y = legH;
  top.castShadow = top.receiveShadow = true;
  g.add(top);

  // podpory
  const ins = 0.05;
  const mainEnd = [[xFree - Math.sign(xFree) * ins, -d / 2 + ins], [xFree - Math.sign(xFree) * ins, -d / 2 + md - ins]];
  const sideEnd = [[sOut - dir * ins, d / 2 - ins], [sIn + dir * ins, d / 2 - ins]];
  const corner = [sOut - dir * ins, -d / 2 + ins];
  const legMat = m('legs');
  const frameAlongZ = (x, z0, z1) => { // rama: 2 nogi + poprzeczki
    for (const z of [z0, z1]) addBox(g, legMat, 0.05, legH, 0.05, x, 0, z);
    addBox(g, legMat, 0.05, 0.05, Math.abs(z1 - z0), x, legH - 0.05, (z0 + z1) / 2);
    addBox(g, legMat, 0.05, 0.03, Math.abs(z1 - z0), x, 0, (z0 + z1) / 2);
    if (st.legs === 'frameX') addBox(g, legMat, 0.03, 0.04, Math.abs(z1 - z0), x, legH * 0.25, (z0 + z1) / 2);
  };
  const frameAlongX = (z, x0, x1) => {
    for (const x of [x0, x1]) addBox(g, legMat, 0.05, legH, 0.05, x, 0, z);
    addBox(g, legMat, Math.abs(x1 - x0), 0.05, 0.05, (x0 + x1) / 2, legH - 0.05, z);
    addBox(g, legMat, Math.abs(x1 - x0), 0.03, 0.05, (x0 + x1) / 2, 0, z);
    if (st.legs === 'frameX') addBox(g, legMat, Math.abs(x1 - x0), 0.04, 0.03, (x0 + x1) / 2, legH * 0.25, z);
  };
  if (st.legs === 'frame' || st.legs === 'frameX') {
    frameAlongZ(mainEnd[0][0], mainEnd[0][1], mainEnd[1][1]);
    frameAlongX(sideEnd[0][1], sideEnd[0][0], sideEnd[1][0]);
    addBox(g, legMat, 0.05, legH, 0.05, corner[0], 0, corner[1]);
    if (st.legs === 'frameX') addBox(g, legMat, 0.03, 0.04, Math.abs(xFree - sOut) - 0.1, (xFree + sOut) / 2, legH * 0.25, -d / 2 + ins);
  } else if (st.legs === 'round') {
    for (const [x, z] of [...mainEnd, ...sideEnd, corner]) addCyl(g, legMat, 0.024, legH, x, 0, z, 16, 0.017);
    addBox(g, legMat, Math.abs(xFree - sOut) - 0.1, 0.07, 0.02, (xFree + sOut) / 2, legH - 0.07, -d / 2 + 0.03);
  } else if (st.legs === 'hairpin') {
    for (const [x, z] of [...mainEnd, ...sideEnd, corner]) {
      for (const s of [-1, 1]) {
        const rod = addCyl(g, legMat, 0.006, legH, x + s * 0.06, 0, z, 8);
        rod.rotation.z = s * 0.08;
      }
    }
  } else if (st.legs === 'panel') {
    // boki z płyty pod końcami ramion + panel w narożniku
    const body = m('body');
    addBox(g, body, T * 1.4, legH, md - 0.02, xFree - Math.sign(xFree) * (T * 0.7), 0, -d / 2 + md / 2);
    addBox(g, body, sd - 0.02, legH, T * 1.4, (sOut + sIn) / 2, 0, d / 2 - T * 0.7);
    addBox(g, body, T * 1.4, legH, md - 0.02, sOut - dir * T * 0.7, 0, -d / 2 + md / 2);
  }
  if (st.modesty || st.legs === 'panel') addBox(g, m('body'), Math.abs(xFree - sOut) - 0.06, legH * 0.55, T, (xFree + sOut) / 2, legH * 0.4, -d / 2 + 0.06);

  // kontener z szufladami pod ramieniem głównym
  if ((item.p?.drawers ?? 1) && legH > 0.5) {
    const cw = 0.42, ch = legH - 0.03, cd = Math.min(md - 0.08, 0.55);
    const cx = xFree - Math.sign(xFree) * (cw / 2 + (st.legs === 'panel' ? 0.04 : 0.12));
    const cg = new THREE.Group();
    carcass(cg, m('body'), cw, ch, cd - T, 0.01);
    cg.children.forEach((c) => (c.position.z -= T / 2));
    drawersCol(cg, item, m, 0, 0.01 + T, cw - 2 * T, ch - 2 * T, (cd - T) / 2 - T / 2, 3);
    cg.position.set(cx, 0, -d / 2 + 0.04 + cd / 2);
    g.add(cg);
  }

  // nadstawka z półkami wzdłuż ramienia głównego
  if (st.hutch || item.p?.hutch === 'yes') {
    const hx0 = Math.min(xFree, sIn), hx1 = Math.max(xFree, sIn), hw = hx1 - hx0, hd = 0.28, hh = 0.75;
    const hz = -d / 2 + hd / 2;
    for (const x of [hx0 + T / 2, hx1 - T / 2]) addBox(g, m('body'), T, hh, hd, x, h, hz);
    for (const y of [0.36, hh - T]) addBox(g, m('body'), hw, T, hd, (hx0 + hx1) / 2, h + y, hz);
    addBox(g, m('body'), hw, hh, 0.006, (hx0 + hx1) / 2, h, -d / 2 + 0.003);
  }

  // podstawka pod monitor
  if (st.monitor || item.p?.monitor === 'yes') {
    const mx = (xFree + sIn) / 2;
    addBox(g, m('legs'), 0.7, 0.012, 0.24, mx, h + 0.1, -d / 2 + 0.17);
    for (const s of [-1, 1]) addBox(g, m('legs'), 0.02, 0.1, 0.22, mx + s * 0.33, h, -d / 2 + 0.17);
  }

  // podświetlenie LED wzdłuż krawędzi (gamingowe)
  if (st.led) {
    const led = new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color(item.parts?.accent?.color ?? '#ff2d55'), emissiveIntensity: 1.6 });
    const len = Math.abs(xFree - sIn);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, 0.006), led);
    strip.position.set((xFree + sIn) / 2, legH + tt / 2, -d / 2 + md + 0.004);
    g.add(strip);
    const strip2 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, d - md - r), led);
    strip2.position.set(sIn - dir * 0.004, legH + tt / 2, (-d / 2 + md + r + d / 2) / 2);
    g.add(strip2);
  }
  return g;
}

export const EXTRA3 = {
  sofaBed: {
    label: 'Kanapa rozkładana (7 stylów)', cat: 'Salon', icon: '🛋', dims: { w: 220, d: 95, h: 88 },
    slots: { fabric: S.fabric('fabric', '#8a9199'), legs: S.legs('oak', '#ffffff'), bedding: { label: 'Materac / pościel (po rozłożeniu)', mat: 'fabric', color: '#f1eee8' } },
    params: {
      style: { label: 'Styl', options: Object.entries(SOFA_STYLES).map(([k, s]) => [k, s.label]), def: 'scandi' },
      mech: { label: 'Mechanizm spania', options: MECHANISMS, def: 'delfin' },
      state: { label: 'Stan', options: [['closed', 'Złożona'], ['open', 'Rozłożona do spania']], def: 'closed' },
    },
    build: sofaBedBuild,
  },
  cornerDesk: {
    label: 'Biurko narożne (7 stylów)', cat: 'Jadalnia i biuro', icon: '⌐', dims: { w: 160, d: 140, h: 75 },
    slots: { top: S.top('oak'), legs: { label: 'Nogi / rama', mat: 'blackMetal', color: '#222222' }, body: S.body('matt', '#f2f0eb'), front: S.front('matt', '#f2f0eb'), accent: { label: 'Kolor LED (gamingowe)', mat: 'gloss', color: '#ff2d55' } },
    handles: true, handleDefault: { type: 'edge', finish: 'black' },
    params: {
      style: { label: 'Styl', options: Object.entries(DESK_STYLES).map(([k, s]) => [k, s.label]), def: 'modern' },
      side: { label: 'Krótsze ramię (zwrot)', options: [['left', 'po lewej'], ['right', 'po prawej']], def: 'left' },
      hutch: { label: 'Nadstawka z półkami', options: [['no', 'nie'], ['yes', 'tak']], def: 'no' },
      monitor: { label: 'Podstawka pod monitor', options: [['no', 'nie'], ['yes', 'tak']], def: 'no' },
      drawers: { label: 'Kontener z szufladami (0/1)', min: 0, max: 1, def: 1 },
      mainDepth: { label: 'Głębokość ramienia głównego [cm]', min: 40, max: 100, def: 70 },
      sideDepth: { label: 'Szerokość zwrotu [cm]', min: 40, max: 100, def: 60 },
    },
    build: deskBuild,
  },
};

Object.assign(CATALOG, EXTRA3);
export { SOFA_STYLES, DESK_STYLES };

// Materiały: proceduralne tekstury (offline) + tekstury CC0 z Poly Haven (online).
import * as THREE from 'three';

const texCache = new Map();
const matCache = new Map();

// ---------- pomocnicze: szum ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade([r, g, b], f) {
  return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
}

// ---------- generatory tekstur ----------
function woodCanvas(base, seed, planks = false) {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  const rgb = hexToRgb(base);
  const r = rng(seed);
  const rows = planks ? 6 : 1;
  const rowH = size / rows;
  for (let row = 0; row < rows; row++) {
    const offset = planks ? r() * size : 0;
    const tone = planks ? 0.88 + r() * 0.24 : 1;
    g.save();
    g.beginPath();
    g.rect(0, row * rowH, size, rowH);
    g.clip();
    g.fillStyle = shade(rgb, tone);
    g.fillRect(0, row * rowH, size, rowH);
    // słoje
    const lines = planks ? 14 : 70;
    for (let i = 0; i < lines; i++) {
      const y0 = row * rowH + r() * rowH;
      const amp = 2 + r() * (planks ? 4 : 10);
      const freq = 0.004 + r() * 0.012;
      const ph = r() * 10;
      g.strokeStyle = shade(rgb, tone * (0.72 + r() * 0.2));
      g.globalAlpha = 0.25 + r() * 0.35;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      for (let x = 0; x <= size; x += 8) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
    if (planks) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, row * rowH, size, 2);
      // łączenia czołowe desek
      const jx = (offset + size / 2) % size;
      g.fillRect(jx, row * rowH, 2, rowH);
    }
  }
  return c;
}

function tilesCanvas(base, grout, cols, rows, seed) {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  const rgb = hexToRgb(base);
  const r = rng(seed);
  g.fillStyle = grout;
  g.fillRect(0, 0, size, size);
  const tw = size / cols, th = size / rows, gap = 3;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = shade(rgb, 0.94 + r() * 0.1);
      g.fillRect(x * tw + gap / 2, y * th + gap / 2, tw - gap, th - gap);
    }
  }
  return c;
}

function noiseCanvas(base, amount, seed, speckle = 0) {
  const size = 256;
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const rgb = hexToRgb(base);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    let f = 1 + (r() - 0.5) * amount;
    if (speckle && r() < speckle) f *= 0.6;
    img.data[i * 4] = Math.min(255, rgb[0] * f);
    img.data[i * 4 + 1] = Math.min(255, rgb[1] * f);
    img.data[i * 4 + 2] = Math.min(255, rgb[2] * f);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function fabricCanvas(base, seed) {
  const size = 256;
  const c = noiseCanvas(base, 0.12, seed);
  const g = c.getContext('2d');
  g.globalAlpha = 0.12;
  g.strokeStyle = '#000';
  for (let i = 0; i < size; i += 3) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, size); g.stroke();
    g.beginPath(); g.moveTo(0, i + 1); g.lineTo(size, i + 1); g.stroke();
  }
  return c;
}

function marbleCanvas(base, vein, seed) {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = vein;
  for (let i = 0; i < 18; i++) {
    g.globalAlpha = 0.1 + r() * 0.35;
    g.lineWidth = 0.5 + r() * 2.5;
    g.beginPath();
    let x = r() * size, y = 0;
    g.moveTo(x, y);
    while (y < size) {
      x += (r() - 0.5) * 40;
      y += 10 + r() * 30;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return c;
}

function herringboneCanvas(base, seed) {
  const size = 512;
  const c = canvas(size);
  const g = c.getContext('2d');
  const rgb = hexToRgb(base);
  const r = rng(seed);
  g.fillStyle = shade(rgb, 0.7);
  g.fillRect(0, 0, size, size);
  const L = 128, W = 32;
  for (let y = -L; y < size + L; y += W * 2) {
    for (let x = -L; x < size + L; x += L) {
      for (const dir of [1, -1]) {
        g.save();
        g.translate(x + (dir === 1 ? 0 : L / 2), y);
        g.rotate((dir * Math.PI) / 4);
        g.fillStyle = shade(rgb, 0.85 + r() * 0.25);
        g.fillRect(0, 0, L * 0.7, W * 0.7 - 1);
        g.restore();
      }
    }
  }
  return c;
}

// ---------- definicje materiałów ----------
// size = ile metrów pokrywa jedna kopia tekstury
export const MATERIALS = {
  matt:        { label: 'Lakier mat', group: 'Lakiery', roughness: 0.75, metalness: 0, defaultColor: '#f2f0eb' },
  satin:       { label: 'Lakier satyna', group: 'Lakiery', roughness: 0.45, metalness: 0, defaultColor: '#f2f0eb' },
  gloss:       { label: 'Lakier połysk', group: 'Lakiery', roughness: 0.08, metalness: 0, clearcoat: 1, defaultColor: '#ffffff' },
  oak:         { label: 'Dąb naturalny', group: 'Drewno', tex: () => woodCanvas('#c49a6c', 11), size: 0.8, roughness: 0.6, tint: true },
  oakLight:    { label: 'Dąb bielony', group: 'Drewno', tex: () => woodCanvas('#ddc6a5', 12), size: 0.8, roughness: 0.6, tint: true },
  walnut:      { label: 'Orzech', group: 'Drewno', tex: () => woodCanvas('#6b4730', 13), size: 0.8, roughness: 0.55, tint: true },
  ash:         { label: 'Jesion', group: 'Drewno', tex: () => woodCanvas('#d8c3a0', 14), size: 0.8, roughness: 0.6, tint: true },
  pine:        { label: 'Sosna', group: 'Drewno', tex: () => woodCanvas('#e2bd84', 15), size: 0.8, roughness: 0.65, tint: true },
  wenge:       { label: 'Wenge', group: 'Drewno', tex: () => woodCanvas('#3d2b22', 16), size: 0.8, roughness: 0.55, tint: true },
  fabric:      { label: 'Tkanina', group: 'Tapicerka', tex: (c) => fabricCanvas(c, 21), size: 0.15, roughness: 0.95, defaultColor: '#8a9199', bake: true },
  velvet:      { label: 'Welur', group: 'Tapicerka', tex: (c) => noiseCanvas(c, 0.18, 22), size: 0.3, roughness: 0.85, sheen: 1, defaultColor: '#2f5d50', bake: true },
  leather:     { label: 'Skóra', group: 'Tapicerka', tex: (c) => noiseCanvas(c, 0.1, 23, 0.02), size: 0.2, roughness: 0.45, defaultColor: '#7a4a2a', bake: true },
  steel:       { label: 'Stal szczotkowana', group: 'Metal', roughness: 0.35, metalness: 1, defaultColor: '#c8cacc' },
  chrome:      { label: 'Chrom', group: 'Metal', roughness: 0.05, metalness: 1, defaultColor: '#ffffff' },
  blackMetal:  { label: 'Czarny metal mat', group: 'Metal', roughness: 0.6, metalness: 0.7, defaultColor: '#222222' },
  brass:       { label: 'Mosiądz', group: 'Metal', roughness: 0.3, metalness: 1, defaultColor: '#c9a447' },
  glass:       { label: 'Szkło', group: 'Inne', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, defaultColor: '#dfeef0' },
  marble:      { label: 'Marmur', group: 'Kamień', tex: () => marbleCanvas('#eceae6', '#7d7d80', 31), size: 1.2, roughness: 0.2, tint: true },
  marbleBlack: { label: 'Marmur czarny', group: 'Kamień', tex: () => marbleCanvas('#202022', '#c9c4b8', 32), size: 1.2, roughness: 0.2, tint: true },
  granite:     { label: 'Granit', group: 'Kamień', tex: () => noiseCanvas('#55575a', 0.6, 33, 0.08), size: 0.4, roughness: 0.3, tint: true },
  concrete:    { label: 'Beton', group: 'Kamień', tex: () => noiseCanvas('#9a9893', 0.22, 34, 0.01), size: 1.5, roughness: 0.9, tint: true },
  ceramic:     { label: 'Ceramika', group: 'Inne', roughness: 0.1, metalness: 0, defaultColor: '#fafafa' },
  // podłogi
  floorOak:    { label: 'Panele dąb', group: 'Podłogi', tex: () => woodCanvas('#c49a6c', 41, true), size: 1.2, roughness: 0.55, tint: true },
  floorWalnut: { label: 'Panele orzech', group: 'Podłogi', tex: () => woodCanvas('#6b4730', 42, true), size: 1.2, roughness: 0.55, tint: true },
  floorGrey:   { label: 'Panele szary dąb', group: 'Podłogi', tex: () => woodCanvas('#a39d94', 43, true), size: 1.2, roughness: 0.6, tint: true },
  herringbone: { label: 'Jodełka', group: 'Podłogi', tex: () => herringboneCanvas('#b98d5e', 44), size: 1.0, roughness: 0.55, tint: true },
  tiles60:     { label: 'Płytki 60×60', group: 'Podłogi', tex: () => tilesCanvas('#d9d6d0', '#a9a49c', 2, 2, 45), size: 1.2, roughness: 0.3, tint: true },
  tiles30:     { label: 'Płytki 30×30', group: 'Podłogi', tex: () => tilesCanvas('#ece9e4', '#9c968c', 4, 4, 46), size: 1.2, roughness: 0.3, tint: true },
  metro:       { label: 'Płytki metro', group: 'Podłogi', tex: () => tilesCanvas('#f4f4f2', '#b8b8b4', 4, 8, 47), size: 0.6, roughness: 0.15, tint: true },
  carpet:      { label: 'Wykładzina', group: 'Podłogi', tex: (c) => noiseCanvas(c, 0.3, 48), size: 0.2, roughness: 1, defaultColor: '#8c8378', bake: true },
  paint:       { label: 'Farba ścienna', group: 'Ściany', roughness: 0.9, metalness: 0, defaultColor: '#efeae2' },
};

export const PH_PREFIX = 'ph:';
const phMaterials = {}; // id -> { label, maps }

export function materialLabel(key) {
  if (key?.startsWith(PH_PREFIX)) return phMaterials[key.slice(3)]?.label ?? key.slice(3);
  return MATERIALS[key]?.label ?? key;
}

export function materialOptions() {
  const groups = {};
  for (const [k, m] of Object.entries(MATERIALS)) (groups[m.group] ??= []).push([k, m.label]);
  const ph = Object.entries(phMaterials).map(([id, m]) => [PH_PREFIX + id, m.label]);
  if (ph.length) groups['Poly Haven (CC0)'] = ph;
  return groups;
}

export function defaultColorFor(key) {
  const m = MATERIALS[key];
  if (!m) return '#ffffff';
  return m.defaultColor ?? '#ffffff';
}

function makeTexture(key, def, color) {
  const ck = def.bake ? `${key}|${color}` : key;
  if (texCache.has(ck)) return texCache.get(ck);
  const t = new THREE.CanvasTexture(def.tex(color));
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / def.size, 1 / def.size);
  texCache.set(ck, t);
  return t;
}

/** Zwraca (współdzielony) materiał dla klucza i koloru. */
export function getMaterial(key, color) {
  if (key?.startsWith(PH_PREFIX)) {
    const id = key.slice(3);
    const ck = `${key}|${color}`;
    if (matCache.has(ck)) return matCache.get(ck);
    const ph = phMaterials[id];
    const mat = new THREE.MeshStandardMaterial({ color: color || '#ffffff', roughness: 0.8 });
    if (ph?.maps) Object.assign(mat, ph.maps);
    if (ph?.maps?.roughnessMap) mat.roughness = 1;
    matCache.set(ck, mat);
    return mat;
  }
  const def = MATERIALS[key] ?? MATERIALS.matt;
  const col = color || defaultColorFor(key);
  const ck = `${key}|${col}`;
  if (matCache.has(ck)) return matCache.get(ck);
  const opts = {
    color: def.bake ? '#ffffff' : col,
    roughness: def.roughness ?? 0.7,
    metalness: def.metalness ?? 0,
  };
  if (def.tex) opts.map = makeTexture(key, def, col);
  if (def.bake && def.tex) opts.bumpMap = opts.map, (opts.bumpScale = 0.6);
  let mat;
  if (def.clearcoat || def.sheen) {
    mat = new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: def.clearcoat ?? 0, clearcoatRoughness: 0.05, sheen: def.sheen ?? 0, sheenColor: new THREE.Color(col) });
  } else {
    mat = new THREE.MeshStandardMaterial(opts);
  }
  if (def.transparent) {
    mat.transparent = true;
    mat.opacity = def.opacity;
    mat.depthWrite = false;
  }
  matCache.set(ck, mat);
  return mat;
}

/** Rejestruje teksturę pobraną z Poly Haven (mapy: map, normalMap, roughnessMap). */
export function registerPolyHavenMaterial(id, label, maps, sizeMeters = 1) {
  for (const t of Object.values(maps)) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / sizeMeters, 1 / sizeMeters);
    t.anisotropy = 8;
  }
  phMaterials[id] = { label, maps };
  for (const k of [...matCache.keys()]) if (k.startsWith(PH_PREFIX + id + '|')) matCache.delete(k);
}

export function isPolyHavenLoaded(id) {
  return !!phMaterials[id];
}

// ---------- uchwyty ----------
export const HANDLE_TYPES = {
  none:    'Bez uchwytu (tip-on)',
  bar:     'Reling (uchwyt drążkowy)',
  barLong: 'Reling długi',
  knob:    'Gałka',
  cup:     'Muszelka',
  ring:    'Pierścień',
  edge:    'Krawędziowy (profil na górze)',
  gola:    'Listwa frezowana (gola)',
  leather: 'Skórzany pasek',
};

export const HANDLE_FINISHES = {
  chrome:    { label: 'Chrom', mat: 'chrome', color: '#ffffff' },
  steel:     { label: 'Stal szczotkowana', mat: 'steel', color: '#c8cacc' },
  black:     { label: 'Czarny mat', mat: 'blackMetal', color: '#1c1c1c' },
  brass:     { label: 'Mosiądz', mat: 'brass', color: '#c9a447' },
  gold:      { label: 'Złoto szczotkowane', mat: 'brass', color: '#d8b35a' },
  copper:    { label: 'Miedź', mat: 'brass', color: '#c27a4a' },
  graphite:  { label: 'Grafit', mat: 'blackMetal', color: '#4a4c50' },
  white:     { label: 'Biały', mat: 'satin', color: '#f5f5f5' },
  wood:      { label: 'Drewno dąb', mat: 'oak', color: '#ffffff' },
  leatherBr: { label: 'Skóra brązowa', mat: 'leather', color: '#6b3f22' },
};

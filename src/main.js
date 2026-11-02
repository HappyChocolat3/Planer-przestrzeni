import { Store, emptyProject, sampleProject } from './state.js';
import { Viewer } from './scene.js';
import { CATALOG, newItem, catalogByCategory } from './furniture.js';
import { MATERIALS, HANDLE_TYPES, HANDLE_FINISHES, materialOptions, materialLabel, defaultColorFor, PH_PREFIX } from './materials.js';
import * as PH from './polyhaven.js';
import { Box3, Vector3 } from 'three';

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};

const store = new Store();
const viewer = new Viewer($('#view'), store);
window.planer = { store, viewer }; // do debugowania w konsoli

// Popularne kolory frontów i tapicerek (palety producentów płyt i farb)
const SWATCHES = [
  ['#ffffff', 'Biały'], ['#f2f0eb', 'Biały ciepły'], ['#e8e0d0', 'Kaszmir'], ['#d6cbb8', 'Beż'],
  ['#b8b2a7', 'Szary kamienny'], ['#8d8f8f', 'Szary'], ['#4a4d50', 'Antracyt'], ['#222222', 'Czarny'],
  ['#8a9a7b', 'Szałwia'], ['#4f6b55', 'Butelkowa zieleń'], ['#2e3e57', 'Granat'], ['#6d8fa6', 'Niebieski gołębi'],
  ['#c2714f', 'Terakota'], ['#a8453b', 'Bordo'], ['#d9a441', 'Musztarda'], ['#e7c9c1', 'Pudrowy róż'],
];

// ---------- katalog ----------
function renderCatalog(filter = '') {
  const root = $('#catalog');
  root.innerHTML = '';
  const f = filter.trim().toLowerCase();
  for (const [cat, entries] of Object.entries(catalogByCategory())) {
    const list = entries.filter(([, d]) => !f || d.label.toLowerCase().includes(f) || cat.toLowerCase().includes(f));
    if (!list.length) continue;
    root.append(h('h3', {}, cat));
    for (const [type, d] of list) {
      root.append(
        h('button', {
          class: 'cat-item', draggable: 'true', title: 'Kliknij, aby dodać, lub przeciągnij na plan',
          onclick: () => addItem(type),
          ondragstart: (e) => e.dataTransfer.setData('text/plain', type),
        },
        h('span', { class: 'ic' }, d.icon),
        h('span', { class: 'lb' }, d.label, h('small', {}, `${d.dims.w}×${d.dims.d}×${d.dims.h} cm`))),
      );
    }
  }
}
$('#catSearch').addEventListener('input', (e) => renderCatalog(e.target.value));

function addItem(type, at) {
  const item = newItem(type);
  const pos = at ?? freeSpot(item);
  Object.assign(item, viewer.constrain(item, pos.x, pos.z));
  store.project.items.push(item);
  store.commit('add');
  viewer.rebuildItem(item.id);
  viewer.select(item.id);
}

function extents(it) {
  const a = (it.rot * Math.PI) / 180;
  return [(Math.abs(Math.cos(a)) * it.w + Math.abs(Math.sin(a)) * it.d) / 2, (Math.abs(Math.sin(a)) * it.w + Math.abs(Math.cos(a)) * it.d) / 2];
}

/** Najbliższe środka pokoju wolne miejsce (bez kolizji z innymi meblami). */
function freeSpot(item) {
  const room = store.project.room;
  const others = store.project.items.filter((t) => t.type !== 'rug' && t.type !== 'door' && t.type !== 'window');
  const [hx, hz] = extents(item);
  const cands = [];
  for (let x = -room.w / 2 + hx; x <= room.w / 2 - hx; x += 10) for (let z = -room.d / 2 + hz; z <= room.d / 2 - hz; z += 10) cands.push([x, z]);
  cands.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  for (const [x, z] of cands) {
    const free = others.every((t) => {
      const [tx, tz] = extents(t);
      return Math.abs(t.x - x) >= tx + hx || Math.abs(t.z - z) >= tz + hz;
    });
    if (free) return { x, z };
  }
  return { x: 0, z: 0 };
}

// przeciąganie z katalogu na widok
const view = $('#view');
view.addEventListener('dragover', (e) => e.preventDefault());
view.addEventListener('drop', (e) => {
  e.preventDefault();
  const type = e.dataTransfer.getData('text/plain');
  if (!CATALOG[type]) return;
  const p = viewer.floorPoint(e);
  addItem(type, p ? { x: p.x * 100, z: p.z * 100 } : undefined);
});

// ---------- panel właściwości ----------
function numField(label, value, onChange, opts = {}) {
  const input = h('input', { type: 'number', value, step: opts.step ?? 1, min: opts.min, max: opts.max });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) return;
    if (opts.min != null) v = Math.max(opts.min, v);
    if (opts.max != null) v = Math.min(opts.max, v);
    onChange(v);
  });
  return h('label', { class: 'field' }, h('span', {}, label), input, opts.unit ? h('em', {}, opts.unit) : null);
}

function materialSelect(value, onChange) {
  const sel = h('select', { onchange: () => onChange(sel.value) });
  for (const [group, opts] of Object.entries(materialOptions())) {
    const og = h('optgroup', { label: group });
    for (const [k, lab] of opts) og.append(h('option', { value: k, selected: k === value }, lab));
    sel.append(og);
  }
  if (value?.startsWith(PH_PREFIX) && !sel.querySelector(`option[value="${CSS.escape(value)}"]`)) {
    sel.append(h('option', { value, selected: true }, materialLabel(value) + ' (wczytywanie…)'));
  }
  return sel;
}

function colorRow(value, onChange) {
  const input = h('input', { type: 'color', value });
  input.addEventListener('input', () => onChange(input.value, false));
  input.addEventListener('change', () => onChange(input.value, true));
  const sw = h('div', { class: 'swatches' },
    SWATCHES.map(([c, n]) => h('button', { class: 'sw' + (c === value ? ' on' : ''), style: `background:${c}`, title: n, onclick: () => onChange(c, true) })));
  return h('div', { class: 'color-row' }, input, sw);
}

/** Edytor jednej "części" (materiał + kolor). */
function partEditor(label, part, apply, isTexture) {
  const box = h('div', { class: 'part' });
  const head = h('div', { class: 'part-head' }, h('b', {}, label));
  const sel = materialSelect(part.mat, (mat) => {
    part.mat = mat;
    part.color = mat.startsWith(PH_PREFIX) ? '#ffffff' : defaultColorFor(mat);
    apply(true);
    renderProps();
  });
  const tinted = part.mat.startsWith(PH_PREFIX) || MATERIALS[part.mat]?.tint;
  box.append(head, sel,
    h('div', { class: 'sub' }, tinted ? 'Odcień (biały = naturalny kolor materiału)' : 'Kolor'),
    colorRow(part.color, (c, done) => {
      part.color = c;
      apply(done);
      if (done) renderProps();
    }));
  return box;
}

function renderProps() {
  const root = $('#props');
  root.innerHTML = '';
  const id = viewer.selectedId;
  const item = id && store.item(id);
  if (!item) return renderRoomProps(root);
  const def = CATALOG[item.type];
  const rebuild = (done = true) => {
    viewer.rebuildItem(item.id);
    if (done) store.commit();
  };

  root.append(
    h('div', { class: 'props-head' },
      h('input', { class: 'name', value: item.name, onchange: (e) => { item.name = e.target.value; store.commit(); renderList(); } }),
      h('div', { class: 'row-btns' },
        h('button', { title: 'Obróć -90°', onclick: () => rotate(-90) }, '⟲ 90°'),
        h('button', { title: 'Obróć +90°', onclick: () => rotate(90) }, '⟳ 90°'),
        h('button', { title: 'Duplikuj (Ctrl+D)', onclick: duplicate }, '⧉ Duplikuj'),
        h('button', { class: 'danger', title: 'Usuń (Del)', onclick: removeSelected }, '🗑 Usuń'),
      )),
  );

  const sec = (title, ...kids) => root.append(h('section', { class: 'sec' }, h('h4', {}, title), ...kids));

  sec('Wymiary',
    h('div', { class: 'grid3' },
      numField('Szer.', item.w, (v) => { item.w = v; fixPos(item); rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
      numField('Głęb.', item.d, (v) => { item.d = v; fixPos(item); rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
      numField('Wys.', item.h, (v) => { item.h = v; rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
    ),
    presetButtons(item, rebuild),
  );
  sec('Położenie',
    h('div', { class: 'grid2' },
      numField('X', item.x, (v) => { item.x = v; rebuild(); }, { unit: 'cm' }),
      numField('Z', item.z, (v) => { item.z = v; rebuild(); }, { unit: 'cm' }),
      numField('Obrót', item.rot, (v) => { item.rot = ((v % 360) + 360) % 360; rebuild(); }, { unit: '°', step: 15 }),
      numField('Od podłogi', item.elev ?? 0, (v) => { item.elev = v; rebuild(); }, { min: 0, unit: 'cm' }),
    ),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !!item.locked, onchange: (e) => { item.locked = e.target.checked; store.commit(); } }),
      ' Zablokuj (nie przesuwaj myszą)'),
  );

  if (def?.params) {
    sec('Konfiguracja', h('div', { class: 'grid2' },
      Object.entries(def.params).map(([k, p]) => numField(p.label, item.p?.[k] ?? p.def, (v) => { (item.p ??= {})[k] = Math.round(v); rebuild(); }, { min: p.min, max: p.max }))));
  }

  if (def?.slots) {
    sec('Kolory i materiały',
      Object.entries(def.slots).map(([k, s]) => {
        item.parts[k] ??= { mat: s.mat, color: s.color };
        return partEditor(s.label, item.parts[k], rebuild);
      }),
      h('button', { class: 'small', onclick: () => applyToSameType(item) }, 'Zastosuj kolory/uchwyty do wszystkich: ' + def.label),
      h('button', { class: 'small', onclick: () => applyFrontsToAll(item) }, 'Zastosuj fronty i uchwyty do wszystkich szafek'),
    );
  }

  if (def?.handles) {
    const types = def.handleTypes ?? HANDLE_TYPES;
    const hType = h('select', { onchange: (e) => { item.handle.type = e.target.value; rebuild(); } },
      Object.entries(types).map(([k, l]) => h('option', { value: k, selected: k === item.handle.type }, l)));
    const finishes = h('div', { class: 'finishes' },
      Object.entries(HANDLE_FINISHES).map(([k, f]) =>
        h('button', {
          class: 'fin' + (k === item.handle.finish ? ' on' : ''), title: f.label,
          onclick: () => { item.handle.finish = k; rebuild(); renderProps(); },
        }, h('i', { style: `background:${f.color}`, class: 'm-' + f.mat }), f.label)));
    const extra = [];
    if (['kBase', 'kTall', 'kWall', 'fridge'].includes(item.type)) {
      extra.push(h('label', { class: 'field' }, h('span', {}, 'Zawiasy (1 drzwi)'),
        h('select', { onchange: (e) => { item.hinge = e.target.value; rebuild(); } },
          h('option', { value: 'left', selected: item.hinge !== 'right' }, 'lewe'),
          h('option', { value: 'right', selected: item.hinge === 'right' }, 'prawe'))));
    }
    sec('Uchwyty', hType, h('div', { class: 'sub' }, 'Wykończenie'), finishes, ...extra);
  }

  if (item.type === 'gltf') {
    sec('Model 3D',
      h('div', { class: 'sub' }, 'Odcień (biały = oryginalne tekstury)'),
      colorRow(item.tint ?? '#ffffff', (c, done) => { item.tint = c; rebuild(done); if (done) renderProps(); }),
      item.credit ? h('p', { class: 'credit' }, 'Źródło: ', item.page ? h('a', { href: item.page, target: '_blank', rel: 'noopener' }, item.credit) : item.credit) : null,
      h('button', { class: 'small', onclick: () => { const s = viewer.gltfCache.get(item.src); if (s) { resetModelSize(item, s); rebuild(); renderProps(); } } }, 'Przywróć oryginalny rozmiar'),
    );
  }
}

function presetButtons(item, rebuild) {
  const presets = {
    bed: [[90, 200], [120, 200], [140, 200], [160, 200], [180, 200], [200, 200]],
    kBase: [[30], [40], [45], [50], [60], [80], [90], [100]],
    kDrawers: [[40], [50], [60], [80], [90]],
    kWall: [[30], [40], [45], [50], [60], [80], [90]],
    kSink: [[60], [80], [90], [100]],
    wardrobe: [[50], [100], [150], [200], [250]],
    sofa: [[150], [180], [210], [240]],
    table: [[120, 80], [140, 90], [160, 90], [200, 100]],
    door: [[70], [80], [90], [100]],
    window: [[60], [90], [120], [150], [180]],
    rug: [[120, 170], [160, 230], [200, 300], [250, 350]],
  }[item.type];
  if (!presets) return null;
  return h('div', { class: 'presets' }, h('span', {}, 'Typowe:'),
    presets.map(([w, d]) => h('button', { onclick: () => { item.w = w; if (d) item.d = d; fixPos(item); rebuild(); renderProps(); } }, d ? `${w}×${d}` : `${w}`)));
}

function fixPos(item) {
  Object.assign(item, viewer.constrain(item, item.x, item.z));
}

function applyToSameType(src) {
  for (const it of store.project.items) {
    if (it.type !== src.type || it.id === src.id) continue;
    it.parts = structuredClone(src.parts);
    if (src.handle) it.handle = { ...src.handle };
    viewer.rebuildItem(it.id);
  }
  store.commit();
}

function applyFrontsToAll(src) {
  for (const it of store.project.items) {
    const def = CATALOG[it.type];
    if (!def?.handles || it.id === src.id || it.type === 'door') continue;
    for (const k of ['front', 'body', 'top']) if (src.parts[k] && it.parts[k]) it.parts[k] = { ...src.parts[k] };
    if (src.handle && src.type !== 'door') it.handle = { ...src.handle };
    viewer.rebuildItem(it.id);
  }
  store.commit();
}

function renderRoomProps(root) {
  const room = store.project.room;
  const rebuild = (done = true) => {
    viewer.rebuildRoom();
    if (done) store.commit();
  };
  root.append(h('div', { class: 'props-head' }, h('input', { class: 'name', value: store.project.name, onchange: (e) => { store.project.name = e.target.value; store.commit(); } })));
  root.append(h('section', { class: 'sec' }, h('h4', {}, 'Pomieszczenie'),
    h('div', { class: 'grid3' },
      numField('Szer.', room.w, (v) => { room.w = v; rebuild(); viewer.resetCamera(); }, { min: 100, max: 3000, unit: 'cm' }),
      numField('Dł.', room.d, (v) => { room.d = v; rebuild(); viewer.resetCamera(); }, { min: 100, max: 3000, unit: 'cm' }),
      numField('Wys.', room.h, (v) => { room.h = v; rebuild(); }, { min: 180, max: 600, unit: 'cm' })),
    h('label', { class: 'field' }, h('span', {}, 'Ściany'),
      h('select', { onchange: (e) => { room.wallMode = e.target.value; store.commit(); } },
        [['auto', 'automatycznie ukrywaj przednie'], ['show', 'zawsze pokazuj'], ['hidden', 'ukryj wszystkie']].map(([v, l]) => h('option', { value: v, selected: room.wallMode === v }, l)))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: viewer.showGrid, onchange: (e) => { viewer.showGrid = e.target.checked; viewer.grid.visible = viewer.mode === '2d' || viewer.showGrid; } }), ' Siatka 50 cm w widoku 3D'),
  ));
  root.append(h('section', { class: 'sec' }, h('h4', {}, 'Podłoga i ściany'),
    partEditor('Podłoga', room.floor, rebuild),
    partEditor('Ściany', room.walls, rebuild)));
  root.append(h('section', { class: 'sec' }, h('h4', {}, `Elementy (${store.project.items.length})`), h('div', { id: 'itemList', class: 'item-list' })));
  renderList();
}

function renderList() {
  const list = $('#itemList');
  if (!list) return;
  list.innerHTML = '';
  for (const it of store.project.items) {
    list.append(h('div', { class: 'li' },
      h('button', { class: 'li-name', onclick: () => viewer.select(it.id) }, it.name, h('small', {}, ` ${it.w}×${it.d}×${it.h}`)),
      h('button', { class: 'li-del', title: 'Usuń', onclick: () => { removeItem(it.id); } }, '✕')));
  }
}

// ---------- akcje ----------
function rotate(deg) {
  const it = store.item(viewer.selectedId);
  if (!it) return;
  it.rot = (((it.rot + deg) % 360) + 360) % 360;
  fixPos(it);
  viewer.rebuildItem(it.id);
  store.commit();
  renderProps();
}

function removeItem(id) {
  store.project.items = store.project.items.filter((i) => i.id !== id);
  viewer.removeItemObject(id);
  if (viewer.selectedId === id) viewer.select(null);
  store.commit('remove');
  renderProps();
}

function removeSelected() {
  if (viewer.selectedId) removeItem(viewer.selectedId);
}

function duplicate() {
  const it = store.item(viewer.selectedId);
  if (!it) return;
  const copy = structuredClone(it);
  copy.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
  const a = (it.rot * Math.PI) / 180;
  // obok oryginału, wzdłuż szerokości
  Object.assign(copy, viewer.constrain(copy, it.x + Math.cos(a) * it.w, it.z + Math.sin(a) * it.w));
  store.project.items.push(copy);
  store.commit('add');
  viewer.rebuildItem(copy.id);
  viewer.select(copy.id);
}

function nudge(dx, dz) {
  const it = store.item(viewer.selectedId);
  if (!it) return;
  const step = viewer.snap || 1;
  Object.assign(it, viewer.constrain(it, it.x + dx * step, it.z + dz * step));
  viewer.rebuildItem(it.id);
  store.commit();
  renderProps();
}

viewer.onSelect = () => renderProps();
viewer.onItemMoved = (item, done) => {
  if (done) {
    store.commit();
    renderProps();
  }
};

store.onChange((kind) => {
  if (kind === 'replace') {
    loadPhTextures().finally(() => {
      viewer.rebuildRoom();
      viewer.rebuildAll();
      renderProps();
    });
  }
  if (kind === 'add' || kind === 'remove') renderList();
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); }
  else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); }
  else if (ctrl && k === 'd') { e.preventDefault(); duplicate(); }
  else if (k === 'delete' || k === 'backspace') removeSelected();
  else if (k === 'r') rotate(e.shiftKey ? -90 : 90);
  else if (k === 'q') rotate(-15);
  else if (k === 'e') rotate(15);
  else if (k === 'escape') viewer.select(null);
  else if (e.key.startsWith('Arrow') && viewer.selectedId) {
    e.preventDefault();
    const [dx, dz] = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    nudge(dx, dz);
  }
});

// ---------- pasek narzędzi ----------
function download(name, href) {
  const a = h('a', { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
}
const safeName = () => (store.project.name || 'projekt').replace(/[^\p{L}\p{N}_-]+/gu, '_');

const actions = {
  new: () => confirm('Utworzyć nowy, pusty projekt? Bieżący możesz najpierw zapisać.') && (viewer.select(null), store.replace(emptyProject())),
  sample: () => confirm('Wczytać projekt przykładowy (zastąpi bieżący)?') && (viewer.select(null), store.replace(sampleProject())),
  open: () => $('#fileOpen').click(),
  save: () => {
    const blob = new Blob([JSON.stringify(store.project, null, 2)], { type: 'application/json' });
    download(safeName() + '.json', URL.createObjectURL(blob));
  },
  png: () => {
    const sel = viewer.selectedId;
    viewer.select(null);
    download(safeName() + '.png', viewer.screenshot());
    if (sel) viewer.select(sel);
  },
  csv: () => {
    const rows = [['Nazwa', 'Typ', 'Szerokość [cm]', 'Głębokość [cm]', 'Wysokość [cm]', 'Materiały', 'Uchwyty']];
    for (const it of store.project.items) {
      const def = CATALOG[it.type];
      const mats = Object.entries(it.parts ?? {}).map(([k, p]) => `${def?.slots?.[k]?.label ?? k}: ${materialLabel(p.mat)} ${p.color}`).join('; ');
      const hd = it.handle && it.handle.type !== 'none' ? `${(def.handleTypes ?? HANDLE_TYPES)[it.handle.type]} – ${HANDLE_FINISHES[it.handle.finish]?.label}` : '';
      rows.push([it.name, def?.label ?? 'Model 3D', it.w, it.d, it.h, mats, hd]);
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(safeName() + '-lista.csv', URL.createObjectURL(new Blob([csv], { type: 'text/csv' })));
  },
  undo: () => store.undo(),
  redo: () => store.redo(),
  camera: () => viewer.resetCamera(),
  polyhaven: () => openPolyHaven(),
  import: () => $('#fileModel').click(),
  help: () => $('#helpDialog').showModal(),
};
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));

$('#viewMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b) return;
  document.querySelectorAll('#viewMode button').forEach((x) => x.classList.toggle('on', x === b));
  viewer.setMode(b.dataset.mode);
});
$('#snap').addEventListener('change', (e) => (viewer.snap = +e.target.value));

$('#fileOpen').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!p.room || !Array.isArray(p.items)) throw new Error('To nie jest plik projektu');
    viewer.select(null);
    store.replace(p);
  } catch (err) {
    alert('Nie udało się otworzyć pliku: ' + err.message);
  }
});

$('#fileModel').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (f.name.toLowerCase().endsWith('.gltf')) {
    alert('Plik .gltf z osobnymi teksturami nie zostanie wczytany w całości – najlepiej użyj pojedynczego pliku .glb.');
  }
  const dataUrl = await new Promise((ok) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.readAsDataURL(f);
  });
  if (dataUrl.length > 4e6) alert('Model jest duży – zapisze się w pliku projektu, ale może nie zmieścić się w pamięci przeglądarki (autozapis).');
  addModel(dataUrl, f.name.replace(/\.(glb|gltf)$/i, ''), 'Własny plik');
});

// ---------- modele glTF ----------
function resetModelSize(item, gltf) {
  const s = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
  item.w = Math.max(1, Math.round(s.x * 100));
  item.h = Math.max(1, Math.round(s.y * 100));
  item.d = Math.max(1, Math.round(s.z * 100));
}

const pendingModels = new Map();
viewer.requestModel = (item) => {
  if (pendingModels.has(item.src)) return;
  pendingModels.set(item.src, PH.loadGLTF(item.src)
    .then((g) => {
      viewer.gltfCache.set(item.src, g);
      for (const it of store.project.items) if (it.src === item.src) viewer.rebuildItem(it.id);
    })
    .catch((err) => console.warn('Nie wczytano modelu', item.src, err)));
};

async function addModel(src, name, credit, page) {
  try {
    toast('Wczytywanie modelu…');
    const gltf = await PH.loadGLTF(src);
    viewer.gltfCache.set(src, gltf);
    const item = { id: crypto.randomUUID?.() ?? String(Math.random()).slice(2), type: 'gltf', name, src, credit, page, x: 0, z: 0, rot: 0, elev: 0, w: 100, d: 100, h: 100, parts: {}, tint: '#ffffff' };
    resetModelSize(item, gltf);
    Object.assign(item, viewer.constrain(item, 0, 0));
    store.project.items.push(item);
    store.commit('add');
    viewer.rebuildItem(item.id);
    viewer.select(item.id);
    toast('Dodano: ' + name);
  } catch (err) {
    toast('Nie udało się wczytać modelu: ' + err.message, true);
  }
}

// ---------- Poly Haven ----------
let phType = 'textures';
const dlg = $('#phDialog');

function phTargets() {
  const sel = $('#phTarget');
  sel.innerHTML = '';
  const it = store.item(viewer.selectedId);
  const def = it && CATALOG[it.type];
  if (def?.slots) for (const [k, s] of Object.entries(def.slots)) sel.append(h('option', { value: 'item:' + k }, `${it.name}: ${s.label}`));
  sel.append(h('option', { value: 'floor' }, 'Podłoga'), h('option', { value: 'walls' }, 'Ściany'), h('option', { value: 'none' }, 'Tylko dodaj do listy materiałów'));
}

async function openPolyHaven() {
  phTargets();
  dlg.showModal();
  await loadPhCategories();
}

async function loadPhCategories() {
  const sel = $('#phCat');
  $('#phTargetWrap').style.display = phType === 'textures' ? '' : 'none';
  sel.innerHTML = '<option>…</option>';
  try {
    const cats = await PH.categories(phType);
    const preferred = phType === 'textures' ? ['wood', 'fabric', 'floor', 'tiles', 'stone', 'marble', 'brick', 'plaster', 'concrete', 'metal', 'leather', 'carpet'] : ['furniture', 'seating', 'table', 'decorative', 'lighting', 'appliances', 'shelves'];
    const keys = Object.keys(cats).filter((k) => k !== 'all');
    keys.sort((a, b) => (preferred.indexOf(b) + 1 || -1) - (preferred.indexOf(a) + 1 || -1) || a.localeCompare(b));
    const ordered = [...preferred.filter((p) => keys.includes(p)), ...keys.filter((k) => !preferred.includes(k))];
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, `wszystkie (${cats.all ?? ''})`));
    for (const k of ordered) sel.append(h('option', { value: k }, `${k} (${cats[k]})`));
    sel.value = phType === 'textures' ? (keys.includes('wood') ? 'wood' : '') : keys.includes('furniture') ? 'furniture' : '';
    await loadPhGrid();
  } catch (err) {
    phError(err);
  }
}

function phError(err) {
  $('#phStatus').textContent = 'Nie udało się połączyć z Poly Haven (' + err.message + '). Sprawdź połączenie z internetem.';
  $('#phGrid').innerHTML = '';
}

async function loadPhGrid() {
  const grid = $('#phGrid');
  const status = $('#phStatus');
  status.textContent = 'Wczytywanie…';
  grid.innerHTML = '';
  try {
    let assets = await PH.list(phType, $('#phCat').value);
    const q = $('#phSearch').value.trim().toLowerCase();
    if (q) assets = assets.filter((a) => a.name.toLowerCase().includes(q) || a.id.includes(q) || (a.tags ?? []).some((t) => t.includes(q)));
    status.textContent = `${assets.length} zasobów`;
    for (const a of assets.slice(0, 120)) {
      grid.append(h('button', { class: 'ph-card', title: a.name, onclick: (e) => pickPh(a, e.currentTarget) },
        h('img', { src: PH.thumbUrl(a.id), loading: 'lazy', alt: a.name }),
        h('span', {}, a.name)));
    }
  } catch (err) {
    phError(err);
  }
}

async function pickPh(a, card) {
  card.classList.add('busy');
  try {
    if (phType === 'models') {
      const url = await PH.modelUrl(a.id);
      dlg.close();
      await addModel(url, a.name, `Poly Haven – ${a.name} (CC0)`, PH.assetPage(a.id));
      return;
    }
    const res = await PH.loadTexture(a.id, a.name);
    const list = (store.project.phTextures ??= []);
    if (!list.some((t) => t.id === a.id)) list.push({ id: a.id, label: a.name, size: res?.size ?? 1 });
    const target = $('#phTarget').value;
    const key = PH_PREFIX + a.id;
    if (target === 'floor') { store.project.room.floor = { mat: key, color: '#ffffff' }; viewer.rebuildRoom(); }
    else if (target === 'walls') { store.project.room.walls = { mat: key, color: '#ffffff' }; viewer.rebuildRoom(); }
    else if (target.startsWith('item:')) {
      const it = store.item(viewer.selectedId);
      if (it) { it.parts[target.slice(5)] = { mat: key, color: '#ffffff' }; viewer.rebuildItem(it.id); }
    }
    store.commit();
    renderProps();
    toast('Tekstura „' + a.name + '” dodana do materiałów');
  } catch (err) {
    toast('Błąd: ' + err.message, true);
  } finally {
    card.classList.remove('busy');
  }
}

async function loadPhTextures() {
  const list = store.project.phTextures ?? [];
  await Promise.all(list.map((t) => PH.loadTexture(t.id, t.label).catch((e) => console.warn('Tekstura', t.id, e))));
}

$('#phType').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b) return;
  phType = b.dataset.type;
  document.querySelectorAll('#phType button').forEach((x) => x.classList.toggle('on', x === b));
  loadPhCategories();
});
$('#phCat').addEventListener('change', loadPhGrid);
let phSearchT;
$('#phSearch').addEventListener('input', () => { clearTimeout(phSearchT); phSearchT = setTimeout(loadPhGrid, 250); });

// ---------- komunikaty ----------
let toastEl;
function toast(msg, err = false) {
  toastEl ??= document.body.appendChild(h('div', { class: 'toast' }));
  toastEl.textContent = msg;
  toastEl.classList.toggle('err', err);
  toastEl.classList.add('show');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// ---------- start ----------
renderCatalog();
renderProps();
viewer.resetCamera();
if (store.project.phTextures?.length) {
  loadPhTextures().then(() => {
    viewer.rebuildRoom();
    viewer.rebuildAll();
    renderProps();
  });
}
setTimeout(() => $('#hint')?.classList.add('fade'), 8000);

import { Store, emptyProject, sampleProject, migrate, perimeterWalls } from './state.js';
import { putAsset, resolveAsset, collectAssets, importAssets } from './assets.js';
import { openPdf, imageToPlan, isPdf, isPlanFile } from './planimport.js';
import { Viewer } from './scene.js';
import { CATALOG, newItem, catalogByCategory } from './furniture.js';
import { MATERIALS, HANDLE_TYPES, HANDLE_FINISHES, materialOptions, materialLabel, defaultColorFor, PH_PREFIX } from './materials.js';
import * as PH from './polyhaven.js';
import { Box3, Vector3 } from 'three';
import { buildFromPlan, roomArea } from './planBuild.js';

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
window.planer = { store, viewer, newItem, putAsset }; // do debugowania w konsoli

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
  const item = newItem(type, { level: viewer.levelId });
  const cur = viewer.level();
  const upper = () => [...store.project.levels].sort((a, b) => a.elev - b.elev).find((l) => l.elev > cur.elev);
  if (type === 'slab') {
    // podłoga antresoli trafia na poziom wyżej (tworzymy go, jeśli nie istnieje)
    let up = cur.elev > 0 ? cur : upper();
    if (!up) {
      up = { id: 'L' + Date.now().toString(36), name: 'Antresola', elev: 260 };
      store.project.levels.push(up);
      toast('Dodano poziom „Antresola” (+260 cm) – wysokość zmienisz w panelu Poziomy');
    }
    item.level = up.id;
    switchLevel(up.id);
  }
  if ((type === 'stairs' || type === 'stairsOpen') && upper()) item.h = upper().elev - cur.elev;
  if (type === 'wall') item.h = levelWallH(viewer.level());
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
  const others = store.project.items.filter((t) => t.level === item.level && t.type !== 'rug' && t.type !== 'door' && t.type !== 'window');
  const [hx, hz] = extents(item);
  const cands = [];
  const cx = room.x ?? 0, cz = room.z ?? 0;
  for (let x = cx - room.w / 2 + hx; x <= cx + room.w / 2 - hx; x += 10) for (let z = cz - room.d / 2 + hz; z <= cz + room.d / 2 - hz; z += 10) cands.push([x, z]);
  cands.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cz) - Math.hypot(q[0] - cx, q[1] - cz));
  for (const [x, z] of cands) {
    const free = others.every((t) => {
      const [tx, tz] = extents(t);
      return Math.abs(t.x - x) >= tx + hx || Math.abs(t.z - z) >= tz + hz;
    });
    if (free) return { x, z };
  }
  return { x: cx, z: cz };
}

// przeciąganie z katalogu na widok
const view = $('#view');
view.addEventListener('dragover', (e) => e.preventDefault());
view.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files?.length) return; // pliki obsługuje handler okna
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
  if (item.type === 'room') return renderRoomItemProps(root, item);
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

  const isWall = item.type === 'wall';
  sec('Wymiary',
    h('div', { class: 'grid3' },
      numField(isWall ? 'Długość' : 'Szer.', item.w, (v) => { item.w = v; fixPos(item); rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
      numField(isWall ? 'Grubość' : 'Głęb.', item.d, (v) => { item.d = v; fixPos(item); rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
      numField('Wys.', item.h, (v) => { item.h = v; rebuild(); renderProps(); }, { min: 1, unit: 'cm' }),
    ),
    presetButtons(item, rebuild),
  );
  sec('Położenie',
    h('div', { class: 'grid2' },
      numField('X', item.x, (v) => { item.x = v; rebuild(); }, { unit: 'cm' }),
      numField('Z', item.z, (v) => { item.z = v; rebuild(); }, { unit: 'cm' }),
      numField('Obrót', item.rot, (v) => { item.rot = ((v % 360) + 360) % 360; rebuild(); }, { unit: '°', step: 15 }),
      numField('Od podłogi', item.elev ?? 0, (v) => { item.elev = v; rebuild(); }, { min: item.type === 'slab' ? -1000 : 0, unit: 'cm' }),
    ),
    store.project.levels.length > 1 ? h('label', { class: 'field' }, h('span', {}, 'Poziom'),
      h('select', { onchange: (e) => { const old = item.level; item.level = e.target.value; viewer.rebuildItem(item.id); viewer.rebuildWalls(old); store.commit(); switchLevel(item.level); viewer.select(item.id); } },
        store.project.levels.map((l) => h('option', { value: l.id, selected: l.id === item.level }, l.name)))) : null,
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
      h('button', { class: 'small', onclick: () => applyToSameType(item) }, (isWall ? 'Zastosuj do wszystkich ścian' : 'Zastosuj kolory/uchwyty do wszystkich: ' + def.label)),
      def.handles ? h('button', { class: 'small', onclick: () => applyFrontsToAll(item) }, 'Zastosuj fronty i uchwyty do wszystkich szafek') : null,
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
    viewer.rebuildItem(it.id, false);
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
  const lvl = viewer.level();
  const rebuild = (done = true) => {
    viewer.rebuildRoom();
    if (done) store.commit();
  };
  const sec = (title, ...kids) => root.append(h('section', { class: 'sec' }, h('h4', {}, title), ...kids));
  root.append(h('div', { class: 'props-head' }, h('input', { class: 'name', value: store.project.name, onchange: (e) => { store.project.name = e.target.value; store.commit(); } })));

  // --- plan mieszkania ---
  const plan = lvl.plan;
  sec(`Plan mieszkania – ${lvl.name}`,
    h('p', { class: 'note' }, 'Wczytaj rzut z pliku JPG, PNG lub PDF, ustaw skalę i obrysuj ściany narzędziem „Rysuj ściany”.'),
    h('button', { class: 'small primary', onclick: () => $('#filePlan').click() }, plan ? '🗺 Wczytaj inny plan…' : '🗺 Wczytaj plan (JPG / PNG / PDF)…'),
    h('button', { class: 'small', onclick: openAI }, '🤖 Rozpoznaj plan i zbuduj model (AI)…'),
    plan ? [
      h('div', { class: 'row-btns' },
        h('button', { class: viewer.tool === 'calib' ? 'on' : '', onclick: () => startTool('calib') }, '📏 Ustaw skalę'),
        h('button', { class: viewer.tool === 'plan' ? 'on' : '', onclick: () => startTool(viewer.tool === 'plan' ? null : 'plan') }, '✋ Przesuń plan')),
      h('div', { class: 'grid2' },
        numField('Obrót planu', plan.rot ?? 0, (v) => { plan.rot = v; viewer.rebuildPlans(); store.commit(); }, { unit: '°', step: 0.5 }),
        numField('Skala', +(plan.scale * 100).toFixed(3), (v) => { plan.scale = v / 100; viewer.rebuildPlans(); store.commit(); }, { unit: 'cm/100px', step: 0.1, min: 0.001 })),
      h('label', { class: 'field' }, h('span', {}, `Przezroczystość planu: ${Math.round((plan.opacity ?? 0.7) * 100)}%`),
        h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: plan.opacity ?? 0.7, oninput: (e) => { plan.opacity = +e.target.value; viewer.planGroup.children.forEach((m) => m.userData.levelId === lvl.id && (m.material.opacity = plan.opacity)); }, onchange: () => { store.commit(); renderProps(); } })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!plan.show3d, onchange: (e) => { plan.show3d = e.target.checked; viewer.rebuildPlans(); store.commit(); } }), ' Pokaż plan także w widoku 3D'),
      h('button', { class: 'small', onclick: fitFloorToPlan }, 'Dopasuj podłogę do planu'),
      h('button', { class: 'small danger', onclick: () => { delete lvl.plan; viewer.rebuildPlans(); store.commit(); renderProps(); } }, 'Usuń plan'),
    ] : null,
  );

  // --- pomieszczenia ---
  const rooms = store.project.items.filter((it) => it.type === 'room' && it.level === lvl.id);
  sec(`Pomieszczenia – ${lvl.name}`,
    rooms.length ? rooms.map((r) => h('div', { class: 'room-row' },
      h('button', { class: 'li-name', onclick: () => pickRoom(r.id) }, r.name, h('small', {}, ` ${fmtArea(roomArea(r))}`)),
      h('button', { class: 'li-del', title: 'Usuń pomieszczenie', onclick: () => removeItem(r.id) }, '✕')))
      : h('p', { class: 'note' }, 'Brak pomieszczeń. Rozpoznaj plan automatycznie albo narysuj pomieszczenie po planie.'),
    h('button', { class: 'small' + (viewer.tool === 'room' ? ' on' : ''), onclick: () => startTool(viewer.tool === 'room' ? null : 'room') }, '⬚ Narysuj pomieszczenie'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: viewer.showRoomLabels !== false, onchange: (e) => { viewer.showRoomLabels = e.target.checked; } }), ' Pokazuj nazwy i powierzchnie'),
  );

  // --- ściany ---
  sec('Ściany',
    h('div', { class: 'row-btns' },
      h('button', { class: viewer.tool === 'wall' ? 'on' : '', onclick: () => startTool(viewer.tool === 'wall' ? null : 'wall') }, '✏ Rysuj ściany'),
      h('button', { onclick: addPerimeter }, '▭ Ściany obrysu')),
    h('div', { class: 'grid2' },
      numField('Grubość nowych', viewer.wallThickness, (v) => { viewer.wallThickness = v; }, { min: 1, unit: 'cm' }),
      numField('Wysokość ścian', levelWallH(lvl), (v) => setLevelWallH(lvl, v), { min: 100, max: 1500, unit: 'cm' })),
    h('p', { class: 'note' }, upperOf(lvl) ? `Wysokość od podłogi poziomu „${lvl.name}” do podłogi poziomu „${upperOf(lvl).name}”. Zmiana przesuwa wyższe poziomy i dopasowuje ściany i schody.` : 'Wysokość od podłogi do sufitu.'),
    h('button', { class: 'small', onclick: () => { const H = levelWallH(lvl); forWalls((w) => (w.h = H)); } }, 'Ustaw tę wysokość wszystkim ścianom poziomu'),
    h('p', { class: 'note' }, 'Ścianę usuwasz jak mebel: kliknij ją (w rzucie 2D) i wciśnij Del. Drzwi i okna same wycinają otwory.'),
    h('label', { class: 'field' }, h('span', {}, 'Widok ścian w 3D'),
      h('select', { onchange: (e) => { room.wallMode = e.target.value; store.commit(); } },
        [['auto', 'ukrywaj te, które zasłaniają widok'], ['low', 'obniżone (1 m)'], ['show', 'zawsze pokazuj'], ['hidden', 'ukryj wszystkie']].map(([v, l]) => h('option', { value: v, selected: room.wallMode === v }, l)))),
    h('button', { class: 'small danger', onclick: removeAllWalls }, 'Usuń wszystkie ściany tego poziomu'),
  );

  // --- poziomy ---
  sec('Poziomy (antresola)',
    store.project.levels.map((l) => h('div', { class: 'level-row' + (l.id === lvl.id ? ' on' : '') },
      h('input', { class: 'lv-name', value: l.name, onchange: (e) => { l.name = e.target.value; store.commit(); renderLevels(); } }),
      h('label', { class: 'lv-num', title: 'Poziom podłogi nad najniższym poziomem [cm]' }, h('small', {}, 'podłoga'),
        h('input', { type: 'number', value: l.elev, onchange: (e) => setLevelElev(l, +e.target.value || 0) })),
      h('label', { class: 'lv-num', title: upperOf(l) ? 'Wysokość ścian = do podłogi wyższego poziomu [cm]' : 'Wysokość ścian = do sufitu [cm]' }, h('small', {}, 'wys. ścian'),
        h('input', { type: 'number', value: levelWallH(l), min: 100, onchange: (e) => setLevelWallH(l, +e.target.value || levelWallH(l)) })),
      h('button', { title: 'Przejdź do poziomu', onclick: () => switchLevel(l.id) }, '→'),
      store.project.levels.length > 1 ? h('button', { title: 'Usuń poziom', class: 'danger', onclick: () => removeLevel(l) }, '✕') : null)),
    h('button', { class: 'small', onclick: addLevel }, '+ Dodaj antresolę / piętro'),
    h('p', { class: 'note' }, 'Każdy poziom ma własną wysokość ścian. Na niższym poziomie to wysokość do podłogi poziomu wyżej (jej zmiana przesuwa wyższe poziomy), na najwyższym – do sufitu. Antresolę dodasz przyciskiem poniżej albo wstawiając z katalogu „Podłogę antresoli”.'),
  );

  sec('Podłoga parteru',
    h('div', { class: 'grid2' },
      numField('Szer.', room.w, (v) => { room.w = v; rebuild(); viewer.resetCamera(); renderProps(); }, { min: 100, max: 5000, unit: 'cm' }),
      numField('Dł.', room.d, (v) => { room.d = v; rebuild(); viewer.resetCamera(); renderProps(); }, { min: 100, max: 5000, unit: 'cm' })),
    partEditor('Podłoga', room.floor, rebuild),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: viewer.showGrid, onchange: (e) => { viewer.showGrid = e.target.checked; viewer.grid.visible = viewer.mode === '2d' || viewer.showGrid; } }), ' Siatka 50 cm w widoku 3D'));
  sec('Kolor ścian (wszystkie)',
    partEditor('Ściany', room.walls, (done) => { forWalls((w) => (w.parts.body = { ...room.walls }), true, done); }));

  root.append(h('section', { class: 'sec' }, h('h4', {}, `Elementy – ${lvl.name}`), h('div', { id: 'itemList', class: 'item-list' })));
  renderList();
}

/** Zmienia wszystkie ściany (bieżącego poziomu lub wszystkich). */
function forWalls(fn, allLevels = false, done = true) {
  for (const w of store.project.items) {
    if (w.type !== 'wall' || (!allLevels && w.level !== viewer.levelId)) continue;
    fn(w);
    viewer.rebuildItem(w.id, false);
  }
  if (done) store.commit();
}

function renderList() {
  const list = $('#itemList');
  if (!list) return;
  list.innerHTML = '';
  const items = store.project.items.filter((it) => it.level === viewer.levelId);
  for (const it of items) {
    list.append(h('div', { class: 'li' },
      h('button', { class: 'li-name', onclick: () => viewer.select(it.id) }, it.name, h('small', {}, ` ${it.w}×${it.d}×${it.h}`)),
      h('button', { class: 'li-del', title: 'Usuń', onclick: () => { removeItem(it.id); } }, '✕')));
  }
}

// ---------- poziomy ----------
function renderLevels() {
  const sel = $('#level');
  sel.innerHTML = '';
  for (const l of store.project.levels) sel.append(h('option', { value: l.id, selected: l.id === viewer.levelId }, `${l.name} (${l.elev >= 0 ? '+' : ''}${l.elev} cm)`));
  $('#levelView').parentElement.style.display = store.project.levels.length > 1 ? '' : 'none';
}

function switchLevel(id) {
  viewer.setLevel(id);
  renderLevels();
  renderProps();
}

/** Poziom bezpośrednio wyżej (lub null). */
function upperOf(l) {
  return [...store.project.levels].sort((a, b) => a.elev - b.elev).find((x) => x.elev > l.elev) ?? null;
}

/** Wysokość ścian poziomu: do podłogi wyższego poziomu, a na najwyższym – zapisana wysokość do sufitu. */
function levelWallH(l) {
  const up = upperOf(l);
  if (up) return up.elev - l.elev;
  const lowest = Math.min(...store.project.levels.map((x) => x.elev));
  return l.wallH ?? (l.elev === lowest ? store.project.room.h : 240);
}

/** Dopasowuje ściany (i schody) poziomu, które miały „pełną” wysokość old, do nowej wysokości. */
function retargetHeights(l, oldH, newH) {
  if (oldH === newH) return;
  for (const it of store.project.items) {
    if (it.level !== l.id) continue;
    if ((it.type === 'wall' || it.type === 'stairs' || it.type === 'stairsOpen' || it.type === 'stairsU') && Math.abs(it.h - oldH) < 1) it.h = newH;
  }
}

function setLevelWallH(l, H) {
  H = Math.max(100, Math.round(H));
  const oldH = levelWallH(l);
  const up = upperOf(l);
  if (up) {
    // przesuń wszystkie wyższe poziomy o różnicę
    const delta = H - oldH;
    for (const x of store.project.levels) if (x.elev > l.elev) x.elev += delta;
  } else {
    l.wallH = H;
  }
  if (l.elev === Math.min(...store.project.levels.map((x) => x.elev))) store.project.room.h = H;
  retargetHeights(l, oldH, H);
  store.commit();
  viewer.rebuildRoom();
  viewer.rebuildAll();
  renderLevels();
  renderProps();
}

function setLevelElev(l, elev) {
  const below = [...store.project.levels].sort((a, b) => b.elev - a.elev).find((x) => x.elev < l.elev);
  const oldBelowH = below ? levelWallH(below) : null;
  l.elev = elev;
  if (below) retargetHeights(below, oldBelowH, levelWallH(below));
  store.commit();
  viewer.rebuildRoom();
  viewer.rebuildAll();
  renderLevels();
  renderProps();
}

function addLevel() {
  const top = [...store.project.levels].sort((a, b) => b.elev - a.elev)[0];
  const topH = levelWallH(top);
  const l = { id: 'L' + Date.now().toString(36), name: store.project.levels.length === 1 ? 'Antresola' : `Poziom ${store.project.levels.length + 1}`, elev: top.elev + topH, wallH: 240 };
  store.project.levels.push(l);
  store.commit();
  switchLevel(l.id);
  toast(`Dodano poziom „${l.name}” – ustaw wysokość jego podłogi, potem wstaw „Podłogę antresoli”`);
}

function removeLevel(l) {
  const n = store.project.items.filter((i) => i.level === l.id).length;
  if (!confirm(`Usunąć poziom „${l.name}”${n ? ` razem z ${n} elementami` : ''}?`)) return;
  store.project.items = store.project.items.filter((i) => i.level !== l.id);
  store.project.levels = store.project.levels.filter((x) => x !== l);
  store.commit();
  viewer.levelId = store.project.levels[0].id;
  viewer.rebuildAll();
  switchLevel(viewer.levelId);
}

// ---------- pomieszczenia ----------
const fmtArea = (m2) => `${m2.toFixed(2).replace('.', ',')} m²`;

function renderRoomItemProps(root, item) {
  const rebuild = (done = true) => { viewer.rebuildItem(item.id); if (done) store.commit(); };
  const isolated = viewer.isolateId === item.id;
  root.append(
    h('div', { class: 'props-head' },
      h('input', { class: 'name', value: item.name, onchange: (e) => { item.name = e.target.value; rebuild(); renderRoomPick(); } }),
      h('div', { class: 'note' }, `Pomieszczenie • ${fmtArea(roomArea(item))}${item.areaLabel ? ` (wg planu ${fmtArea(item.areaLabel)})` : ''}`),
      h('div', { class: 'row-btns' },
        h('button', { class: isolated ? 'on' : '', onclick: () => { viewer.isolateId = isolated ? null : item.id; renderRoomPick(); renderProps(); } }, isolated ? '👁 Pokaż całość' : '👁 Tylko ten pokój'),
        h('button', { onclick: () => viewer.focusOn(item.id) }, '⌖ Przybliż'),
        h('button', { onclick: () => { viewer.isolateId = null; viewer.select(null); renderRoomPick(); } }, '← Całe mieszkanie'),
        h('button', { class: 'danger', onclick: removeSelected }, '🗑 Usuń')),
    ),
  );
  root.append(h('section', { class: 'sec' }, h('h4', {}, 'Podłoga'),
    partEditor('Podłoga pomieszczenia', (item.parts.floor ??= { mat: 'floorOak', color: '#ffffff' }), rebuild)));
  const inside = store.project.items.filter((it) => it.level === item.level && !['room', 'wall'].includes(it.type) && insideRoom(item, it));
  root.append(h('section', { class: 'sec' }, h('h4', {}, `W tym pomieszczeniu (${inside.length})`),
    h('div', { class: 'item-list' }, inside.map((it) => h('div', { class: 'li' },
      h('button', { class: 'li-name', onclick: () => viewer.select(it.id) }, it.name, h('small', {}, ` ${it.w}×${it.d}×${it.h}`)),
      h('button', { class: 'li-del', title: 'Usuń', onclick: () => removeItem(it.id) }, '✕'))))));
}

function insideRoom(room, it) {
  const sx = room.pw ? room.w / room.pw : 1, sz = room.pd ? room.d / room.pd : 1;
  const poly = (room.points ?? []).map(([x, z]) => [room.x + x * sx, room.z + z * sz]);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > it.z !== zj > it.z && it.x < ((xj - xi) * (it.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Wybór pomieszczenia: zaznaczenie, widok tylko na nie i przybliżenie. */
function pickRoom(id) {
  const r = store.item(id);
  if (!r) return;
  if (r.level !== viewer.levelId) switchLevel(r.level);
  viewer.isolateId = id;
  viewer.select(id);
  viewer.focusOn(id);
  renderRoomPick();
}

function renderRoomPick() {
  const sel = $('#roomPick');
  const rooms = store.project.items.filter((it) => it.type === 'room');
  sel.innerHTML = '';
  sel.append(h('option', { value: '' }, 'Całe mieszkanie'));
  for (const l of store.project.levels) {
    const lr = rooms.filter((r) => r.level === l.id);
    if (!lr.length) continue;
    const og = h('optgroup', { label: l.name });
    for (const r of lr) og.append(h('option', { value: r.id, selected: viewer.isolateId === r.id }, `${r.name} – ${fmtArea(roomArea(r))}`));
    sel.append(og);
  }
  sel.parentElement.style.display = rooms.length ? '' : 'none';
}
$('#roomPick').addEventListener('change', (e) => {
  if (e.target.value) pickRoom(e.target.value);
  else { viewer.isolateId = null; viewer.select(null); viewer.resetCamera(); renderRoomPick(); }
});

viewer.onRoomDrawn = (pts) => {
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const w = Math.round(Math.max(...xs) - Math.min(...xs)), d = Math.round(Math.max(...zs) - Math.min(...zs));
  const n = store.project.items.filter((it) => it.type === 'room').length + 1;
  const name = prompt('Nazwa pomieszczenia:', `Pokój ${n}`);
  if (name === null) return;
  const r = newItem('room', {
    name: name || `Pokój ${n}`, level: viewer.levelId, x, z, w, d, h: 1, locked: true, pw: w, pd: d,
    points: pts.map((p) => [Math.round((p.x - x) * 10) / 10, Math.round((p.z - z) * 10) / 10]),
  });
  store.project.items.push(r);
  store.commit('add');
  viewer.rebuildItem(r.id);
  renderRoomPick();
  renderProps();
};

// ---------- rozpoznawanie planu przez AI ----------
let aiState = null;
const aiDlg = $('#aiDialog');

async function openAI() {
  const ai = await import('./ai.js');
  $('#aiKey').value = ai.savedKey();
  $('#aiRemember').checked = !!ai.savedKey();
  $('#aiNoPlan').hidden = !!viewer.level().plan;
  $('#aiRun').disabled = !viewer.level().plan;
  $('#aiStatus').textContent = '';
  $('#aiStatus').classList.remove('err');
  $('#aiResult').innerHTML = '';
  $('#aiBuild').hidden = true;
  aiState = null;
  if (!aiDlg.open) aiDlg.showModal();
}

$('#aiPickFile').addEventListener('click', () => { pendingAI = true; aiDlg.close(); $('#filePlan').click(); });
$('#aiCancel').addEventListener('click', () => { aiState?.abort?.abort(); aiDlg.close(); });

/** Obraz planu bieżącego poziomu (pomniejszony do max 2400 px – wystarcza do odczytu wymiarów). */
async function planImageForAI() {
  const url = await resolveAsset(viewer.level().plan.src);
  const img = await new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('nie można odczytać obrazu planu')); i.src = url; });
  const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return { canvas: c, dataUrl: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
}

$('#aiRun').addEventListener('click', async () => {
  const ai = await import('./ai.js');
  const key = $('#aiKey').value.trim();
  const status = $('#aiStatus');
  status.classList.remove('err');
  if (!key) { status.textContent = 'Wpisz klucz API.'; status.classList.add('err'); return; }
  ai.saveKey($('#aiRemember').checked ? key : '');
  $('#aiRun').disabled = true;
  $('#aiResult').innerHTML = '';
  const abort = new AbortController();
  aiState = { abort };
  const t0 = Date.now();
  status.textContent = 'Wysyłanie planu…';
  const tick = setInterval(() => { status.textContent = `Model analizuje plan… ${Math.round((Date.now() - t0) / 1000)} s (zwykle 1–3 min)`; }, 1000);
  try {
    const img = await planImageForAI();
    const res = await ai.recognizePlan(key, img.dataUrl, img.w, img.h, abort.signal);
    aiState = { ...res, img };
    const p = res.plan;
    status.textContent = `Gotowe po ${Math.round((Date.now() - t0) / 1000)} s.`;
    $('#aiResult').replaceChildren(
      h('b', {}, 'Rozpoznano:'),
      h('ul', {}, p.drawings.map((d) => h('li', {}, `${d.name}: ${d.walls.length} ścian, ${d.openings.length} drzwi/okien, ${d.rooms.length} pomieszczeń (${d.rooms.map((r) => r.name).join(', ') || '–'}), ${d.fixtures.length} elementów wyposażenia${d.roof_slopes?.length ? `, skosy: ${d.roof_slopes.length} (okna dachowe: ${d.roof_slopes.reduce((n, s) => n + s.roof_windows.length, 0)})` : ''}${d.floor_openings?.length ? `, otwory w podłodze: ${d.floor_openings.length}` : ''}`))),
      h('b', {}, 'Wysokość ścian poziomów (cm):'),
      h('div', { class: 'ai-heights' }, p.drawings.map((d, i) => h('label', { class: 'field' },
        h('span', {}, `${d.name}${i < p.drawings.length - 1 ? ' – do podłogi wyższego poziomu' : ' – do sufitu'}`),
        h('input', { type: 'number', min: 100, 'data-level': i, value: Math.round(d.wall_height_cm ?? (i < p.drawings.length - 1 ? 265 : p.drawings.length > 1 ? 240 : 260)) })))),
      p.notes ? h('p', { class: 'note' }, 'Uwagi modelu: ' + p.notes) : null,
      h('p', { class: 'note' }, '„Zbuduj model” zastąpi ściany, pomieszczenia i wyposażenie na tych poziomach (możesz to cofnąć Ctrl+Z).'),
    );
    $('#aiBuild').hidden = false;
  } catch (err) {
    if (abort.signal.aborted) status.textContent = 'Przerwano.';
    else { status.textContent = 'Nie udało się: ' + ai.aiErrorMessage(err); status.classList.add('err'); console.error(err); }
  } finally {
    clearInterval(tick);
    $('#aiRun').disabled = false;
  }
});

$('#aiBuild').addEventListener('click', async () => {
  if (!aiState?.plan) return;
  try {
    const heights = [...document.querySelectorAll('.ai-heights input')].map((i) => +i.value || null);
    await applyRecognizedPlan(aiState.plan, aiState.img.canvas, { heights });
    aiDlg.close();
  } catch (err) {
    $('#aiStatus').textContent = 'Nie udało się zbudować modelu: ' + err.message;
    $('#aiStatus').classList.add('err');
  }
});

/** Buduje model z rozpoznanego planu (używane też w testach). */
async function applyRecognizedPlan(plan, img, opts = {}) {
  viewer.select(null);
  viewer.setTool(null);
  viewer.isolateId = null;
  const sum = await buildFromPlan(store.project, plan, img, putAsset, opts);
  // drzwi i okna dosuwamy do najbliższych ścian (otwory w ścianach)
  for (const it of store.project.items) if (it.type === 'door' || it.type === 'window') Object.assign(it, viewer.constrain(it, it.x, it.z));
  store.commit();
  viewer.levelId = store.project.levels[0].id;
  viewer.rebuildRoom();
  viewer.rebuildAll();
  renderLevels();
  renderRoomPick();
  renderProps();
  setViewMode('3d');
  viewer.levelView = 'all';
  $('#levelView').value = 'all';
  viewer.resetCamera();
  toast(`Zbudowano model: ${sum.walls} ścian, ${sum.rooms} pomieszczeń, ${sum.fixtures} elementów wyposażenia (${sum.levels.map((l) => l.name).join(' + ')})`);
  return sum;
}
window.planer.applyRecognizedPlan = applyRecognizedPlan;

// ---------- ściany i plan ----------
function startTool(tool) {
  if (tool && viewer.mode !== '2d') setViewMode('2d');
  viewer.setTool(tool);
  document.body.classList.toggle('tool-on', !!tool);
  const msg = {
    wall: 'Rysowanie ścian: klikaj kolejne narożniki (przyciąganie do 45° i końców ścian, Shift = dowolny kąt). Podwójne kliknięcie / prawy przycisk / Esc kończy ciąg, drugi Esc wyłącza narzędzie.',
    calib: 'Skala: kliknij początek i koniec odcinka o znanej długości (np. ściany z wymiarem na planie).',
    plan: 'Przeciągnij plan myszą, aby dopasować go do ścian. Esc kończy.',
    room: 'Pomieszczenie: klikaj kolejne narożniki podłogi (przyciąganie do końców ścian). Kliknięcie w pierwszy punkt lub podwójne kliknięcie zamyka obrys.',
  }[tool];
  $('#toolHint').textContent = msg ?? '';
  $('#toolHint').hidden = !msg;
  $('[data-act="drawWalls"]').classList.toggle('on', tool === 'wall');
  renderProps();
}

viewer.onWallDrawn = (a, b) => {
  const t = viewer.wallThickness;
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  const rot = Math.round(((Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI) * 10) / 10;
  const w = newItem('wall', {
    name: `Ściana ${Math.round(L)} cm`, level: viewer.levelId,
    x: Math.round(((a.x + b.x) / 2) * 10) / 10, z: Math.round(((a.z + b.z) / 2) * 10) / 10,
    rot: (rot + 360) % 360, w: Math.round(L + t), d: t, h: levelWallH(viewer.level()),
    parts: { body: { ...store.project.room.walls } },
  });
  store.project.items.push(w);
  store.commit('add');
  viewer.rebuildItem(w.id);
};

viewer.onCalibrate = (a, b) => {
  const plan = viewer.level().plan;
  startTool(null);
  if (!plan) return;
  const measured = Math.hypot(b.x - a.x, b.z - a.z);
  const ans = prompt(`Zmierzony odcinek ma teraz ${Math.round(measured)} cm.\nPodaj jego rzeczywistą długość w cm:`);
  const real = parseFloat(String(ans ?? '').replace(',', '.'));
  if (!real || !measured) return;
  const k = real / measured;
  // skalowanie względem pierwszego punktu – ten punkt planu zostaje w miejscu
  plan.scale *= k;
  plan.x = a.x + (plan.x - a.x) * k;
  plan.z = a.z + (plan.z - a.z) * k;
  viewer.rebuildPlans();
  store.commit();
  renderProps();
  toast(`Skala ustawiona: 100 px = ${(plan.scale * 100).toFixed(1)} cm. Teraz możesz dopasować podłogę i obrysować ściany.`);
};

viewer.onToolDone = () => {
  store.commit();
  renderProps();
};

function fitFloorToPlan() {
  const p = viewer.level().plan;
  if (!p) return;
  const room = store.project.room;
  const a = (p.rot ?? 0) * Math.PI / 180;
  const w = p.pxW * p.scale, d = p.pxH * p.scale;
  room.w = Math.round(Math.abs(Math.cos(a)) * w + Math.abs(Math.sin(a)) * d);
  room.d = Math.round(Math.abs(Math.sin(a)) * w + Math.abs(Math.cos(a)) * d);
  room.x = Math.round(p.x);
  room.z = Math.round(p.z);
  viewer.rebuildRoom();
  store.commit();
  renderProps();
}

function addPerimeter() {
  const walls = perimeterWalls(store.project.room, viewer.levelId);
  for (const w of walls) w.h = levelWallH(viewer.level());
  store.project.items.push(...walls);
  store.commit('add');
  viewer.rebuildAll();
  renderProps();
}

function removeAllWalls() {
  const n = store.project.items.filter((i) => i.type === 'wall' && i.level === viewer.levelId).length;
  if (!n || !confirm(`Usunąć wszystkie ściany (${n}) na poziomie „${viewer.level().name}”?`)) return;
  store.project.items = store.project.items.filter((i) => !(i.type === 'wall' && i.level === viewer.levelId));
  viewer.select(null);
  viewer.rebuildAll();
  store.commit('remove');
  renderProps();
}

let pendingAI = false;
async function loadPlanFile(file) {
  try {
    let img;
    if (isPdf(file)) {
      toast('Otwieranie PDF…');
      const pdf = await openPdf(file);
      const page = pdf.pages > 1 ? await pickPdfPage(pdf) : 1;
      if (!page) return;
      toast('Renderowanie strony ' + page + '…');
      img = await pdf.render(page);
    } else {
      img = await imageToPlan(file);
    }
    const src = await putAsset(img.src);
    const lvl = viewer.level();
    const room = store.project.room;
    // wstępna skala: plan mniej więcej tak szeroki jak podłoga; potem użytkownik kalibruje
    const scale = Math.max(room.w * 1.2, 800) / img.w;
    lvl.plan = { src, pxW: img.w, pxH: img.h, scale, x: room.x ?? 0, z: room.z ?? 0, rot: 0, opacity: 0.75, show3d: false, name: file.name };
    store.commit();
    await viewer.rebuildPlans();
    viewer.fitOrtho();
    if (pendingAI) {
      pendingAI = false;
      openAI();
    } else {
      startTool('calib');
      toast('Plan wczytany. Ustaw skalę (kliknij dwa końce odcinka o znanej długości) albo użyj „🤖 Rozpoznaj plan”.');
    }
  } catch (err) {
    console.error(err);
    toast('Nie udało się wczytać planu: ' + err.message, true);
  }
}

function pickPdfPage(pdf) {
  const dlg = $('#pdfDialog');
  const grid = $('#pdfPages');
  grid.innerHTML = '';
  return new Promise((ok) => {
    let picked = null;
    for (let i = 1; i <= Math.min(pdf.pages, 40); i++) {
      const img = h('img', { alt: 'Strona ' + i });
      pdf.thumb(i).then((u) => (img.src = u)).catch(() => {});
      grid.append(h('button', { class: 'ph-card', onclick: () => { picked = i; dlg.close(); } }, img, h('span', {}, 'Strona ' + i)));
    }
    dlg.addEventListener('close', () => ok(picked), { once: true });
    dlg.showModal();
  });
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
  const it = store.item(id);
  if (viewer.isolateId === id) viewer.isolateId = null;
  store.project.items = store.project.items.filter((i) => i.id !== id);
  viewer.removeItemObject(id);
  if (it && (it.type === 'wall' || it.type === 'door' || it.type === 'window')) viewer.rebuildWalls(it.level);
  if (it?.type === 'floorVoid') viewer.rebuildFloors(it.level);
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
    migrate(store.project);
    if (!store.project.levels.some((l) => l.id === viewer.levelId)) viewer.levelId = store.project.levels[0].id;
    renderLevels();
    loadPhTextures().finally(() => {
      viewer.rebuildRoom();
      viewer.rebuildAll();
      renderProps();
    });
  }
  if (kind === 'add' || kind === 'remove') renderList();
  renderRoomPick();
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
  else if (k === 'escape') {
    if (viewer.tool === 'wall' && viewer.drawStart) viewer.setTool('wall'); // koniec bieżącego ciągu ścian
    else if (viewer.tool === 'room' && viewer.roomPts?.length) viewer.finishRoom();
    else if (viewer.tool) startTool(null);
    else viewer.select(null);
  }
  else if (k === 'w' && !ctrl) startTool(viewer.tool === 'wall' ? null : 'wall');
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
  open: () => $('#fileOpen').click(),
  save: async () => {
    const assets = await collectAssets(store.project);
    const blob = new Blob([JSON.stringify({ ...store.project, assets })], { type: 'application/json' });
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
  plan: () => $('#filePlan').click(),
  ai: () => { if (!viewer.level().plan) { pendingAI = true; $('#filePlan').click(); } else openAI(); },
  theme: () => {
    const order = ['auto', 'light', 'dark'];
    setTheme(order[(order.indexOf(themePref()) + 1) % order.length]);
  },
  drawWalls: () => startTool(viewer.tool === 'wall' ? null : 'wall'),
};
document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.act]()));

function setViewMode(mode) {
  document.querySelectorAll('#viewMode button').forEach((x) => x.classList.toggle('on', x.dataset.mode === mode));
  viewer.setMode(mode);
}
$('#viewMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) setViewMode(b.dataset.mode);
});
$('#level').addEventListener('change', (e) => switchLevel(e.target.value));
$('#levelView').addEventListener('change', (e) => (viewer.levelView = e.target.value));
$('#filePlan').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) loadPlanFile(f);
});
$('#snap').addEventListener('change', (e) => (viewer.snap = +e.target.value));

$('#fileOpen').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    await openProjectData(JSON.parse(await f.text()));
  } catch (err) {
    alert('Nie udało się otworzyć pliku: ' + err.message);
  }
});

async function openProjectData(p) {
  if (!p.room || !Array.isArray(p.items)) throw new Error('To nie jest plik projektu');
  await importAssets(p.assets);
  delete p.assets;
  viewer.select(null);
  viewer.setTool(null);
  store.replace(migrate(p));
  viewer.resetCamera();
}

// gotowe projekty (szablony) – pliki w public/projekty
const TEMPLATES = { b2m2: './projekty/mieszkanie-b2m2.json' };
async function loadTemplate(key) {
  if (key === 'sample') {
    viewer.select(null);
    store.replace(sampleProject());
    viewer.resetCamera();
    return;
  }
  const res = await fetch(TEMPLATES[key]);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  await openProjectData(await res.json());
}
$('#templates').addEventListener('change', async (e) => {
  const key = e.target.value;
  e.target.value = '';
  if (!key || !confirm('Wczytać ten projekt? Zastąpi bieżący (możesz go najpierw zapisać przyciskiem „Zapisz”).')) return;
  try {
    await loadTemplate(key);
    toast('Wczytano projekt');
  } catch (err) {
    toast('Nie udało się wczytać projektu: ' + err.message, true);
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
  const ref = await putAsset(dataUrl);
  addModel(ref, f.name.replace(/\.(glb|gltf)$/i, ''), 'Własny plik');
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
  pendingModels.set(item.src, resolveAsset(item.src).then((url) => PH.loadGLTF(url))
    .then((g) => {
      viewer.gltfCache.set(item.src, g);
      for (const it of store.project.items) if (it.src === item.src) viewer.rebuildItem(it.id);
    })
    .catch((err) => console.warn('Nie wczytano modelu', item.src, err)));
};

async function addModel(src, name, credit, page) {
  try {
    toast('Wczytywanie modelu…');
    const gltf = await PH.loadGLTF(await resolveAsset(src));
    viewer.gltfCache.set(src, gltf);
    const item = { id: crypto.randomUUID?.() ?? String(Math.random()).slice(2), type: 'gltf', level: viewer.levelId, name, src, credit, page, x: store.project.room.x ?? 0, z: store.project.room.z ?? 0, rot: 0, elev: 0, w: 100, d: 100, h: 100, parts: {}, tint: '#ffffff' };
    resetModelSize(item, gltf);
    Object.assign(item, viewer.constrain(item, item.x, item.z));
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
    else if (target === 'walls') { store.project.room.walls = { mat: key, color: '#ffffff' }; forWalls((w) => (w.parts.body = { mat: key, color: '#ffffff' }), true, false); }
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
  toastEl._t = setTimeout(() => toastEl.classList.remove('show'), err ? 9000 : 3500);
}

// ---------- motyw jasny / ciemny ----------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function themePref() {
  try { return localStorage.getItem('planer-theme') || 'auto'; } catch { return 'auto'; }
}
function setTheme(pref) {
  try { localStorage.setItem('planer-theme', pref); } catch {}
  if (pref === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
  applyTheme();
  toast({ auto: 'Motyw: automatyczny (jak w systemie)', light: 'Motyw: jasny', dark: 'Motyw: ciemny' }[pref]);
}
function applyTheme() {
  const pref = themePref();
  const dark = pref === 'dark' || (pref === 'auto' && darkQuery.matches);
  viewer.setTheme(dark);
  $('#themeBtn').textContent = { auto: '🌓', light: '☀️', dark: '🌙' }[pref];
  $('#themeBtn').title = `Motyw: ${{ auto: 'automatyczny', light: 'jasny', dark: 'ciemny' }[pref]} (kliknij, aby zmienić)`;
}
darkQuery.addEventListener('change', applyTheme);

// ---------- pliki przeciągnięte na okno lub wklejone (Ctrl+V) ----------
async function handleFile(f) {
  const n = f.name.toLowerCase();
  if (n.endsWith('.json')) {
    const dt = new DataTransfer();
    dt.items.add(f);
    $('#fileOpen').files = dt.files;
    $('#fileOpen').dispatchEvent(new Event('change'));
  } else if (n.endsWith('.glb') || n.endsWith('.gltf')) {
    const dt = new DataTransfer();
    dt.items.add(f);
    $('#fileModel').files = dt.files;
    $('#fileModel').dispatchEvent(new Event('change'));
  } else if (isPlanFile(f)) {
    loadPlanFile(f);
  } else {
    toast('Nieobsługiwany plik: ' + f.name + ' (plan: JPG, PNG, PDF; projekt: .json; model: .glb)', true);
  }
}
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
    document.body.classList.add('dropping');
  }
});
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
window.addEventListener('drop', (e) => {
  document.body.classList.remove('dropping');
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  e.preventDefault();
  handleFile(f);
});
window.addEventListener('paste', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  const f = [...(e.clipboardData?.files ?? [])][0];
  if (f && isPlanFile(f)) {
    e.preventDefault();
    loadPlanFile(new File([f], f.name || 'wklejony-plan.png', { type: f.type }));
  }
});

// ---------- start ----------
applyTheme();
renderLevels();
renderRoomPick();
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
// pierwsze uruchomienie (lub ?projekt=b2m2 w adresie) – od razu mieszkanie B2.M2
{
  const want = new URLSearchParams(location.search).get('projekt');
  if (TEMPLATES[want] || store.fresh) loadTemplate(TEMPLATES[want] ? want : 'b2m2').catch((e) => console.warn('Szablon niedostępny', e));
  // ukryj szablon, którego pliku nie ma na serwerze
  fetch(TEMPLATES.b2m2, { method: 'HEAD' }).then((r) => { if (!r.ok) $('#templates option[value="b2m2"]')?.remove(); }).catch(() => {});
}

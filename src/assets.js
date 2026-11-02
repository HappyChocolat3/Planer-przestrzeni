// Duże pliki (obrazy planów, modele) trzymane poza historią zmian – w IndexedDB przeglądarki.
// W projekcie zapisywane są tylko odnośniki "asset:<id>".
const DB = 'planer-przestrzeni';
const STORE = 'assets';
export const ASSET_PREFIX = 'asset:';
const mem = new Map();

function db() {
  return new Promise((ok, err) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => err(r.error);
  });
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((ok, err) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => err(t.error);
  });
}

export async function putAsset(dataUrl, id = crypto.randomUUID?.() ?? String(Math.random()).slice(2)) {
  mem.set(id, dataUrl);
  try {
    await tx('readwrite', (s) => s.put(dataUrl, id));
  } catch (e) {
    console.warn('Nie zapisano pliku w przeglądarce', e);
  }
  return ASSET_PREFIX + id;
}

/** Zwraca data URL dla odnośnika "asset:<id>" (lub zwraca wejście bez zmian). */
export async function resolveAsset(ref) {
  if (!ref?.startsWith(ASSET_PREFIX)) return ref;
  const id = ref.slice(ASSET_PREFIX.length);
  if (mem.has(id)) return mem.get(id);
  try {
    const v = await tx('readonly', (s) => s.get(id));
    if (v) mem.set(id, v);
    return v ?? null;
  } catch {
    return null;
  }
}

/** Wszystkie pliki użyte w projekcie – do eksportu w pliku .json. */
export async function collectAssets(project) {
  const refs = new Set(JSON.stringify(project).match(/asset:[\w-]+/g) ?? []);
  const out = {};
  for (const r of refs) {
    const v = await resolveAsset(r);
    if (v) out[r.slice(ASSET_PREFIX.length)] = v;
  }
  return out;
}

export async function importAssets(assets = {}) {
  for (const [id, v] of Object.entries(assets)) await putAsset(v, id);
}

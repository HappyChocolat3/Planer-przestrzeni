// Integracja z Poly Haven (https://polyhaven.com) – darmowa baza tekstur i modeli 3D na licencji CC0.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { registerPolyHavenMaterial, isPolyHavenLoaded } from './materials.js';

const API = 'https://api.polyhaven.com';
export const thumbUrl = (id) => `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=256`;
export const assetPage = (id) => `https://polyhaven.com/a/${id}`;

const listCache = new Map();
const infoCache = new Map();

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
  return res.json();
}

/** Lista kategorii dla typu 'textures' lub 'models'. */
export async function categories(type) {
  const key = 'cat:' + type;
  if (!listCache.has(key)) listCache.set(key, getJSON(`${API}/categories/${type}`));
  return listCache.get(key);
}

/** Lista zasobów: [{id, name, categories, dimensions, ...}] */
export async function list(type, category) {
  const key = `${type}:${category || ''}`;
  if (!listCache.has(key)) {
    const q = new URLSearchParams({ type });
    if (category) q.set('categories', category);
    listCache.set(key, getJSON(`${API}/assets?${q}`).then((obj) =>
      Object.entries(obj)
        .map(([id, a]) => ({ id, ...a }))
        .sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0)),
    ));
  }
  return listCache.get(key);
}

async function info(id) {
  if (!infoCache.has(id)) infoCache.set(id, getJSON(`${API}/info/${id}`));
  return infoCache.get(id);
}

function pickFile(files, mapName, res = '1k') {
  const m = files[mapName];
  if (!m) return null;
  const r = m[res] ?? m['1k'] ?? m[Object.keys(m)[0]];
  return (r.jpg ?? r.png ?? Object.values(r)[0])?.url ?? null;
}

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const loadTex = (url) => new Promise((ok, err) => texLoader.load(url, ok, undefined, err));

/** Pobiera teksturę (kolor + normalne + chropowatość) i rejestruje ją jako materiał "ph:<id>". */
export async function loadTexture(id, label) {
  if (isPolyHavenLoaded(id)) return;
  const [files, meta] = await Promise.all([getJSON(`${API}/files/${id}`), info(id).catch(() => ({}))]);
  const diff = pickFile(files, 'Diffuse') ?? pickFile(files, 'diff');
  if (!diff) throw new Error('Brak mapy koloru dla ' + id);
  const nor = pickFile(files, 'nor_gl');
  const rough = pickFile(files, 'Rough') ?? pickFile(files, 'rough');
  const [map, normalMap, roughnessMap] = await Promise.all([
    loadTex(diff),
    nor ? loadTex(nor).catch(() => null) : null,
    rough ? loadTex(rough).catch(() => null) : null,
  ]);
  map.colorSpace = THREE.SRGBColorSpace;
  const maps = { map };
  if (normalMap) maps.normalMap = normalMap;
  if (roughnessMap) maps.roughnessMap = roughnessMap;
  // dimensions w mm (szer., wys.) – rzeczywisty rozmiar próbki
  const size = meta?.dimensions?.[0] ? meta.dimensions[0] / 1000 : 1;
  registerPolyHavenMaterial(id, label || meta?.name || id, maps, size);
  return { label: label || meta?.name || id, size };
}

const gltfLoader = new GLTFLoader();
gltfLoader.setCrossOrigin('anonymous');

/** Zwraca URL pliku glTF (1k) dla modelu z Poly Haven. */
export async function modelUrl(id) {
  const files = await getJSON(`${API}/files/${id}`);
  const g = files.gltf?.['1k']?.gltf ?? Object.values(files.gltf ?? {})[0]?.gltf;
  if (!g?.url) throw new Error('Brak pliku glTF dla ' + id);
  return g.url;
}

/** Wczytuje glTF/GLB z adresu URL (również data:/blob:). */
export function loadGLTF(url) {
  return new Promise((ok, err) => gltfLoader.load(url, ok, undefined, err));
}

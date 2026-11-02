// Budowa modelu mieszkania z rozpoznanego planu (wynik ai.js → elementy projektu).
import { newItem, polygonCentroid, polygonArea } from './furniture.js';

const FACING_ROT = { down: 0, right: 270, up: 180, left: 90 }; // przód elementu → obrót w planerze

/** Wycina fragment obrazu (bbox w px) jako JPEG. */
export async function cropImage(img, b) {
  const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
  const x1 = Math.min(img.width, Math.ceil(b.x1)), y1 = Math.min(img.height, Math.ceil(b.y1));
  const c = document.createElement('canvas');
  c.width = Math.max(1, x1 - x0);
  c.height = Math.max(1, y1 - y0);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return { src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height, x0, y0 };
}

/**
 * Tworzy poziomy i elementy z rozpoznanego planu.
 * project – bieżący projekt (zmieniany w miejscu), plan – wynik PlanSchema,
 * img – HTMLImageElement/Canvas z obrazem wysłanym do analizy, putAsset – zapis obrazów.
 * Zwraca podsumowanie.
 */
export async function buildFromPlan(project, plan, img, putAsset, opts = {}) {
  const drawings = plan.drawings.filter((d) => d.walls.length);
  if (!drawings.length) throw new Error('nie rozpoznano żadnych ścian');

  // środek obrysu najniższego poziomu → początek układu planera
  const base = drawings[0];
  const xs = base.walls.flatMap((w) => [w.x1, w.x2]), ys = base.walls.flatMap((w) => [w.y1, w.y2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const X = (x) => Math.round((x - cx) * 10) / 10, Z = (y) => Math.round((y - cy) * 10) / 10;

  // poziomy: kolejne rysunki → kolejne poziomy (istniejące lub nowe)
  const sorted = [...project.levels].sort((a, b) => a.elev - b.elev);
  const levels = [];
  // wysokość ścian każdego poziomu: z okna (użytkownik) → z planu → domyślna
  const H = drawings.map((d, i) => Math.max(100, opts.heights?.[i] ?? d.wall_height_cm ?? (i < drawings.length - 1 ? 265 : drawings.length > 1 ? 240 : 260)));
  drawings.forEach((d, i) => {
    let lvl = sorted[i];
    // podłoga wyższego poziomu = podłoga niższego + wysokość jego ścian
    const elev = i === 0 ? 0 : (opts.heights?.[i - 1] ? levels[i - 1].elev + H[i - 1] : (d.floor_elevation_cm ?? levels[i - 1].elev + H[i - 1]));
    if (!lvl) {
      lvl = { id: 'L' + Date.now().toString(36) + i, name: d.name || `Poziom ${i + 1}`, elev };
      project.levels.push(lvl);
    } else {
      lvl.name = d.name || lvl.name;
      if (i > 0) lvl.elev = elev;
    }
    lvl.wallH = H[i];
    levels.push(lvl);
  });
  const levelIds = new Set(levels.map((l) => l.id));

  // usuń dotychczasową zawartość tych poziomów (ściany, otwory, pomieszczenia, wyposażenie)
  if (opts.replace !== false) project.items = project.items.filter((it) => !levelIds.has(it.level));

  const summary = { levels: [], walls: 0, openings: 0, rooms: 0, fixtures: 0 };
  const items = [];
  const wallPaint = { ...project.room.walls };

  for (let i = 0; i < drawings.length; i++) {
    const d = drawings[i], lvl = levels[i];
    const next = levels[i + 1];
    const wallH = next ? Math.max(100, next.elev - lvl.elev) : H[i];
    const add = (type, o) => {
      const it = newItem(type, { level: lvl.id, ...o });
      items.push(it);
      return it;
    };

    for (const w of d.walls) {
      const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
      if (L < 5) continue;
      const t = Math.min(Math.max(w.thickness_cm || 12, 5), 80);
      const rot = ((Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180) / Math.PI + 360) % 360;
      add('wall', {
        name: w.exterior ? 'Ściana zewnętrzna' : 'Ściana działowa',
        x: X((w.x1 + w.x2) / 2), z: Z((w.y1 + w.y2) / 2), rot: Math.round(rot * 10) / 10,
        w: Math.round(L + t), d: Math.round(t), h: wallH, parts: { body: { ...wallPaint } },
      });
      summary.walls++;
    }

    for (const o of d.openings) {
      const w = Math.max(40, Math.round(o.width_cm || 90));
      if (o.type === 'door') add('door', { name: 'Drzwi', x: X(o.x), z: Z(o.y), w });
      else if (o.type === 'balcony_door') add('window', { name: 'Drzwi balkonowe', x: X(o.x), z: Z(o.y), w, h: 220, elev: 0 });
      else add('window', { name: 'Okno', x: X(o.x), z: Z(o.y), w, h: 140, elev: 90 });
      summary.openings++;
    }

    for (const r of d.rooms) {
      if (r.polygon.length < 3) continue;
      const pts = r.polygon.map((p) => [X(p.x), Z(p.y)]);
      const xs2 = pts.map((p) => p[0]), zs2 = pts.map((p) => p[1]);
      const rx = (Math.min(...xs2) + Math.max(...xs2)) / 2, rz = (Math.min(...zs2) + Math.max(...zs2)) / 2;
      const w = Math.max(...xs2) - Math.min(...xs2), dd = Math.max(...zs2) - Math.min(...zs2);
      add('room', {
        name: r.name || 'Pomieszczenie', x: rx, z: rz, w: Math.round(w), d: Math.round(dd), h: 1, locked: true,
        points: pts.map(([x, z]) => [Math.round((x - rx) * 10) / 10, Math.round((z - rz) * 10) / 10]), pw: Math.round(w), pd: Math.round(dd),
        areaLabel: r.area_m2 ?? null,
        slab: i > 0 ? 25 : 0, // wyższe poziomy: pomieszczenie ze stropem pod spodem
      });
      summary.rooms++;
    }

    for (const f of d.fixtures) {
      const rot = FACING_ROT[f.facing] ?? 0;
      const W = Math.max(20, Math.round(f.width_cm)), D = Math.max(20, Math.round(f.depth_cm));
      const pos = { x: X(f.x), z: Z(f.y), rot };
      switch (f.type) {
        case 'kitchen_counter': {
          // długi blat → kilka szafek ok. 60 cm
          const n = Math.max(1, Math.round(W / 60)), cw = Math.round(W / n);
          const a = (rot * Math.PI) / 180, ux = Math.cos(a), uz = Math.sin(a);
          for (let k = 0; k < n; k++) {
            const off = (k - (n - 1) / 2) * cw;
            add(k % 2 ? 'kDrawers' : 'kBase', { name: 'Szafka kuchenna', x: pos.x + ux * off, z: pos.z + uz * off, rot, w: cw, d: Math.min(D, 65) });
          }
          break;
        }
        case 'sink': add('kSink', { ...pos, w: Math.max(W, 50), d: Math.min(D, 65) }); break;
        case 'stove': add('kOven', { ...pos, w: Math.max(W, 45), d: Math.min(D, 65) }); break;
        case 'fridge': add('fridge', { ...pos, w: W, d: D }); break;
        case 'shower': add('shower', { ...pos, w: W, d: D }); break;
        case 'bathtub': add('bathtub', { ...pos, w: W, d: D }); break;
        case 'toilet': add('toilet', { ...pos }); break;
        case 'washbasin': add('vanity', { ...pos, w: Math.max(W, 40), d: Math.min(Math.max(D, 30), 50) }); break;
        case 'washing_machine': add('washer', { ...pos, w: W, d: D }); break;
        case 'wardrobe': add('wardrobe', { ...pos, w: W, d: D, p: { doors: Math.max(1, Math.round(W / 50)) } }); break;
        case 'bed': add('bed', { ...pos, w: W, d: D }); break;
        case 'sofa': add('sofa', { ...pos, w: W, d: D }); break;
        case 'table': add('table', { ...pos, w: W, d: D }); break;
        case 'stairs': {
          const h = next ? next.elev - lvl.elev : 265;
          const type = f.stairs_shape === 'u_turn' ? 'stairsU' : 'stairsOpen';
          add(type, { name: 'Schody', ...pos, w: W, d: D, h, p: { steps: Math.max(7, Math.round(h / 18)), ...(type === 'stairsU' ? { winders: 5 } : { rails: 1 }) } });
          break;
        }
        default: continue;
      }
      summary.fixtures++;
    }

    // podkład: wycinek obrazu z tym rysunkiem, w skali odczytanej przez model
    const c = d.calibration;
    const distPx = Math.hypot(c.ref_px.x - c.origin_px.x, c.ref_px.y - c.origin_px.y);
    if (img && distPx > 5 && Math.abs(c.ref_x_cm) > 10) {
      const scale = Math.abs(c.ref_x_cm) / distPx; // cm na piksel
      const crop = await cropImage(img, c.bbox_px);
      const src = await putAsset(crop.src);
      const ox = c.origin_px.x - crop.x0, oy = c.origin_px.y - crop.y0;
      lvl.plan = {
        src, pxW: crop.w, pxH: crop.h, scale,
        x: X(0) - (ox - crop.w / 2) * scale, z: Z(0) - (oy - crop.h / 2) * scale,
        rot: 0, opacity: 0.6, show3d: false, name: 'rozpoznany plan',
      };
    }
    summary.levels.push({ name: lvl.name, elev: lvl.elev });
  }

  // podłoga parteru = obrys najniższego poziomu
  project.room.w = Math.round(maxX - minX);
  project.room.d = Math.round(maxY - minY);
  project.room.x = 0;
  project.room.z = 0;
  project.room.h = levels[1] ? levels[1].elev - levels[0].elev : H[0];
  project.items.push(...items);
  summary.notes = plan.notes;
  return summary;
}

/** Pole pomieszczenia (m²) z wielokąta. */
export function roomArea(it) {
  const sx = it.pw ? it.w / it.pw : 1, sz = it.pd ? it.d / it.pd : 1;
  return polygonArea((it.points ?? []).map(([x, z]) => [x * sx, z * sz])) / 10000;
}

export { polygonCentroid };

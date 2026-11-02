// Stan projektu, historia (cofnij/ponów) i zapis.
import { newItem } from './furniture.js';

const STORAGE_KEY = 'planer-przestrzeni-v1';

export function defaultRoom() {
  return {
    w: 500, d: 400, h: 260,
    floor: { mat: 'floorOak', color: '#ffffff' },
    walls: { mat: 'paint', color: '#efeae2' },
    wallMode: 'auto',
  };
}

export function sampleProject() {
  const items = [];
  const add = (type, o) => items.push(newItem(type, o));
  // kuchnia wzdłuż górnej ściany (z = -200)
  const zBase = -200 + 30, zWall = -200 + 17.5;
  add('fridge', { x: -220, z: -200 + 32.5, parts: { body: { mat: 'steel', color: '#c8cacc' } } });
  add('kTall', { x: -160, z: zBase });
  add('kDrawers', { x: -100, z: zBase });
  add('kOven', { x: -40, z: zBase });
  add('kSink', { x: 30, z: zBase, w: 80 });
  add('kBase', { x: 100, z: zBase });
  for (const [x, w] of [[-100, 60], [-40, 60], [30, 80], [100, 60]]) add('kWall', { x, z: zWall, w });
  // jadalnia
  add('roundTable', { x: 160, z: -40 });
  add('chair', { x: 160, z: 15, rot: 180 });
  add('chair', { x: 160, z: -95, rot: 0 });
  add('chair', { x: 105, z: -40, rot: 270 });
  add('chair', { x: 215, z: -40, rot: 90 });
  // salon
  add('rug', { x: -90, z: 90, w: 200, d: 160 });
  add('sofa', { x: -90, z: 150, rot: 180 });
  add('coffeeTable', { x: -90, z: 70 });
  add('armchair', { x: -215, z: 60, rot: 270 });
  add('plant', { x: 120, z: 160 });
  add('floorLamp', { x: 40, z: 165 });
  add('window', { x: -90, z: 206, rot: 180, w: 160 });
  add('door', { x: 256, z: 120, rot: 90 });
  return { version: 1, name: 'Mój projekt', room: defaultRoom(), items, phTextures: [] };
}

export function emptyProject() {
  return { version: 1, name: 'Nowy projekt', room: defaultRoom(), items: [], phTextures: [] };
}

export class Store {
  constructor() {
    this.project = this.loadLocal() ?? sampleProject();
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
    this.last = JSON.stringify(this.project);
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return p?.room && Array.isArray(p.items) ? p : null;
    } catch {
      return null;
    }
  }

  saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.project));
    } catch (e) {
      console.warn('Nie udało się zapisać w przeglądarce (za duży projekt?)', e);
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  emit(kind) {
    for (const fn of this.listeners) fn(kind);
  }

  /** Zatwierdza zmianę: zapisuje punkt historii i powiadamia. */
  commit(kind = 'change') {
    const now = JSON.stringify(this.project);
    if (now === this.last) return;
    this.undoStack.push(this.last);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.last = now;
    this.saveLocal();
    this.emit(kind);
  }

  replace(project) {
    this.undoStack.push(this.last);
    this.redoStack = [];
    this.project = project;
    this.last = JSON.stringify(project);
    this.saveLocal();
    this.emit('replace');
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.last);
    this.last = this.undoStack.pop();
    this.project = JSON.parse(this.last);
    this.saveLocal();
    this.emit('replace');
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.last);
    this.last = this.redoStack.pop();
    this.project = JSON.parse(this.last);
    this.saveLocal();
    this.emit('replace');
  }

  item(id) {
    return this.project.items.find((i) => i.id === id);
  }
}

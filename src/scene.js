// Scena 3D: renderer, kamery (3D / rzut 2D), poziomy (parter, antresola), ściany z otworami,
// podkład z planem mieszkania, zaznaczanie, przeciąganie i narzędzia rysowania.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { boxGeo } from './geometry.js';
import { getMaterial } from './materials.js';
import { buildItem, pointInPolygon } from './furniture.js';
import { resolveAsset } from './assets.js';

const IN_WALL = new Set(['door', 'window']);
const FREE = new Set(['wall', 'railing', 'railingGlass', 'room', 'roofSlope', 'floorVoid']); // bez ograniczania do obrysu podłogi
const deg = THREE.MathUtils.degToRad;

export class Viewer {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.objects = new Map(); // id -> Object3D
    this.gltfCache = new Map(); // src -> gltf
    this.hostOf = new Map(); // id drzwi/okna -> id ściany
    this.selectedId = null;
    this.mode = '3d';
    this.snap = 5; // cm
    this.levelId = store.project.levels[0].id;
    this.levelView = 'below'; // all | below | current
    this.tool = null; // null | 'wall' | 'calib' | 'plan'
    this.wallThickness = 12;
    this.onSelect = () => {};
    this.onItemMoved = () => {};
    this.onToolDone = () => {};
    this.onWallDrawn = () => {};
    this.onCalibrate = () => {};
    this.onRoomDrawn = () => {};
    this.isolateId = null;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    container.appendChild(this.labels.domElement);

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#e9edf1');
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    scene.add(new THREE.HemisphereLight('#ffffff', '#b9a68e', 0.9));
    const sun = (this.sun = new THREE.DirectionalLight('#fff4e5', 1.6));
    sun.position.set(4, 9, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    this.persp = new THREE.PerspectiveCamera(50, 1, 0.05, 300);
    this.persp.position.set(4.5, 5.5, 7);
    this.ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.ortho.position.set(0, 60, 0);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(0, 0, 0);
    this.camera = this.persp;

    this.controls = new OrbitControls(this.persp, r.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.target.set(0, 0.6, 0);
    this.orthoControls = new OrbitControls(this.ortho, r.domElement);
    this.orthoControls.enableRotate = false;
    this.orthoControls.screenSpacePanning = true;
    this.orthoControls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.orthoControls.enabled = false;

    this.roomGroup = new THREE.Group();
    this.planGroup = new THREE.Group();
    this.itemsGroup = new THREE.Group();
    this.toolGroup = new THREE.Group();
    scene.add(this.roomGroup, this.planGroup, this.itemsGroup, this.toolGroup);

    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#1f7aec'));
    this.selBox.visible = false;
    this.selBox.material.depthTest = false;
    this.selBox.renderOrder = 10;
    scene.add(this.selBox);

    this.dimLabel = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'dim-label' }));
    this.dimLabel.visible = false;
    scene.add(this.dimLabel);

    // podgląd rysowanej ściany / odcinka kalibracji
    this.toolLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: '#e5484d', depthTest: false }));
    this.toolLine.renderOrder = 20;
    this.toolLine.visible = false;
    this.toolLabel = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'dim-label tool' }));
    this.toolLabel.visible = false;
    this.toolCursor = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 24), new THREE.MeshBasicMaterial({ color: '#e5484d', depthTest: false }));
    this.toolCursor.rotation.x = -Math.PI / 2;
    this.toolCursor.renderOrder = 21;
    this.toolCursor.visible = false;
    this.toolGroup.add(this.toolLine, this.toolLabel, this.toolCursor);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.rebuildRoom();
    this.rebuildAll();
    r.setAnimationLoop(() => this.render());
  }

  /** Kolory sceny dla trybu jasnego / ciemnego. */
  setTheme(dark) {
    this.dark = dark;
    this.scene.background = new THREE.Color(dark ? '#161b21' : '#e9edf1');
    this.rebuildRoom();
  }

  // ---------- poziomy ----------
  get levels() {
    return this.store.project.levels;
  }

  level(id = this.levelId) {
    return this.levels.find((l) => l.id === id) ?? this.levels[0];
  }

  levelElev(id) {
    return (this.level(id)?.elev ?? 0) / 100;
  }

  levelVisible(id) {
    if (this.levelView === 'all') return true;
    const cur = this.level();
    const l = this.level(id);
    if (this.levelView === 'current') return l.id === cur.id;
    return l.elev <= cur.elev;
  }

  setLevel(id) {
    this.levelId = this.level(id).id;
    if (this.selectedId && this.store.item(this.selectedId)?.level !== this.levelId) this.select(null);
    this.rebuildRoom();
  }

  // ---------- pomieszczenie (podłoga, siatka, plany) ----------
  rebuildRoom() {
    const g = this.roomGroup;
    g.clear();
    const room = this.store.project.room;
    const W = room.w / 100, D = room.d / 100;
    const floor = new THREE.Mesh(boxGeo(W + 0.24, 0.02, D + 0.24), getMaterial(room.floor.mat, room.floor.color));
    floor.position.set((room.x ?? 0) / 100, -0.01, (room.z ?? 0) / 100);
    floor.receiveShadow = true;
    g.add(floor);

    const size = Math.max(W, D) + 4;
    this.grid = this.dark
      ? new THREE.GridHelper(size, Math.round(size * 2), '#5c6876', '#3a434e')
      : new THREE.GridHelper(size, Math.round(size * 2), '#8a96a3', '#b6c0ca');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.grid.position.set((room.x ?? 0) / 100, this.levelElev(this.levelId) + 0.006, (room.z ?? 0) / 100);
    this.grid.visible = this.mode === '2d' || !!this.showGrid;
    g.add(this.grid);

    const lbl = (text, x, z) => {
      const el = document.createElement('div');
      el.className = 'room-dim';
      el.textContent = text;
      const o = new CSS2DObject(el);
      o.position.set(x, 0.01, z);
      g.add(o);
    };
    lbl(`${room.w} cm`, (room.x ?? 0) / 100, (room.z ?? 0) / 100 + D / 2 + 0.4);
    lbl(`${room.d} cm`, (room.x ?? 0) / 100 + W / 2 + 0.5, (room.z ?? 0) / 100);

    const s = this.sun.shadow.camera;
    const ext = Math.max(W, D) / 2 + 1.5;
    s.left = s.bottom = -ext;
    s.right = s.top = ext;
    s.far = 40;
    s.updateProjectionMatrix();
    this.rebuildPlans();
    this.fitOrtho();
  }

  /** Podkłady z planem mieszkania (osobny dla każdego poziomu). */
  async rebuildPlans() {
    const token = (this.planToken = (this.planToken ?? 0) + 1);
    const metas = [];
    for (const l of this.levels) {
      if (!l.plan?.src) continue;
      metas.push([l, await this.planTexture(l.plan.src)]);
    }
    if (token !== this.planToken) return;
    this.planGroup.clear();
    for (const [l, tex] of metas) {
      if (!tex) continue;
      const p = l.plan;
      const w = (p.pxW * p.scale) / 100, hgt = (p.pxH * p.scale) / 100;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: p.opacity ?? 0.7, depthWrite: false, toneMapped: false }));
      mesh.rotation.order = 'YXZ';
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.y = deg(-(p.rot ?? 0));
      mesh.position.set(p.x / 100, l.elev / 100 + 0.004, p.z / 100);
      mesh.renderOrder = 1;
      mesh.userData.levelId = l.id;
      mesh.userData.show3d = !!p.show3d;
      this.planGroup.add(mesh);
    }
  }

  async planTexture(ref) {
    this.planTex ??= new Map();
    if (this.planTex.has(ref)) return this.planTex.get(ref);
    const url = await resolveAsset(ref);
    if (!url) return null;
    const tex = await new THREE.TextureLoader().loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.planTex.set(ref, tex);
    return tex;
  }

  // ---------- elementy ----------
  rebuildAll() {
    for (const o of this.objects.values()) disposeLabels(o), this.itemsGroup.remove(o);
    this.objects.clear();
    for (const it of this.store.project.items) this.rebuildItem(it.id, false);
    for (const l of this.levels) this.rebuildWalls(l.id);
    if (this.selectedId && !this.objects.has(this.selectedId)) this.select(null);
    this.updateSelection();
  }

  rebuildItem(id, walls = true) {
    const old = this.objects.get(id);
    if (old) disposeLabels(old), this.itemsGroup.remove(old);
    this.objects.delete(id);
    const item = this.store.item(id);
    if (!item) return;
    if (item.type === 'gltf' && !this.gltfCache.has(item.src)) this.requestModel?.(item);
    const holes = item.type === 'wall' ? this.wallHoles(item) : (item.type === 'room' || item.type === 'slab') ? this.floorHoles(item) : null;
    const obj = buildItem(holes ? { ...item, holes } : item, this.gltfCache);
    if (item.type === 'wall') obj.add(this.wallCap(item, holes));
    obj.position.y += this.levelElev(item.level);
    obj.userData.levelId = this.level(item.level).id;
    this.itemsGroup.add(obj);
    this.objects.set(id, obj);
    if (walls && (item.type === 'wall' || IN_WALL.has(item.type))) this.rebuildWalls(item.level);
    if (walls && item.type === 'floorVoid') this.rebuildFloors(item.level);
    if (id === this.selectedId) this.updateSelection();
  }

  /** Przebudowuje ściany poziomu (otwory na drzwi i okna). */
  rebuildWalls(levelId) {
    const lid = this.level(levelId).id;
    for (const it of this.store.project.items) {
      if (it.type === 'wall' && this.level(it.level).id === lid) this.rebuildItem(it.id, false);
    }
  }

  /** Przebudowuje podłogi pomieszczeń i stropy poziomu (otwory w podłodze). */
  rebuildFloors(levelId) {
    const lid = this.level(levelId).id;
    for (const it of this.store.project.items) {
      if ((it.type === 'room' || it.type === 'slab') && this.level(it.level).id === lid) this.rebuildItem(it.id, false);
    }
  }

  /** Otwory w podłodze/stropie (wielokąty w cm, w układzie elementu) od elementów „Otwór w podłodze”. */
  floorHoles(item) {
    const out = [];
    const r = deg(item.rot ?? 0), cr = Math.cos(r), sr = Math.sin(r);
    for (const v of this.store.project.items) {
      if (v.type !== 'floorVoid' || this.level(v.level).id !== this.level(item.level).id) continue;
      const a = deg(v.rot ?? 0), ca = Math.cos(a), sa = Math.sin(a);
      const pts = [[-v.w / 2, -v.d / 2], [v.w / 2, -v.d / 2], [v.w / 2, v.d / 2], [-v.w / 2, v.d / 2]].map(([lx, lz]) => {
        const wx = v.x + lx * ca - lz * sa, wz = v.z + lx * sa + lz * ca; // świat
        const dx = wx - item.x, dz = wz - item.z;
        return [dx * cr + dz * sr, -dx * sr + dz * cr]; // układ elementu
      });
      out.push(pts);
    }
    return out;
  }

  /** Otwory w ścianie (w metrach, w układzie ściany) od drzwi i okien, które w niej stoją. */
  wallHoles(wall) {
    const holes = [];
    for (const [k, v] of this.hostOf) if (v === wall.id) this.hostOf.delete(k);
    const a = deg(wall.rot), ux = Math.cos(a), uz = Math.sin(a);
    for (const it of this.store.project.items) {
      if (!IN_WALL.has(it.type) || this.level(it.level).id !== this.level(wall.level).id) continue;
      const diff = (((it.rot - wall.rot) % 180) + 180) % 180;
      if (Math.min(diff, 180 - diff) > 2) continue;
      const vx = it.x - wall.x, vz = it.z - wall.z;
      const along = vx * ux + vz * uz, perp = -vx * uz + vz * ux;
      if (Math.abs(perp) > wall.d / 2 + 8 || Math.abs(along) > wall.w / 2) continue;
      const e = it.elev ?? 0;
      holes.push({ x0: (along - it.w / 2) / 100, x1: (along + it.w / 2) / 100, y0: e / 100, y1: (e + it.h) / 100 });
      this.hostOf.set(it.id, wall.id);
    }
    return holes;
  }

  /** Ciemny "przekrój" ściany widoczny w rzucie 2D – z przerwami w miejscu drzwi. */
  wallCap(item, holes) {
    const g = new THREE.Group();
    g.userData.cap = true;
    g.rotation.y = 0;
    const w = item.w / 100, d = item.d / 100, h = item.h / 100;
    const mat = (this.capMat ??= new THREE.MeshBasicMaterial({ color: '#2b3138' }));
    const gaps = holes.filter((o) => o.y0 < 0.01).sort((a, b) => a.x0 - b.x0);
    let x = -w / 2;
    const seg = (x0, x1) => {
      if (x1 - x0 < 0.005) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, d), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, h + 0.002, 0);
      g.add(m);
    };
    for (const o of gaps) {
      seg(x, Math.max(x, o.x0));
      x = Math.max(x, o.x1);
    }
    seg(x, w / 2);
    // wewnątrz grupy obiektu – obrót i pozycję dziedziczy z elementu
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  removeItemObject(id) {
    const it = this.store.item(id);
    const o = this.objects.get(id);
    if (o) disposeLabels(o), this.itemsGroup.remove(o);
    this.objects.delete(id);
    this.hostOf.delete(id);
    return it;
  }

  select(id) {
    this.selectedId = id;
    this.updateSelection();
    this.onSelect(id);
  }

  updateSelection() {
    const o = this.selectedId && this.objects.get(this.selectedId);
    if (!o) {
      this.selBox.visible = false;
      this.dimLabel.visible = false;
      return;
    }
    o.updateMatrixWorld(true);
    this.selBox.box.setFromObject(o);
    this.selBox.visible = true;
    const it = this.store.item(this.selectedId);
    this.dimLabel.element.textContent = it.type === 'wall' ? `ściana ${it.w} cm` : `${it.w} × ${it.d} × ${it.h} cm`;
    const b = this.selBox.box;
    this.dimLabel.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.08, (b.min.z + b.max.z) / 2);
    this.dimLabel.visible = true;
  }

  // ---------- widok ----------
  setMode(mode) {
    this.mode = mode;
    const is2d = mode === '2d';
    this.camera = is2d ? this.ortho : this.persp;
    this.controls.enabled = !is2d;
    this.orthoControls.enabled = is2d;
    this.grid.visible = is2d || !!this.showGrid;
    this.fitOrtho();
  }

  fitOrtho() {
    const room = this.store.project.room;
    const rect = this.container.getBoundingClientRect();
    const aspect = rect.width / Math.max(rect.height, 1);
    let W = room.w / 100 + 1.8, D = room.d / 100 + 1.4;
    const plan = this.level().plan;
    if (plan?.pxW) {
      W = Math.max(W, (plan.pxW * plan.scale) / 100 + 0.6);
      D = Math.max(D, (plan.pxH * plan.scale) / 100 + 0.6);
    }
    const halfH = Math.max(D / 2, W / 2 / aspect);
    Object.assign(this.ortho, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH, zoom: 1 });
    const cx = (room.x ?? 0) / 100, cz = (room.z ?? 0) / 100;
    this.ortho.position.set(cx, 60, cz);
    this.orthoControls.target.set(cx, 0, cz);
    this.ortho.updateProjectionMatrix();
  }

  /** Ustawia kamerę na wybrany element (np. pomieszczenie). */
  focusOn(id) {
    const o = this.objects.get(id);
    if (!o) return;
    const prevVis = o.visible;
    o.visible = true;
    const box = new THREE.Box3().setFromObject(o);
    o.visible = prevVis;
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const m = Math.max(size.x, size.z, 2);
    this.controls.target.set(c.x, c.y + 0.6, c.z);
    this.persp.position.set(c.x + m * 0.55, c.y + m * 1.05 + 1.2, c.z + m * 0.95);
    const rect = this.container.getBoundingClientRect();
    const aspect = rect.width / Math.max(rect.height, 1);
    const half = Math.max(size.z / 2 + 0.6, (size.x / 2 + 0.6) / aspect);
    Object.assign(this.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half, zoom: 1 });
    this.ortho.position.set(c.x, 60, c.z);
    this.orthoControls.target.set(c.x, 0, c.z);
    this.ortho.updateProjectionMatrix();
  }

  resetCamera() {
    const room = this.store.project.room;
    const m = Math.max(room.w, room.d) / 100;
    const cx = (room.x ?? 0) / 100, cz = (room.z ?? 0) / 100;
    this.persp.position.set(cx + m * 0.7, m * 0.95 + this.levelElev(this.levelId), cz + m * 1.25);
    this.controls.target.set(cx, 0.6 + this.levelElev(this.levelId), cz);
    this.fitOrtho();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.labels.setSize(width, height);
    this.persp.aspect = width / height;
    this.persp.updateProjectionMatrix();
    this.fitOrtho();
  }

  /** Widoczność: poziomy, automatyczne chowanie ścian przed kamerą, tryb ścian niskich. */
  updateVisibility() {
    const mode = this.store.project.room.wallMode ?? 'auto';
    const cam = this.camera.position, tgt = this.controls.target;
    const in3d = this.mode === '3d';
    const hiddenWalls = new Set();
    const iso = this.isolateId && this.store.item(this.isolateId);
    const isoPoly = iso ? roomPolygon(iso) : null;
    const isoBox = isoPoly ? bboxOf(isoPoly, 25) : null;
    if (this.isolateId && !iso) this.isolateId = null;
    for (const it of this.store.project.items) {
      const o = this.objects.get(it.id);
      if (!o) continue;
      let vis = this.levelVisible(o.userData.levelId);
      if (vis && iso) {
        if (o.userData.levelId !== this.level(iso.level).id) vis = false;
        else if (it.type === 'room') vis = it.id === iso.id;
        else if (it.type === 'wall') vis = wallTouchesBox(it, isoBox);
        else if (IN_WALL.has(it.type)) vis = pointInBox(it.x, it.z, isoBox);
        else vis = pointInPolygon(it.x, it.z, isoPoly);
      }
      o.scale.y = 1;
      if (vis && it.type === 'wall' && in3d) {
        if (mode === 'hidden') vis = false;
        else if (mode === 'low') o.scale.y = Math.min(1, 1 / Math.max(it.h / 100, 0.01));
        else if (mode === 'auto') {
          const a = deg(it.rot), nx = -Math.sin(a), nz = Math.cos(a);
          const sc = (cam.x - it.x / 100) * nx + (cam.z - it.z / 100) * nz;
          const st = (tgt.x - it.x / 100) * nx + (tgt.z - it.z / 100) * nz;
          // ściana między kamerą a punktem, na który patrzymy (i kamera nie jest wysoko nad nią)
          if (sc * st < 0 && Math.abs(sc) > 0.05) vis = false;
        }
        if (!vis) hiddenWalls.add(it.id);
      }
      o.visible = vis;
      if (it.type === 'wall') for (const c of o.children) if (c.children[0]?.userData.cap) c.visible = !in3d;
      if (it.type === 'room') o.traverse((c) => { if (c.isCSS2DObject) c.visible = vis && this.showRoomLabels !== false; });
    }
    for (const it of this.store.project.items) {
      if (!IN_WALL.has(it.type)) continue;
      const o = this.objects.get(it.id);
      if (!o || !o.visible || !in3d) continue;
      if (mode === 'low' || mode === 'hidden' || hiddenWalls.has(this.hostOf.get(it.id))) o.visible = false;
    }
    for (const p of this.planGroup.children) {
      const l = this.level(p.userData.levelId);
      p.visible = (this.mode === '2d' || p.userData.show3d) && (l.id === this.levelId || (this.levelView !== 'current' && this.mode === '3d' && this.levelVisible(l.id)));
    }
  }

  render() {
    (this.mode === '2d' ? this.orthoControls : this.controls).update();
    this.updateVisibility();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  screenshot() {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  // ---------- wskaźnik ----------
  ndc(ev) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Punkt na płaszczyźnie podłogi bieżącego poziomu (w metrach). */
  floorPoint(ev, y = this.levelElev(this.levelId)) {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);
    this.floorPlane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null;
  }

  pickItem(ev) {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);
    const hits = this.raycaster.intersectObjects(this.itemsGroup.children, true);
    for (const h of hits) {
      let o = h.object, visible = true;
      while (o && !o.userData.itemId) {
        if (!o.visible) visible = false;
        o = o.parent;
      }
      if (!o || !o.visible || !visible) continue;
      if (o.userData.levelId !== this.levelId) continue; // tylko elementy bieżącego poziomu
      return o.userData.itemId;
    }
    return null;
  }

  setTool(tool) {
    this.tool = tool;
    this.drawStart = null;
    this.calibStart = null;
    this.roomPts = null;
    if (this.roomLine) this.roomLine.visible = false;
    this.toolLine.visible = this.toolLabel.visible = this.toolCursor.visible = false;
    this.renderer.domElement.style.cursor = tool ? 'crosshair' : '';
  }

  /** Końce wszystkich ścian bieżącego poziomu (cm) – do przyciągania. */
  wallEnds() {
    const out = [];
    for (const it of this.store.project.items) {
      if (it.type !== 'wall' || this.level(it.level).id !== this.levelId) continue;
      const a = deg(it.rot), L = (it.w - it.d) / 2;
      out.push([it.x - Math.cos(a) * L, it.z - Math.sin(a) * L], [it.x + Math.cos(a) * L, it.z + Math.sin(a) * L]);
    }
    return out;
  }

  /** Punkt rysowania ściany: przyciąganie do końców ścian, siatki i kątów co 45°. */
  drawPoint(ev) {
    const p = this.floorPoint(ev);
    if (!p) return null;
    let x = p.x * 100, z = p.z * 100;
    let best = null, bd = 20;
    for (const [ex, ez] of this.wallEnds()) {
      const dd = Math.hypot(ex - x, ez - z);
      if (dd < bd) (bd = dd), (best = [ex, ez]);
    }
    if (best) return { x: best[0], z: best[1], snapped: true };
    if (this.drawStart && !ev.shiftKey) {
      const dx = x - this.drawStart.x, dz = z - this.drawStart.z;
      const L = Math.hypot(dx, dz), ang = Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const s = this.snap || 1;
      const Ls = Math.round(L / s) * s;
      return { x: this.drawStart.x + Math.cos(ang) * Ls, z: this.drawStart.z + Math.sin(ang) * Ls };
    }
    const s = this.snap || 1;
    return { x: Math.round(x / s) * s, z: Math.round(z / s) * s };
  }

  /** Podgląd rysowanego pomieszczenia (łamana). */
  showRoomPreview() {
    const y = this.levelElev(this.levelId) + 0.02;
    if (!this.roomLine) {
      this.roomLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#16a34a', depthTest: false }));
      this.roomLine.renderOrder = 20;
      this.toolGroup.add(this.roomLine);
    }
    this.roomLine.geometry.dispose();
    this.roomLine.geometry = new THREE.BufferGeometry().setFromPoints((this.roomPts ?? []).map((p) => new THREE.Vector3(p.x / 100, y, p.z / 100)));
    this.roomLine.visible = true;
  }

  finishRoom() {
    const pts = this.roomPts ?? [];
    this.setTool('room');
    if (pts.length >= 3) this.onRoomDrawn(pts);
  }

  showToolLine(a, b, text) {
    const y = this.levelElev(this.levelId) + 0.02;
    this.toolLine.geometry.setFromPoints([new THREE.Vector3(a.x / 100, y, a.z / 100), new THREE.Vector3(b.x / 100, y, b.z / 100)]);
    this.toolLine.visible = true;
    this.toolLabel.element.textContent = text;
    this.toolLabel.position.set((a.x + b.x) / 200, y, (a.z + b.z) / 200);
    this.toolLabel.visible = true;
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let drag = null;
    let down = null;

    el.addEventListener('dblclick', () => {
      if (this.tool === 'wall') this.setTool('wall');
      if (this.tool === 'room') this.finishRoom();
    });
    el.addEventListener('contextmenu', (e) => {
      if (this.tool === 'wall' && this.drawStart) {
        e.preventDefault();
        this.setTool('wall');
      }
    });

    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY };

      if (this.tool === 'wall') {
        const p = this.drawPoint(ev);
        if (!p) return;
        if (this.drawStart && Math.hypot(p.x - this.drawStart.x, p.z - this.drawStart.z) > 5) {
          this.onWallDrawn(this.drawStart, p);
        }
        this.drawStart = { x: p.x, z: p.z };
        return;
      }
      if (this.tool === 'room') {
        const p = this.drawPoint(ev);
        if (!p) return;
        const pts = (this.roomPts ??= []);
        if (pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.z - pts[0].z) < 15) return this.finishRoom();
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 2) pts.push({ x: p.x, z: p.z });
        this.drawStart = pts[pts.length - 1];
        this.showRoomPreview();
        return;
      }
      if (this.tool === 'calib') {
        const p = this.floorPoint(ev);
        if (!p) return;
        const q = { x: p.x * 100, z: p.z * 100 };
        if (!this.calibStart) this.calibStart = q;
        else {
          const a = this.calibStart;
          this.setTool(null);
          this.onCalibrate(a, q);
        }
        return;
      }
      if (this.tool === 'plan') {
        const plan = this.level().plan;
        const p = this.floorPoint(ev);
        if (!plan || !p) return;
        drag = { plan: true, sx: p.x * 100, sz: p.z * 100, px: plan.x, pz: plan.z, moved: false };
        el.setPointerCapture(ev.pointerId);
        return;
      }

      const id = this.pickItem(ev);
      if (id) {
        this.select(id);
        const item = this.store.item(id);
        if (item.locked) return;
        if (item.type === 'wall' && this.mode === '3d') return; // w 3D ściany nie przesuwamy (łatwo o pomyłkę)
        if (item.type === 'room' && !item.movable) return; // pomieszczenie tylko zaznaczamy
        const p = this.floorPoint(ev);
        if (!p) return;
        drag = { id, dx: item.x / 100 - p.x, dz: item.z / 100 - p.z, moved: false };
        this.controls.enabled = false;
        el.setPointerCapture(ev.pointerId);
      }
    });

    el.addEventListener('pointermove', (ev) => {
      if (this.tool === 'wall' || this.tool === 'room') {
        const p = this.drawPoint(ev);
        if (!p) return;
        const y = this.levelElev(this.levelId) + 0.02;
        this.toolCursor.position.set(p.x / 100, y, p.z / 100);
        this.toolCursor.material.color.set(p.snapped ? '#16a34a' : '#e5484d');
        this.toolCursor.visible = true;
        if (this.drawStart) this.showToolLine(this.drawStart, p, `${Math.round(Math.hypot(p.x - this.drawStart.x, p.z - this.drawStart.z))} cm`);
        return;
      }
      if (this.tool === 'calib') {
        const p = this.floorPoint(ev);
        if (!p) return;
        const q = { x: p.x * 100, z: p.z * 100 };
        this.toolCursor.position.set(p.x, p.y + 0.02, p.z);
        this.toolCursor.visible = true;
        if (this.calibStart) this.showToolLine(this.calibStart, q, 'wskaż drugi koniec');
        return;
      }
      if (!drag) return;
      const p = this.floorPoint(ev);
      if (!p) return;
      if (!drag.moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) return;
      drag.moved = true;
      if (drag.plan) {
        const plan = this.level().plan;
        plan.x = Math.round(drag.px + p.x * 100 - drag.sx);
        plan.z = Math.round(drag.pz + p.z * 100 - drag.sz);
        const mesh = this.planGroup.children.find((m) => m.userData.levelId === this.levelId);
        mesh?.position.set(plan.x / 100, mesh.position.y, plan.z / 100);
        return;
      }
      const item = this.store.item(drag.id);
      Object.assign(item, this.constrain(item, (p.x + drag.dx) * 100, (p.z + drag.dz) * 100));
      const o = this.objects.get(item.id);
      o.position.set(item.x / 100, (item.elev ?? 0) / 100 + this.levelElev(item.level), item.z / 100);
      o.rotation.y = deg(-item.rot);
      this.updateSelection();
      this.onItemMoved(item, false);
    });

    const end = (ev) => {
      if (drag) {
        const d = drag;
        drag = null;
        this.controls.enabled = this.mode === '3d';
        el.releasePointerCapture?.(ev.pointerId);
        if (d.plan) {
          if (d.moved) this.onToolDone('plan');
        } else if (d.moved) {
          const it = this.store.item(this.selectedId);
          this.rebuildItem(it.id);
          this.onItemMoved(it, true);
        }
      } else if (!this.tool && down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) {
        this.select(null);
      }
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Przyciąganie do siatki i ścian, ograniczenie do podłogi. Zwraca {x, z, rot}. */
  constrain(item, x, z) {
    const room = this.store.project.room;
    const cx = room.x ?? 0, cz = room.z ?? 0;
    const W = room.w / 2, D = room.d / 2;
    const s = this.snap;
    if (s > 0) {
      x = Math.round(x / s) * s;
      z = Math.round(z / s) * s;
    }
    let rot = item.rot;
    if (IN_WALL.has(item.type)) {
      // drzwi i okna "wchodzą" w najbliższą ścianę i ustawiają się równolegle do niej
      let best = null, bd = 80;
      for (const w of this.store.project.items) {
        if (w.type !== 'wall' || this.level(w.level).id !== this.level(item.level).id) continue;
        const a = deg(w.rot), ux = Math.cos(a), uz = Math.sin(a);
        const vx = x - w.x, vz = z - w.z;
        const half = Math.max(0, (w.w - w.d) / 2 - item.w / 2);
        const along = Math.max(-half, Math.min(half, vx * ux + vz * uz));
        const perp = -vx * uz + vz * ux;
        const dist = Math.hypot(vx - along * ux, vz - along * uz);
        if (dist < bd) (bd = dist), (best = { x: w.x + along * ux, z: w.z + along * uz, rot: perp >= 0 ? w.rot : (w.rot + 180) % 360 });
      }
      if (best) return { x: round1(best.x), z: round1(best.z), rot: round1(best.rot) };
      return { x, z, rot };
    }
    if (FREE.has(item.type)) return { x: round1(x), z: round1(z), rot };
    const a = deg(rot);
    const hx = (Math.abs(Math.cos(a)) * item.w + Math.abs(Math.sin(a)) * item.d) / 2;
    const hz = (Math.abs(Math.sin(a)) * item.w + Math.abs(Math.cos(a)) * item.d) / 2;
    const snapDist = 8;
    if (Math.abs(x - (cx - W + hx)) < snapDist) x = cx - W + hx;
    if (Math.abs(x - (cx + W - hx)) < snapDist) x = cx + W - hx;
    if (Math.abs(z - (cz - D + hz)) < snapDist) z = cz - D + hz;
    if (Math.abs(z - (cz + D - hz)) < snapDist) z = cz + D - hz;
    x = hx < W ? clamp(x, cx - W + hx, cx + W - hx) : cx;
    z = hz < D ? clamp(z, cz - D + hz, cz + D - hz) : cz;
    return { x: round1(x), z: round1(z), rot };
  }
}

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const round1 = (v) => Math.round(v * 10) / 10;

function disposeLabels(obj) {
  obj.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
}

/** Wielokąt pomieszczenia w cm, w układzie świata. */
export function roomPolygon(it) {
  const sx = it.pw ? it.w / it.pw : 1, sz = it.pd ? it.d / it.pd : 1;
  return (it.points ?? []).map(([x, z]) => [it.x + x * sx, it.z + z * sz]);
}

function bboxOf(p, pad = 0) {
  const xs = p.map((q) => q[0]), zs = p.map((q) => q[1]);
  return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad };
}

function pointInBox(x, z, b) {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** Czy oś ściany przechodzi przez prostokąt (Liang–Barsky). */
function wallTouchesBox(w, b) {
  const a = deg(w.rot), L = w.w / 2;
  const x1 = w.x - Math.cos(a) * L, z1 = w.z - Math.sin(a) * L, x2 = w.x + Math.cos(a) * L, z2 = w.z + Math.sin(a) * L;
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dz = z2 - z1;
  for (const [p, q] of [[-dx, x1 - b.x0], [dx, b.x1 - x1], [-dz, z1 - b.z0], [dz, b.z1 - z1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

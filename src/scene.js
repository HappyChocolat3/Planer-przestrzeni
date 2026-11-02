// Scena 3D: renderer, kamery (3D / rzut 2D), pomieszczenie, meble, zaznaczanie i przeciąganie.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { boxGeo } from './geometry.js';
import { getMaterial } from './materials.js';
import { buildItem } from './furniture.js';

const WALL_T = 0.12;
const IN_WALL = new Set(['door', 'window']);

export class Viewer {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this.objects = new Map(); // id -> Object3D
    this.gltfCache = new Map(); // src -> gltf
    this.selectedId = null;
    this.mode = '3d';
    this.snap = 5; // cm
    this.onSelect = () => {};
    this.onItemMoved = () => {};

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
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
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);

    this.persp = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
    this.persp.position.set(4.5, 5.5, 7);
    this.ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    this.ortho.position.set(0, 30, 0);
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
    this.itemsGroup = new THREE.Group();
    scene.add(this.roomGroup, this.itemsGroup);

    this.selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#1f7aec'));
    this.selBox.visible = false;
    this.selBox.material.depthTest = false;
    this.selBox.renderOrder = 10;
    scene.add(this.selBox);

    this.dimLabel = new CSS2DObject(Object.assign(document.createElement('div'), { className: 'dim-label' }));
    this.dimLabel.visible = false;
    scene.add(this.dimLabel);

    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.rebuildRoom();
    this.rebuildAll();
    r.setAnimationLoop(() => this.render());
  }

  // ---------- pomieszczenie ----------
  rebuildRoom() {
    const g = this.roomGroup;
    g.clear();
    const room = this.store.project.room;
    const W = room.w / 100, D = room.d / 100, H = room.h / 100;
    const floorMat = getMaterial(room.floor.mat, room.floor.color);
    const floor = new THREE.Mesh(boxGeo(W + 2 * WALL_T, 0.02, D + 2 * WALL_T), floorMat);
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    floor.userData.isFloor = true;
    g.add(floor);

    const wallMat = getMaterial(room.walls.mat, room.walls.color);
    const mk = (w, d, x, z, side) => {
      const m = new THREE.Mesh(boxGeo(w, H, d), wallMat);
      m.position.set(x, H / 2, z);
      m.castShadow = m.receiveShadow = true;
      m.userData.side = side;
      g.add(m);
      return m;
    };
    this.walls = [
      mk(W + 2 * WALL_T, WALL_T, 0, -D / 2 - WALL_T / 2, 'n'),
      mk(W + 2 * WALL_T, WALL_T, 0, D / 2 + WALL_T / 2, 's'),
      mk(WALL_T, D, -W / 2 - WALL_T / 2, 0, 'w'),
      mk(WALL_T, D, W / 2 + WALL_T / 2, 0, 'e'),
    ];
    // obrys ścian od góry (widoczny także przy ukrytych ścianach)
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, 0.001, D)),
      new THREE.LineBasicMaterial({ color: '#5b6573' }),
    );
    outline.position.y = 0.002;
    g.add(outline);

    this.grid = new THREE.GridHelper(Math.max(W, D) + 2, Math.round((Math.max(W, D) + 2) * 2), '#8a96a3', '#b6c0ca');
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.35;
    this.grid.position.y = 0.003;
    this.grid.visible = this.mode === '2d' || this.showGrid;
    g.add(this.grid);

    // wymiary pomieszczenia
    const lbl = (text, x, z) => {
      const el = document.createElement('div');
      el.className = 'room-dim';
      el.textContent = text;
      const o = new CSS2DObject(el);
      o.position.set(x, 0.01, z);
      g.add(o);
    };
    lbl(`${room.w} cm`, 0, D / 2 + WALL_T + 0.25);
    lbl(`${room.d} cm`, W / 2 + WALL_T + 0.35, 0);

    const s = this.sun.shadow.camera;
    const ext = Math.max(W, D) / 2 + 1;
    s.left = s.bottom = -ext;
    s.right = s.top = ext;
    s.updateProjectionMatrix();
    this.fitOrtho();
  }

  // ---------- meble ----------
  rebuildAll() {
    for (const o of this.objects.values()) this.itemsGroup.remove(o);
    this.objects.clear();
    for (const it of this.store.project.items) this.rebuildItem(it.id);
    if (this.selectedId && !this.objects.has(this.selectedId)) this.select(null);
    this.updateSelection();
  }

  rebuildItem(id) {
    const old = this.objects.get(id);
    if (old) this.itemsGroup.remove(old);
    this.objects.delete(id);
    const item = this.store.item(id);
    if (!item) return;
    if (item.type === 'gltf' && !this.gltfCache.has(item.src)) this.requestModel?.(item);
    const obj = buildItem(item, this.gltfCache);
    this.itemsGroup.add(obj);
    this.objects.set(id, obj);
    if (id === this.selectedId) this.updateSelection();
  }

  removeItemObject(id) {
    const o = this.objects.get(id);
    if (o) this.itemsGroup.remove(o);
    this.objects.delete(id);
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
    this.dimLabel.element.textContent = `${it.w} × ${it.d} × ${it.h} cm`;
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
    this.grid.visible = is2d || this.showGrid;
    this.fitOrtho();
  }

  fitOrtho() {
    const room = this.store.project.room;
    const rect = this.container.getBoundingClientRect();
    const aspect = rect.width / Math.max(rect.height, 1);
    const W = room.w / 100 + 1.8, D = room.d / 100 + 1.4;
    const halfH = Math.max(D / 2, W / 2 / aspect);
    Object.assign(this.ortho, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH, zoom: 1 });
    this.ortho.position.set(0, 30, 0);
    this.orthoControls.target.set(0, 0, 0);
    this.ortho.updateProjectionMatrix();
  }

  resetCamera() {
    const room = this.store.project.room;
    const m = Math.max(room.w, room.d) / 100;
    this.persp.position.set(m * 0.7, m * 0.95, m * 1.25);
    this.controls.target.set(0, 0.6, 0);
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

  updateWalls() {
    const mode = this.store.project.room.wallMode;
    const cam = this.camera.position;
    const room = this.store.project.room;
    const W = room.w / 200, D = room.d / 200;
    for (const w of this.walls) {
      let vis = mode !== 'hidden';
      if (mode === 'auto' && this.mode === '3d') {
        const s = w.userData.side;
        if ((s === 'n' && cam.z < -D) || (s === 's' && cam.z > D) || (s === 'w' && cam.x < -W) || (s === 'e' && cam.x > W)) vis = false;
      }
      w.visible = vis;
    }
    // drzwi i okna w ukrytych ścianach też chowamy
    const hidden = new Set(this.walls.filter((w) => !w.visible).map((w) => w.userData.side));
    for (const it of this.store.project.items) {
      if (!IN_WALL.has(it.type)) continue;
      const o = this.objects.get(it.id);
      if (!o) continue;
      const side = { 0: 'n', 180: 's', 270: 'w', 90: 'e' }[it.rot];
      o.visible = !(side && hidden.has(side));
    }
  }

  render() {
    (this.mode === '2d' ? this.orthoControls : this.controls).update();
    this.updateWalls();
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

  floorPoint(ev, y = 0) {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);
    this.floorPlane.constant = -y;
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null;
  }

  pickItem(ev) {
    this.raycaster.setFromCamera(this.ndc(ev), this.camera);
    const hits = this.raycaster.intersectObjects(this.itemsGroup.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.itemId) o = o.parent;
      if (o) return o.userData.itemId;
    }
    return null;
  }

  bindPointer() {
    const el = this.renderer.domElement;
    let drag = null;
    let down = null;
    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY };
      const id = this.pickItem(ev);
      if (id) {
        this.select(id);
        const item = this.store.item(id);
        if (item.locked) return;
        const p = this.floorPoint(ev);
        if (!p) return;
        drag = { id, dx: item.x / 100 - p.x, dz: item.z / 100 - p.z, moved: false };
        this.controls.enabled = false;
        el.setPointerCapture(ev.pointerId);
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      const p = this.floorPoint(ev);
      if (!p) return;
      const item = this.store.item(drag.id);
      const nx = (p.x + drag.dx) * 100, nz = (p.z + drag.dz) * 100;
      if (!drag.moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) return;
      drag.moved = true;
      Object.assign(item, this.constrain(item, nx, nz));
      const o = this.objects.get(item.id);
      o.position.set(item.x / 100, (item.elev ?? 0) / 100, item.z / 100);
      o.rotation.y = THREE.MathUtils.degToRad(-item.rot);
      this.updateSelection();
      this.onItemMoved(item, false);
    });
    const end = (ev) => {
      if (drag) {
        const moved = drag.moved;
        drag = null;
        this.controls.enabled = this.mode === '3d';
        el.releasePointerCapture?.(ev.pointerId);
        if (moved) this.onItemMoved(this.store.item(this.selectedId), true);
      } else if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) {
        this.select(null);
      }
      down = null;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Przyciąganie do siatki i ścian, ograniczenie do pomieszczenia. Zwraca {x, z, rot}. */
  constrain(item, x, z) {
    const room = this.store.project.room;
    const W = room.w / 2, D = room.d / 2;
    const s = this.snap;
    if (s > 0) {
      x = Math.round(x / s) * s;
      z = Math.round(z / s) * s;
    }
    let rot = item.rot;
    if (IN_WALL.has(item.type)) {
      // drzwi i okna "przyklejają się" do najbliższej ściany
      const dists = [
        ['n', Math.abs(z + D)], ['s', Math.abs(z - D)], ['w', Math.abs(x + W)], ['e', Math.abs(x - W)],
      ].sort((a, b) => a[1] - b[1]);
      const side = dists[0][0], off = (WALL_T * 100) / 2;
      const half = item.w / 2;
      if (side === 'n') { z = -D - off; rot = 0; x = clamp(x, -W + half, W - half); }
      if (side === 's') { z = D + off; rot = 180; x = clamp(x, -W + half, W - half); }
      if (side === 'w') { x = -W - off; rot = 270; z = clamp(z, -D + half, D - half); }
      if (side === 'e') { x = W + off; rot = 90; z = clamp(z, -D + half, D - half); }
      return { x, z, rot };
    }
    const a = THREE.MathUtils.degToRad(rot);
    const hx = (Math.abs(Math.cos(a)) * item.w + Math.abs(Math.sin(a)) * item.d) / 2;
    const hz = (Math.abs(Math.sin(a)) * item.w + Math.abs(Math.cos(a)) * item.d) / 2;
    const snapDist = 8;
    if (Math.abs(x - (-W + hx)) < snapDist) x = -W + hx;
    if (Math.abs(x - (W - hx)) < snapDist) x = W - hx;
    if (Math.abs(z - (-D + hz)) < snapDist) z = -D + hz;
    if (Math.abs(z - (D - hz)) < snapDist) z = D - hz;
    x = hx < W ? clamp(x, -W + hx, W - hx) : 0;
    z = hz < D ? clamp(z, -D + hz, D - hz) : 0;
    return { x: round1(x), z: round1(z), rot };
  }
}

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const round1 = (v) => Math.round(v * 10) / 10;

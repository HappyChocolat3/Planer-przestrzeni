// Pomocnicze funkcje geometrii (wymiary w metrach).
import * as THREE from 'three';

/** Prostopadłościan z UV w skali świata (1 jednostka UV = 1 m), żeby tekstury się nie rozciągały. */
export function boxGeo(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // kolejność ścian BoxGeometry: +x, -x, +y, -y, +z, -z (po 4 wierzchołki)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * dims[f][0], uv.getY(idx) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Dodaje prostopadłościan; (x, y, z) = środek podstawy. */
export function addBox(parent, mat, w, h, d, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Walec pionowy; (x, y, z) = środek podstawy. */
export function addCyl(parent, mat, r, h, x = 0, y = 0, z = 0, seg = 20, rTop = r) {
  const geo = new THREE.CylinderGeometry(rTop, r, h, seg);
  // UV w skali świata: obwód × wysokość (wzory i tekstury bez rozciągania)
  const uv = geo.attributes.uv, circ = Math.PI * (r + rTop);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Zaokrąglony prostopadłościan (poduchy, materace). */
export function addRounded(parent, mat, w, h, d, r, x = 0, y = 0, z = 0) {
  r = Math.min(r, w / 2, h / 2, d / 2) * 0.95;
  // kształt pomniejszony o r – fazowanie (bevel) "dopompowuje" go z powrotem do w × h × d
  const iw = Math.max(w - 2 * r, 0.002), ih = Math.max(h - 2 * r, 0.002);
  const cr = Math.min(iw, ih) * 0.25;
  const shape = new THREE.Shape();
  shape.moveTo(-iw / 2 + cr, -ih / 2);
  shape.lineTo(iw / 2 - cr, -ih / 2);
  shape.quadraticCurveTo(iw / 2, -ih / 2, iw / 2, -ih / 2 + cr);
  shape.lineTo(iw / 2, ih / 2 - cr);
  shape.quadraticCurveTo(iw / 2, ih / 2, iw / 2 - cr, ih / 2);
  shape.lineTo(-iw / 2 + cr, ih / 2);
  shape.quadraticCurveTo(-iw / 2, ih / 2, -iw / 2, ih / 2 - cr);
  shape.lineTo(-iw / 2, -ih / 2 + cr);
  shape.quadraticCurveTo(-iw / 2, -ih / 2, -iw / 2 + cr, -ih / 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(d - 2 * r, 0.001), bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 4, curveSegments: 6,
  });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  // UV w skali świata: rzut na płaszczyznę zależnie od kierunku ściany (góra/dół, boki, przód/tył)
  geo.computeVertexNormals();
  const pos = geo.attributes.position, uv = geo.attributes.uv, nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, pos.getX(i), pos.getZ(i));
    else if (nx >= nz) uv.setXY(i, pos.getZ(i), pos.getY(i));
    else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  uv.needsUpdate = true;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

import * as THREE from 'three';

export type ChamferEmit = (points: THREE.Vector3[], normal: THREE.Vector3, face: { axis: number; sign: number } | null) => void;

/**
 * Walks the polygons of a box centred on the origin with chamfered edges: six main faces, twelve edge strips
 * and eight corner triangles. `face` is set for the main faces and null for the chamfers.
 */
export function chamferedBox(half: THREE.Vector3, bevel: number, emit: ChamferEmit) {
  const h = half.toArray();
  const i = half
    .clone()
    .subScalar(bevel)
    .toArray();

  for (let a = 0; a < 3; a++) {
    for (const s of [-1, 1]) {
      const u = (a + 1) % 3;
      const v = (a + 2) % 3;
      const pts = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([du, dv]) => {
        const p = [0, 0, 0];
        p[a] = s * h[a];
        p[u] = du * i[u];
        p[v] = dv * i[v];
        return new THREE.Vector3().fromArray(p);
      });
      emit(pts, new THREE.Vector3().setComponent(a, s), { axis: a, sign: s });
    }
  }
  if (bevel <= 0) return;

  for (let a = 0; a < 3; a++) {
    for (let c = a + 1; c < 3; c++) {
      const e = 3 - a - c;
      for (const sa of [-1, 1]) {
        for (const sc of [-1, 1]) {
          const at = (onA: boolean, se: number) => {
            const p = [0, 0, 0];
            p[a] = sa * (onA ? h[a] : i[a]);
            p[c] = sc * (onA ? i[c] : h[c]);
            p[e] = se * i[e];
            return new THREE.Vector3().fromArray(p);
          };
          const n = new THREE.Vector3().setComponent(a, sa).setComponent(c, sc).normalize();
          emit([at(true, -1), at(true, 1), at(false, 1), at(false, -1)], n, null);
        }
      }
    }
  }
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s = [sx, sy, sz];
        const pts = [0, 1, 2].map((a) => new THREE.Vector3().fromArray(s.map((sign, k) => sign * (k === a ? h[k] : i[k]))));
        emit(pts, new THREE.Vector3(sx, sy, sz).normalize(), null);
      }
    }
  }
}

/** Triangulates a convex polygon facing `n`, fixing the winding so callers needn't care about point order. */
export function triangulate(pts: THREE.Vector3[], n: THREE.Vector3): number[] {
  const ab = new THREE.Vector3().subVectors(pts[1], pts[0]);
  const ac = new THREE.Vector3().subVectors(pts[2], pts[0]);
  const flip = ab.cross(ac).dot(n) < 0;
  const tris: number[] = [];
  for (let k = 1; k < pts.length - 1; k++) tris.push(0, k, k + 1);
  return flip ? tris.reverse() : tris;
}

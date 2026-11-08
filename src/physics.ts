import { Vector3 } from 'three';

export type SurfaceKind = 'solid' | 'bounce';

export interface Box {
  min: Vector3;
  max: Vector3;
  kind: SurfaceKind;
}

export interface RayHit {
  distance: number;
  box: Box;
}

/** Static collision geometry. Every solid in the city is an axis-aligned box, which keeps parkour moves predictable. */
export class World {
  readonly boxes: Box[] = [];

  add(min: Vector3, max: Vector3, kind: SurfaceKind = 'solid'): Box {
    const box = { min, max, kind };
    this.boxes.push(box);
    return box;
  }

  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Box[] = []): Box[] {
    out.length = 0;
    for (const b of this.boxes) {
      if (b.max.x > minX && b.min.x < maxX && b.max.y > minY && b.min.y < maxY && b.max.z > minZ && b.min.z < maxZ) {
        out.push(b);
      }
    }
    return out;
  }

  isFree(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    for (const b of this.boxes) {
      if (b.max.x > minX && b.min.x < maxX && b.max.y > minY && b.min.y < maxY && b.max.z > minZ && b.min.z < maxZ) {
        return false;
      }
    }
    return true;
  }

  containsPoint(p: Vector3): boolean {
    for (const b of this.boxes) {
      if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
    }
    return false;
  }

  /** Slab-method raycast. `dir` must be normalised. */
  raycast(origin: Vector3, dir: Vector3, maxDistance: number): RayHit | null {
    let best: RayHit | null = null;
    let bestT = maxDistance;
    for (const b of this.boxes) {
      let tMin = 0;
      let tMax = bestT;
      let hit = true;
      for (const axis of ['x', 'y', 'z'] as const) {
        const o = origin[axis];
        const d = dir[axis];
        if (Math.abs(d) < 1e-9) {
          if (o < b.min[axis] || o > b.max[axis]) {
            hit = false;
            break;
          }
        } else {
          let t1 = (b.min[axis] - o) / d;
          let t2 = (b.max[axis] - o) / d;
          if (t1 > t2) [t1, t2] = [t2, t1];
          if (t1 > tMin) tMin = t1;
          if (t2 < tMax) tMax = t2;
          if (tMin > tMax) {
            hit = false;
            break;
          }
        }
      }
      if (hit && tMin < bestT) {
        bestT = tMin;
        best = { distance: tMin, box: b };
      }
    }
    return best;
  }

  /** Height of the highest surface below `fromY` at (x, z), or -Infinity. */
  groundBelow(x: number, z: number, fromY: number, radius = 0): number {
    let top = -Infinity;
    for (const b of this.boxes) {
      if (x + radius > b.min.x && x - radius < b.max.x && z + radius > b.min.z && z - radius < b.max.z) {
        if (b.max.y <= fromY && b.max.y > top) top = b.max.y;
      }
    }
    return top;
  }
}

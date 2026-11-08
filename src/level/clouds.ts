import * as THREE from 'three';
import { matte } from '../materials';
import type { Level } from './builder';

const material = matte(0xffffff, { emissive: 0x8a8aa8, roughness: 1 });

// Flat-bottomed puffs read as cartoon cumulus rather than floating balls.
const puff = new THREE.IcosahedronGeometry(1, 2);
{
  const pos = puff.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, Math.max(pos.getY(i), -0.25));
  puff.computeVertexNormals();
}

interface CloudOptions {
  count: number;
  /** Height range of the cloud bases. */
  y: [number, number];
  /** How far beyond the course clouds may drift. */
  margin: number;
  /** Multiplier on each puff's size. */
  scale?: number;
}

/** Scatters clouds over the course's footprint and adds them to the level. */
export function addClouds(level: Level, { count, y, margin, scale = 1 }: CloudOptions) {
  const min = new THREE.Vector3(Infinity, 0, Infinity);
  const max = new THREE.Vector3(-Infinity, 0, -Infinity);
  for (const cp of level.checkpoints) {
    min.min(cp.point);
    max.max(cp.point);
  }
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const mesh = new THREE.Mesh(puff, material);
      const size = (2.5 + Math.random() * 2 + (j > 0 && j < n - 1 ? 1.5 : 0)) * scale;
      mesh.position.set((j * 3 - n * 1.5) * scale, size * 0.25, (Math.random() - 0.5) * 3 * scale);
      mesh.scale.setScalar(size);
      cloud.add(mesh);
    }
    cloud.position.set(
      min.x - margin + Math.random() * (max.x - min.x + margin * 2),
      y[0] + Math.random() * (y[1] - y[0]),
      min.z - margin + Math.random() * (max.z - min.z + margin * 2),
    );
    level.group.add(cloud);
  }
}

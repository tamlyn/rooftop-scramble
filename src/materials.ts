import * as THREE from 'three';

/** Soft, slightly satin painted surface; the house style for everything that isn't glass or glowing. */
export function matte(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}

/** Glossy toy plastic for characters and items, so they pop against the matte city. */
export function plastic(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0, ...extra });
}

/**
 * Frees the GPU resources of everything under `root`. Including resources shared with live objects is safe:
 * three.js uploads them again the next time they're drawn.
 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const { geometry, material } = o as Partial<THREE.Mesh>;
    geometry?.dispose();
    for (const m of [material ?? []].flat()) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

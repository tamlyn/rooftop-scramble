import * as THREE from 'three';

/** Soft, slightly satin painted surface; the house style for everything that isn't glass or glowing. */
export function matte(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
}

/** Glossy toy plastic for characters and items, so they pop against the matte city. */
export function plastic(color: number, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0, ...extra });
}

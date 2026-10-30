import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Merges `parts` into one geometry and disposes them. All parts must be indexed and share the same attributes. */
export function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error(`${label}: geometries could not be merged`)
  return merged
}

/** Box standing on y = 0. `taper` scales the top face (pylons, plinths). */
export function block(width: number, height: number, depth: number, taper = 1): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  if (taper !== 1) {
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) > 0) position.setXYZ(i, position.getX(i) * taper, position.getY(i), position.getZ(i) * taper)
    }
    geometry.computeVertexNormals()
  }
  return geometry.translate(0, height / 2, 0)
}

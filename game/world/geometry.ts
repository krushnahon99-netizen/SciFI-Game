import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Merges `parts` into one geometry and disposes them. All parts must be indexed and share the same attributes. */
export function mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error(`${label}: geometries could not be merged`)
  return merged
}

/** Static parts collected per material and merged once: one draw call per material. */
export class Batch {
  private readonly buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()

  /** Takes ownership of `geometry`; rotations apply in three's default XYZ Euler order (z first). */
  add(
    material: THREE.Material,
    geometry: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rotation: { x?: number; y?: number; z?: number } = {},
  ) {
    if (rotation.z) geometry.rotateZ(rotation.z)
    if (rotation.y) geometry.rotateY(rotation.y)
    if (rotation.x) geometry.rotateX(rotation.x)
    geometry.translate(x, y, z)
    const bucket = this.buckets.get(material)
    if (bucket) bucket.push(geometry)
    else this.buckets.set(material, [geometry])
  }

  /** Adds one mesh per material under a new group in `parent`; `unlit` (glowing) materials take no part in shadows. */
  build(parent: THREE.Object3D, name: string, ...unlit: THREE.Material[]): THREE.Group {
    const group = new THREE.Group()
    group.name = name
    for (const [material, parts] of this.buckets) {
      const mesh = new THREE.Mesh(mergeParts(parts, name), material)
      const lit = !unlit.includes(material)
      mesh.castShadow = lit
      mesh.receiveShadow = lit
      group.add(mesh)
    }
    this.buckets.clear()
    parent.add(group)
    return group
  }
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

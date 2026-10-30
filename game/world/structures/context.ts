import type * as THREE from 'three'
import type { ReactiveRegistry } from '../../echo/reactive'
import type { Collision } from '../../physics/collision'

/** Per-frame callback registered by a structure; World runs it from `update`. */
export type Animator = (dt: number, time: number) => void

/** What World hands each region builder: where to add meshes, colliders and echo reactives, and how to animate. */
export interface StructureContext {
  scene: THREE.Scene
  collision: Collision
  reactives: ReactiveRegistry
  animate: (animator: Animator) => void
}

import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { GlyphTrail } from '../../echo/glyphs'
import { PastStateOverlay } from '../../echo/pastState'
import { PhaseObject, type PhasePart } from '../../echo/phase'
import type { ReactiveRegistry } from '../../echo/reactive'
import type { Collision } from '../../physics/collision'
import { GHOST_GARDEN, MONOLITH, type Point2 } from '../layout'

export interface StructureContext {
  scene: THREE.Scene
  collision: Collision
  reactives: ReactiveRegistry
}

/** Hidden glyph path from the Cradle west to the Ghost Garden (no visible trail leads to secrets). */
const GARDEN_PATH: readonly Point2[] = [
  [-12, 238], [-34, 233], [-60, 228], [-88, 221], [-116, 213], [-138, 207],
]

/** Echo content of the Cradle (M2b). The monolith itself is still World's placeholder until M3a. */
export function buildCradleEchoes({ scene, collision, reactives }: StructureContext) {
  const heightAt = (x: number, z: number) => collision.groundHeight(x, z)
  const m = MONOLITH
  const ground = heightAt(m.x, m.z)
  const front: Point2 = [m.x + 0.4, m.z + 0.8]

  // The Sundered Monolith as it once stood: one upright slab, its ring and a floating capstone.
  const intact = new THREE.Group()
  intact.name = 'cradle.monolithPast'
  const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 30, 2.9))
  slab.position.set(front[0], ground + 15, front[1])
  slab.rotation.y = 0.35
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.22, 10, 72))
  ring.position.set(front[0], ground + 23, front[1])
  ring.rotation.y = 0.35
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(2.1, 0))
  cap.position.set(front[0], ground + 33.5, front[1])
  intact.add(slab, ring, cap)
  reactives.add(new PastStateOverlay(scene, intact))

  // Memory: the last procession to the monolith.
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [[m.x - 17, m.z + 19], [m.x - 9, m.z + 12], [m.x - 4, m.z + 7.5]], endPose: 'kneel', lookAt: front, speed: 1.2 },
        { path: [[m.x + 15, m.z + 21], [m.x + 9, m.z + 13], [m.x + 4.5, m.z + 8]], endPose: 'sing', lookAt: front, speed: 1.05, delay: 0.7 },
        { path: [[m.x + 0.5, m.z + 10]], pose: 'reach', lookAt: front, scale: 1.08 },
      ],
      heightAt,
      'cradle.pilgrims',
    ),
  )

  reactives.add(new GlyphTrail(scene, GARDEN_PATH, collision))
  reactives.add(new CrystalCluster(scene, collision, { x: 13, z: 226, count: 9, spread: 3.2, seed: 11 }))
  reactives.add(new CrystalCluster(scene, collision, { x: m.x - 7, z: m.z + 4, count: 6, spread: 2.2, seed: 5, size: 0.8 }))
  reactives.add(buildGhostGardenSteps(scene, collision))
}

/** Ghost Garden (secret): phase stepping stones spiralling up to a ledge; solid only while revealed. */
function buildGhostGardenSteps(scene: THREE.Scene, collision: Collision): PhaseObject {
  const { x: cx, z: cz } = GHOST_GARDEN
  const base = collision.groundHeight(cx, cz)
  const stone = new THREE.CylinderGeometry(1.2, 1.0, 0.5, 7)
  const parts: PhasePart[] = []
  for (let i = 0; i < 6; i++) {
    const angle = 0.6 + i * 0.75
    const x = cx + Math.cos(angle) * 6
    const z = cz + Math.sin(angle) * 6
    const top = Math.max(collision.groundHeight(x, z) + 0.6, base + 0.7 + i * 0.62)
    parts.push({ geometry: stone, position: { x, y: top - 0.25, z }, yaw: angle, collider: { radius: 1.15, bottom: top - 0.5, top } })
  }
  const ledgeTop = base + 4.3
  parts.push({
    geometry: new THREE.CylinderGeometry(2.6, 2.2, 0.7, 9),
    position: { x: cx, y: ledgeTop - 0.35, z: cz },
    collider: { radius: 2.5, bottom: ledgeTop - 0.7, top: ledgeTop },
  })
  return new PhaseObject(scene, collision, parts, 'garden.phaseSteps')
}

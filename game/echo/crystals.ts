import * as THREE from 'three'
import type { Collision } from '../physics/collision'
import { patchWorldMaterial } from '../render/shaderChunks'
import { mulberry32 } from '../world/noise'
import { PULSE_INACTIVE } from './pulseShader'
import { arrivalAt, type PulseInfo, type Reactive } from './reactive'

// Idle glow plus, from the latest arrived hit: a flare and a band of light climbing the shard.
const CRYSTAL_EMISSIVE = /* glsl */ `
  float cA = uEchoClock - vCrystalArrive.x;
  float cB = uEchoClock - vCrystalArrive.y;
  float cSince = min(cA < 0.0 ? 1e4 : cA, cB < 0.0 ? 1e4 : cB);
  float cFlare = exp(-cSince * 1.3);
  float cClimb = exp(-pow(vCrystalHeight - cSince * 4.0, 2.0) * 3.0) * exp(-cSince * 0.7);
  float cIdle = 0.55 + 0.3 * sin(uEchoTime * 1.7 + vWorldPos.x * 0.5 + vWorldPos.z * 0.37);
  totalEmissiveRadiance *= cIdle + cFlare * 6.0 + cClimb * 4.0;
`

export interface CrystalClusterSpec {
  x: number
  z: number
  count: number
  /** Scatter radius (m). */
  spread: number
  seed: number
  size?: number
  color?: THREE.ColorRepresentation
}

/** Resonant crystal shards (one instanced draw) that flare when the wavefront reaches each of them. */
export class CrystalCluster implements Reactive {
  readonly kind = 'crystals' as const
  readonly center = new THREE.Vector3()
  readonly radius: number
  private readonly arrive: THREE.InstancedBufferAttribute
  private readonly anchors: Float32Array

  constructor(scene: THREE.Scene, collision: Collision, spec: CrystalClusterSpec) {
    const random = mulberry32(spec.seed)
    const size = spec.size ?? 1
    const count = spec.count
    const geometry = new THREE.OctahedronGeometry(1, 0).scale(0.3, 1.1, 0.3).translate(0, 0.9, 0)
    this.arrive = new THREE.InstancedBufferAttribute(new Float32Array(count * 2).fill(PULSE_INACTIVE), 2)
    this.arrive.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aArrive', this.arrive)
    const material = patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: '#15232d',
        roughness: 0.22,
        metalness: 0.15,
        emissive: spec.color ?? '#3cc8ff',
        emissiveIntensity: 0.55,
        flatShading: true,
      }),
      {
        key: 'crystal',
        vertexPars: 'attribute vec2 aArrive;\nvarying vec2 vCrystalArrive;\nvarying float vCrystalHeight;',
        vertex: 'vCrystalArrive = aArrive;\nvCrystalHeight = position.y;',
        fragmentPars: 'varying vec2 vCrystalArrive;\nvarying float vCrystalHeight;',
        emissive: CRYSTAL_EMISSIVE,
      },
    )
    material.name = 'echo.crystal'
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.name = 'echo.crystals'
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.anchors = new Float32Array(count * 3)

    const up = new THREE.Vector3(0, 1, 0)
    const axis = new THREE.Vector3()
    const tilt = new THREE.Quaternion()
    const spin = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2
      const r = i === 0 ? 0 : (0.3 + 0.7 * Math.sqrt(random())) * spec.spread
      const x = spec.x + Math.cos(angle) * r
      const z = spec.z + Math.sin(angle) * r
      const ground = collision.groundHeight(x, z)
      const s = size * (i === 0 ? 1.5 : 0.55 + random() * 0.8)
      // Lean outward from the cluster centre, more at the rim.
      const lean = (r / Math.max(spec.spread, 1e-3)) * 0.45 + random() * 0.12
      axis.set(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean))
      spin.setFromAxisAngle(up, random() * Math.PI)
      tilt.setFromUnitVectors(up, axis).multiply(spin)
      position.set(x, ground - 0.15 * s, z)
      scale.set(s, s * (0.85 + random() * 0.5), s)
      mesh.setMatrixAt(i, matrix.compose(position, tilt, scale))
      this.anchors.set([x, ground + s, z], i * 3)
      if (s > 0.75) collision.addCylinder(x, z, 0.3 * s, ground - 1, ground + 1.8 * s)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    this.center.set(spec.x, collision.groundHeight(spec.x, spec.z) + 1, spec.z)
    this.radius = spec.spread + 2 * size
    scene.add(mesh)
  }

  hit(pulse: PulseInfo) {
    const arrive = this.arrive.array as Float32Array
    const anchors = this.anchors
    let changed = false
    for (let i = 0, n = anchors.length / 3; i < n; i++) {
      const at = arrivalAt(pulse, anchors[i * 3], anchors[i * 3 + 1], anchors[i * 3 + 2])
      if (at === Infinity) continue
      arrive[i * 2] = arrive[i * 2 + 1]
      arrive[i * 2 + 1] = at
      changed = true
    }
    if (changed) this.arrive.needsUpdate = true
  }
}

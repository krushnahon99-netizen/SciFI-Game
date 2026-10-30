import * as THREE from 'three'
import type { Collision } from '../physics/collision'
import { patchWorldMaterial } from '../render/shaderChunks'
import { mergeParts } from './geometry'
import {
  BRIDGE,
  CHASM,
  CHOIR,
  DROWNED_BELL,
  GHOST_GARDEN,
  HALL,
  MONOLITH,
  SLEEPING_GIANT,
  SPAWN,
  SPIRE,
  TERRAIN_CELL,
  TERRAIN_HALF,
  TERRAIN_SAMPLES,
  UNDERVAULT,
  VALE,
  VALE_FORMATIONS,
  VALE_RIBS,
  WORKS,
} from './layout'
import { createCrystalMaterial, createStoneMaterial, type MaterialVariant } from './materials'
import { mulberry32 } from './noise'
import type { Terrain } from './terrain'

/** Highest preset density: instances are generated for it and lower presets draw a prefix of them. */
const MAX_DENSITY = 1.3
/** Scatter stays inside the walkable area (the rim cliffs start around r 284). */
const SCATTER_RADIUS = 284
const TAU = Math.PI * 2

/** Kept clear of scatter: [x, z, radius]. */
const CLEARINGS: readonly (readonly [number, number, number])[] = [
  [SPAWN.x, SPAWN.z, 6],
  [MONOLITH.x, MONOLITH.z, 24],
  [13, 226, 5],
  [GHOST_GARDEN.x, GHOST_GARDEN.z, 11],
  [SLEEPING_GIANT.x, SLEEPING_GIANT.z, 18],
  [DROWNED_BELL.x, DROWNED_BELL.z, DROWNED_BELL.radius],
  [WORKS.x, WORKS.z, WORKS.radius + 8],
  [UNDERVAULT.x, UNDERVAULT.z, 16],
  [SPIRE.x, SPIRE.z, SPIRE.footRadius + 6],
  [BRIDGE.x - BRIDGE.halfSpan, BRIDGE.z, BRIDGE.padRadius + 4],
  [BRIDGE.x + BRIDGE.halfSpan, BRIDGE.z, BRIDGE.padRadius + 4],
  [CHOIR.x, CHOIR.z, 15],
  ...VALE_FORMATIONS.map((f) => [f.x, f.z, f.spread + f.size] as const),
  ...VALE_RIBS.flatMap((rib) => [
    [rib.a[0], rib.a[1], rib.radius * 2.5] as const,
    [rib.b[0], rib.b[1], rib.radius * 2.5] as const,
  ]),
]

function cleared(x: number, z: number): boolean {
  for (const [cx, cz, r] of CLEARINGS) {
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz < r * r) return true
  }
  if (Math.abs(x - HALL.x) < HALL.halfWidth + 5 && Math.abs(z - HALL.z) < HALL.halfLength + 8) return true
  return !CHASM.line.outside(x, z, CHASM.halfWidth + 4) && CHASM.line.distance(x, z) < CHASM.halfWidth + 4
}

// Instanced-scatter vertex stage: wind sway growing with height, collapse to the instance origin past a fade distance.
const SCATTER_VERTEX = /* glsl */ `
  vec3 scOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float scFade = 1.0 - smoothstep(uScatter.x, uScatter.y, distance(scOrigin, cameraPosition));
  float scPhase = uEchoTime * 1.4 + scOrigin.x * 0.23 + scOrigin.z * 0.17;
  vec2 scWind = vec2(0.6 + sin(scPhase) + 0.5 * sin(scPhase * 2.3 + 1.7), 0.25 + 0.6 * cos(scPhase * 0.8 + 0.4));
  echoWorld.xz += scWind * uScatter.z * position.y * position.y;
  echoWorld.xyz = mix(scOrigin, echoWorld.xyz, scFade);
  vWorldPos = echoWorld.xyz;
  mvPosition = viewMatrix * echoWorld;
  gl_Position = projectionMatrix * mvPosition;
`

/** `fadeStart`/`fadeEnd`: camera distance (m) over which instances shrink away. `sway`: wind bend per local height². */
function scatterVariant(key: string, fadeStart: number, fadeEnd: number, sway: number, pars = '', vertex = ''): MaterialVariant {
  return {
    key,
    uniforms: { uScatter: { value: new THREE.Vector3(fadeStart, fadeEnd, sway) } },
    vertexPars: `uniform vec3 uScatter;\n${pars}`,
    vertex: `${SCATTER_VERTEX}\n${vertex}`,
  }
}

// Alien ground cover: dark at the root, mauve tips, teal glowing tips inside the Vale (from the splat's vale layer).
const TUFT_COLOR = /* glsl */ `
  float pVale = texture(uTerrainSplat, echoTerrainUV(vWorldPos.xz)).g;
  float pVar = texture(uEchoNoise, vWorldPos.xz * 0.045).r;
  vec3 pTip = mix(vec3(0.19, 0.13, 0.16), vec3(0.07, 0.2, 0.18), pVale) * (0.7 + 0.6 * pVar);
  diffuseColor.rgb = mix(vec3(0.025, 0.02, 0.025), pTip, smoothstep(0.0, 0.9, vPlantT));
`
// Blades are lit like the ground they cover (no dark back faces, no per-blade shading noise).
const UP_NORMAL = 'normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);'
const TUFT_GLOW = /* glsl */ `
  totalEmissiveRadiance = vec3(0.18, 0.85, 0.7) * pow(clamp(vPlantT, 0.0, 1.0), 4.0) * pVale
                        * (0.45 + 0.3 * sin(uEchoTime * 1.3 + vWorldPos.x * 0.4 + vWorldPos.z * 0.3));
`
// Lantern stalks: amber bulbs, teal inside the Vale.
const LANTERN_COLOR = /* glsl */ `
  float lVale = texture(uTerrainSplat, echoTerrainUV(vWorldPos.xz)).g;
  vec3 lGlow = mix(vec3(1.0, 0.48, 0.16), vec3(0.22, 1.0, 0.78), lVale);
  diffuseColor.rgb = mix(vec3(0.035, 0.028, 0.03), lGlow * 0.25, vGlow);
`
const LANTERN_GLOW = /* glsl */ `
  totalEmissiveRadiance = lGlow * vGlow * (1.5 + 0.7 * sin(uEchoTime * 1.9 + vWorldPos.x * 1.3 + vWorldPos.z * 0.7));
`

/** Lumpy rock: displacement is a function of position, so the duplicated vertices of the non-indexed mesh agree. */
function rockGeometry(detail: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, detail)
  const position = geometry.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const bump =
      0.22 * Math.sin(v.x * 2.9 + seed) * Math.cos(v.z * 2.3 - seed * 0.7) + 0.12 * Math.sin(v.y * 5.1 + v.x * 3.7 + seed * 1.9)
    v.multiplyScalar(1 + bump)
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35
    position.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Seven tapered blades curling outward, ~1 m tall in local units (the shader uses local y as the blade height). */
function tuftGeometry(): THREE.BufferGeometry {
  const random = mulberry32(77)
  const blades: THREE.BufferGeometry[] = []
  for (let b = 0; b < 7; b++) {
    const height = 0.55 + random() * 0.45
    const curl = 0.25 + random() * 0.35
    const blade = new THREE.PlaneGeometry(0.07, height, 1, 4).translate(0, height / 2, 0)
    const position = blade.attributes.position
    for (let i = 0; i < position.count; i++) {
      const t = position.getY(i) / height
      position.setXYZ(i, position.getX(i) * (1 - 0.85 * t), position.getY(i) * (1 - 0.12 * t * t), curl * t * t)
    }
    blade.rotateY(random() * TAU).translate((random() - 0.5) * 0.12, 0, (random() - 0.5) * 0.12)
    blades.push(blade)
  }
  return mergeParts(blades, 'scatter tuft')
}

/** Curved stalk with a glowing bulb; `aGlow` = 1 on the bulb. */
function lanternGeometry(): THREE.BufferGeometry {
  const stalk = new THREE.CylinderGeometry(0.018, 0.035, 1, 4, 4, true).translate(0, 0.5, 0).toNonIndexed()
  const position = stalk.attributes.position
  for (let i = 0; i < position.count; i++) {
    const t = position.getY(i)
    position.setX(i, position.getX(i) + 0.12 * t * t)
  }
  const bulb = new THREE.IcosahedronGeometry(0.09, 0).scale(1, 1.3, 1).translate(0.12, 1.04, 0)
  stalk.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(stalk.attributes.position.count), 1))
  bulb.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(bulb.attributes.position.count).fill(1), 1))
  return mergeParts([stalk, bulb], 'scatter lantern')
}

/** Three small crystal spikes growing from one point. */
function sprigGeometry(): THREE.BufferGeometry {
  const random = mulberry32(31)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const height = 0.6 + random() * 0.6
    parts.push(
      new THREE.OctahedronGeometry(1, 0)
        .scale(0.12, height * 0.5, 0.12)
        .translate(0, height * 0.4, 0)
        .rotateZ((random() - 0.5) * 0.9)
        .rotateY(random() * TAU)
        .translate((random() - 0.5) * 0.25, 0, (random() - 0.5) * 0.25),
    )
  }
  return mergeParts(parts, 'scatter sprig')
}

interface Ground {
  y: number
  normal: THREE.Vector3
  path: number
  vale: number
  ash: number
  sediment: number
}

interface Kind {
  name: string
  /** Instances at density 1. */
  count: number
  /** Drawn count follows the quality preset (boulders don't: their colliders must match what is drawn). */
  scalable: boolean
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** Probability of keeping a candidate (≤ 0 rejects). */
  accept: (g: Ground) => number
  /** Scale range plus a bias exponent toward the small end. */
  size: readonly [number, number, number]
  /** Extra vertical scale range. */
  stretch?: readonly [number, number]
  /** 'rock': random yaw + tilt; 'ground': follows the slope; 'upright': nearly vertical. */
  orient: 'rock' | 'ground' | 'upright'
  /** Sink below the ground, in instance scales. */
  sink: number
  /** Instances per accepted spot [min, max] within radius (m). */
  clump?: readonly [number, number, number]
  castShadow?: boolean
  /** Sample only inside this circle (default: the whole walkable disk). */
  area?: { x: number; z: number; radius: number }
  collider?: (x: number, z: number, ground: number, s: number, sy: number) => void
}

interface Layer {
  mesh: THREE.InstancedMesh
  placed: number
  scalable: boolean
}

/** Instanced rocks, alien plants and crystal sprigs across the walkable world (one draw call per kind). */
export class Scatter {
  readonly root = new THREE.Group()
  private readonly layers: Layer[] = []

  constructor(terrain: Terrain, collision: Collision) {
    this.root.name = 'scatter'
    const splat = (terrain.splatTexture.image as { data: Uint8Array }).data
    const clampIndex = (i: number) => Math.min(TERRAIN_SAMPLES - 1, Math.max(0, i))
    const sampleGround = (x: number, z: number, g: Ground) => {
      g.y = collision.groundHeight(x, z)
      collision.groundNormal(x, z, g.normal)
      const i = clampIndex(Math.round((x + TERRAIN_HALF) / TERRAIN_CELL))
      const j = clampIndex(Math.round((z + TERRAIN_HALF) / TERRAIN_CELL))
      const k = (j * TERRAIN_SAMPLES + i) * 4
      g.path = splat[k] / 255
      g.vale = splat[k + 1] / 255
      g.ash = splat[k + 2] / 255
      g.sediment = splat[k + 3] / 255
    }

    const stone = createStoneMaterial('#74675e')
    const boulderCollider = (x: number, z: number, ground: number, s: number, sy: number) => {
      if (s > 1) collision.addCylinder(x, z, 0.8 * s, ground - 1, ground + sy * 0.9 - 0.25 * s)
    }
    const boulderAccept = (g: Ground) =>
      g.normal.y < 0.62 ? 0 : (0.05 + 1.6 * (1 - g.normal.y)) * (1 - g.path) * (1 - 0.5 * g.vale)
    const plant = (key: string, sway: number, fadeStart: number, fadeEnd: number, pars: string, vertex: string) =>
      scatterVariant(key, fadeStart, fadeEnd, sway, pars, vertex)

    const kinds: Kind[] = [
      {
        name: 'boulders',
        count: 150,
        scalable: false,
        geometry: rockGeometry(1, 1.7),
        material: stone,
        accept: boulderAccept,
        size: [0.6, 2.8, 2.2],
        stretch: [0.6, 1],
        orient: 'rock',
        sink: 0.25,
        castShadow: true,
        collider: boulderCollider,
      },
      {
        name: 'boulders.b',
        count: 110,
        scalable: false,
        geometry: rockGeometry(1, 4.1),
        material: stone,
        accept: boulderAccept,
        size: [0.6, 2.4, 2.2],
        stretch: [0.5, 0.9],
        orient: 'rock',
        sink: 0.25,
        castShadow: true,
        collider: boulderCollider,
      },
      {
        name: 'pebbles',
        count: 1300,
        scalable: true,
        geometry: rockGeometry(0, 2.9),
        material: createStoneMaterial('#6d6159', scatterVariant('pebble', 55, 75, 0)),
        accept: (g) => (g.normal.y < 0.55 ? 0 : (0.25 + 1.2 * (1 - g.normal.y) + 0.3 * g.sediment) * (1 - 0.8 * g.path)),
        size: [0.1, 0.45, 2],
        stretch: [0.5, 0.9],
        orient: 'rock',
        sink: 0.2,
        clump: [1, 4, 1.5],
      },
      {
        name: 'tufts',
        count: 2400,
        scalable: true,
        geometry: tuftGeometry(),
        material: patchWorldMaterial(
          new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide }),
          {
            ...plant('tuft', 0.16, 60, 85, 'varying float vPlantT;', 'vPlantT = position.y;'),
            key: 'scatter-tuft',
            fragmentPars: 'varying float vPlantT;',
            color: TUFT_COLOR,
            normal: UP_NORMAL,
            emissive: TUFT_GLOW,
          },
        ),
        accept: (g) =>
          g.normal.y < 0.86 || g.path > 0.1 ? 0 : (0.22 + 0.78 * g.vale) * (1 - g.sediment) * (1 - g.ash),
        size: [0.45, 1, 1.3],
        orient: 'ground',
        sink: 0.03,
        clump: [3, 7, 1.4],
      },
      {
        name: 'lanterns',
        count: 240,
        scalable: true,
        geometry: lanternGeometry(),
        material: patchWorldMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }), {
          ...plant('lantern', 0.05, 120, 160, 'attribute float aGlow;\nvarying float vGlow;', 'vGlow = aGlow;'),
          key: 'scatter-lantern',
          fragmentPars: 'varying float vGlow;',
          color: LANTERN_COLOR,
          emissive: LANTERN_GLOW,
        }),
        accept: (g) => (g.normal.y < 0.9 || g.path > 0.05 ? 0 : (0.03 + 0.9 * g.vale * g.vale) * (1 - g.ash)),
        size: [0.8, 1.7, 1],
        orient: 'upright',
        sink: 0.02,
        clump: [1, 3, 1.2],
      },
      {
        name: 'sprigs',
        count: 600,
        scalable: true,
        geometry: sprigGeometry(),
        material: createCrystalMaterial('#3ee6c8', 0.9, scatterVariant('sprig', 70, 95, 0)),
        accept: (g) => (g.vale < 0.35 || g.normal.y < 0.7 || g.path > 0.1 ? 0 : g.vale),
        size: [0.5, 1.3, 1.5],
        orient: 'upright',
        sink: 0.05,
        clump: [2, 5, 1],
        area: { x: VALE.x, z: VALE.z, radius: VALE.radius * 0.9 },
      },
    ]

    const random = mulberry32(2026)
    for (const kind of kinds) this.place(kind, random, sampleGround)
  }

  /** Quality preset density (0.45 … 1.3). */
  setDensity(density: number) {
    const d = Math.min(Math.max(density, 0), MAX_DENSITY) / MAX_DENSITY
    for (const layer of this.layers) layer.mesh.count = layer.scalable ? Math.round(layer.placed * d) : layer.placed
  }

  private place(kind: Kind, random: () => number, sampleGround: (x: number, z: number, g: Ground) => void) {
    const target = Math.ceil(kind.count * (kind.scalable ? MAX_DENSITY : 1))
    const mesh = new THREE.InstancedMesh(kind.geometry, kind.material, target)
    mesh.name = `scatter.${kind.name}`
    mesh.castShadow = kind.castShadow ?? false
    mesh.receiveShadow = true
    const g: Ground = { y: 0, normal: new THREE.Vector3(), path: 0, vale: 0, ash: 0, sediment: 0 }
    const up = new THREE.Vector3(0, 1, 0)
    const axis = new THREE.Vector3()
    const tilt = new THREE.Quaternion()
    const yaw = new THREE.Quaternion()
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    const area = kind.area ?? { x: 0, z: 0, radius: SCATTER_RADIUS }
    const [minSize, maxSize, bias] = kind.size
    let placed = 0

    for (let attempt = 0; attempt < target * 16 && placed < target; attempt++) {
      const ra = area.radius * Math.sqrt(random())
      const aa = random() * TAU
      const cx = area.x + Math.cos(aa) * ra
      const cz = area.z + Math.sin(aa) * ra
      if (cleared(cx, cz)) continue
      sampleGround(cx, cz, g)
      if (random() >= kind.accept(g)) continue
      const clump = kind.clump ? kind.clump[0] + Math.floor(random() * (kind.clump[1] - kind.clump[0] + 1)) : 1
      for (let c = 0; c < clump && placed < target; c++) {
        let x = cx
        let z = cz
        if (c > 0 && kind.clump) {
          const a = random() * TAU
          const r = kind.clump[2] * Math.sqrt(random())
          x += Math.cos(a) * r
          z += Math.sin(a) * r
          if (cleared(x, z)) continue
          sampleGround(x, z, g)
          if (kind.accept(g) <= 0) continue
        }
        const s = minSize + (maxSize - minSize) * Math.pow(random(), bias)
        const sy = s * (kind.stretch ? kind.stretch[0] + random() * (kind.stretch[1] - kind.stretch[0]) : 1)
        if (kind.orient === 'ground') {
          axis.copy(g.normal).lerp(up, 0.35).normalize()
          tilt.setFromUnitVectors(up, axis)
        } else {
          const a = random() * TAU
          axis.set(Math.cos(a), 0, Math.sin(a))
          tilt.setFromAxisAngle(axis, random() * (kind.orient === 'rock' ? 0.35 : 0.12))
        }
        yaw.setFromAxisAngle(up, random() * TAU)
        tilt.multiply(yaw)
        position.set(x, g.y - kind.sink * s, z)
        scale.set(s, sy, s)
        mesh.setMatrixAt(placed++, matrix.compose(position, tilt, scale))
        kind.collider?.(x, z, g.y, s, sy)
      }
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    this.root.add(mesh)
    this.layers.push({ mesh, placed, scalable: kind.scalable })
  }
}

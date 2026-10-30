import * as THREE from 'three'
import { angleDistance, clamp, smoothstep } from '../core/math'
import { SHARED_GLSL, sharedUniforms } from '../render/shaderChunks'
import { fbm2, ridged2 } from './noise'

interface LayerSpec {
  radius: number
  minHeight: number
  maxHeight: number
  segments: number
  /** Radius of the sampling circle in noise space: higher = more peaks around the horizon. */
  frequency: number
  /** Base aerial-perspective amount for the whole layer. */
  haze: number
  color: string
  seed: number
}

/** Painted far → near right after the sky (painter's order, no depth test), so the world covers them. */
const LAYERS: readonly LayerSpec[] = [
  { radius: 1800, minHeight: 450, maxHeight: 1000, segments: 240, frequency: 1.6, haze: 0.8, color: '#4a4262', seed: 3 },
  { radius: 1250, minHeight: 300, maxHeight: 700, segments: 300, frequency: 2.3, haze: 0.6, color: '#3a3048', seed: 7 },
  { radius: 800, minHeight: 160, maxHeight: 420, segments: 360, frequency: 3.1, haze: 0.38, color: '#2f2530', seed: 11 },
]

const BASE_Y = -90

/** Lowers the ranges around an azimuth (keeps the sun and planet clear of the silhouettes). */
interface Saddle {
  angle: number
  halfWidth: number
  depth: number
}

const VERTEX = /* glsl */ `
attribute float aHeight;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normal;
  vHeight = aHeight;
  gl_Position = projectionMatrix * viewMatrix * world;
  // Keep inside the clip volume so the camera far plane never cuts the ranges.
  gl_Position.z = gl_Position.w * 0.999;
}
`

const FRAGMENT = /* glsl */ `
${SHARED_GLSL}
uniform vec3 uColor;
uniform float uHaze;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vHeight;
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 n = normalize(vNormalW);
  float diffuse = max(dot(n, uSunDirection), 0.0);
  vec3 ambient = mix(uFogColor, uSkyMid, 0.5 + 0.5 * n.y);
  vec3 lit = uColor * (uSunColor * diffuse * 1.6 + ambient * 0.9);
  lit *= 0.8 + 0.4 * echoFbm(vWorld.xz * 0.004 + vec2(vWorld.y * 0.006, 0.0));
  float haze = clamp(uHaze + (1.0 - uHaze) * pow(1.0 - vHeight, 2.2) * 0.9, 0.0, 1.0);
  vec3 col = mix(lit, echoFogColor(normalize(vec3(dir.x, 0.0, dir.z))), haze);
  float rim = pow(max(dot(dir, uSunDirection), 0.0), 6.0) * smoothstep(0.82, 1.0, vHeight);
  col += uSunColor * rim * 0.5 * (1.0 - uHaze);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function buildLayer(spec: LayerSpec, saddles: readonly Saddle[]): THREE.BufferGeometry {
  const columns = spec.segments
  const step = (Math.PI * 2) / columns
  const tops = new Float32Array(columns + 1)
  for (let i = 0; i <= columns; i++) {
    const angle = i * step
    const nx = Math.cos(angle) * spec.frequency
    const nz = Math.sin(angle) * spec.frequency
    const shape = clamp(
      (0.5 + 0.5 * fbm2(nx, nz, 5, spec.seed)) * 0.7 + ridged2(nx * 1.7, nz * 1.7, 4, spec.seed + 5) * 0.6,
      0,
      1,
    )
    let scale = 1
    for (const saddle of saddles) {
      const distance = angleDistance(angle, saddle.angle)
      scale *= 1 - saddle.depth * (1 - smoothstep(saddle.halfWidth * 0.35, saddle.halfWidth, distance))
    }
    tops[i] = BASE_Y + (spec.minHeight + (spec.maxHeight - spec.minHeight) * shape) * scale
  }

  const vertexCount = (columns + 1) * 2
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const heights = new Float32Array(vertexCount)
  for (let i = 0; i <= columns; i++) {
    const angle = i * step
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const prev = tops[i === 0 ? columns - 1 : i - 1]
    const next = tops[i === columns ? 1 : i + 1]
    const slope = (next - prev) / (2 * spec.radius * step)
    for (let row = 0; row < 2; row++) {
      const v = i * 2 + row
      positions[v * 3] = cos * spec.radius
      positions[v * 3 + 1] = row === 0 ? BASE_Y : tops[i]
      positions[v * 3 + 2] = sin * spec.radius
      // Faces the world centre, tipped up and sideways by the silhouette slope.
      const tilt = row === 0 ? 0.5 : 1
      const nx = -cos + sin * slope * tilt
      const ny = row === 0 ? 0.2 : 0.55
      const nz = -sin - cos * slope * tilt
      const length = Math.hypot(nx, ny, nz)
      normals[v * 3] = nx / length
      normals[v * 3 + 1] = ny / length
      normals[v * 3 + 2] = nz / length
      heights[v] = row
    }
  }

  const index: number[] = []
  for (let i = 0; i < columns; i++) {
    const b0 = i * 2
    index.push(b0, b0 + 1, b0 + 2, b0 + 2, b0 + 1, b0 + 3)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1))
  geometry.setIndex(index)
  return geometry
}

/** Three hazy silhouette rings far beyond the playable area, with saddles that keep the sun and planet clear. */
export class Mountains {
  readonly group = new THREE.Group()

  constructor(sunDirection: THREE.Vector3, planetDirection: THREE.Vector3) {
    this.group.name = 'mountains'
    const saddles: Saddle[] = [
      { angle: Math.atan2(sunDirection.z, sunDirection.x), halfWidth: 0.55, depth: 0.72 },
      { angle: Math.atan2(planetDirection.z, planetDirection.x), halfWidth: 0.45, depth: 0.4 },
    ]
    LAYERS.forEach((spec, index) => {
      const material = new THREE.ShaderMaterial({
        name: 'echo.mountains',
        uniforms: { ...sharedUniforms, uColor: { value: new THREE.Color(spec.color) }, uHaze: { value: spec.haze } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        fog: false,
      })
      const mesh = new THREE.Mesh(buildLayer(spec, saddles), material)
      mesh.name = `mountains-${index}`
      mesh.frustumCulled = false
      mesh.renderOrder = -90 + index
      this.group.add(mesh)
    })
  }
}

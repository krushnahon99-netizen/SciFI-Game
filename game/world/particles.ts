import * as THREE from 'three'
import { PULSE_RADIUS, PULSE_SLOTS, PULSE_SPEED } from '../echo/pulseShader'
import { sharedUniforms } from '../render/shaderChunks'
import { TERRAIN_UV_SCALE } from './layout'
import { mulberry32 } from './noise'

/** Allocated once for the highest preset; lower presets draw a prefix. */
const MAX_PARTICLES = 2500
/** Wrap box around the camera (m): particles are world-anchored and wrap at its faces, so the count is bounded. */
const BOX = new THREE.Vector3(48, 20, 48)

const f = (n: number) => n.toFixed(4)

// ~70 % warm sunlit dust, ~30 % glowing spores (dense in the Vale, from the splat's vale layer).
// The echo wavefront lights them up and shoves them outward as it passes.
const VERTEX = /* glsl */ `
uniform float uEchoTime;
uniform float uEchoClock;
uniform vec4 uEchoPulses[${PULSE_SLOTS}];
uniform sampler2D uTerrainSplat;
uniform float uViewport;
attribute float aRand;
varying vec3 vColor;
varying float vAlpha;

const vec3 BOX = vec3(${f(BOX.x)}, ${f(BOX.y)}, ${f(BOX.z)});

void main() {
  float spore = step(0.7, aRand);
  float t = uEchoTime;
  vec3 wind = mix(vec3(0.6, 0.05, 0.25), vec3(0.16, 0.12, -0.08), spore);
  vec3 p = position * BOX + wind * t;
  p += vec3(sin(t * 0.37 + aRand * 61.0), 0.6 * sin(t * 0.53 + position.x * 37.0), cos(t * 0.31 + position.z * 43.0))
     * mix(0.5, 1.4, spore);
  vec3 centre = cameraPosition - vec3(0.0, 3.0, 0.0);
  vec3 offset = mod(p - centre + BOX * 0.5, BOX) - BOX * 0.5;
  vec3 world = centre + offset;
  vec3 edge = abs(offset) / (BOX * 0.5);
  float fade = 1.0 - smoothstep(0.65, 1.0, max(max(edge.x, edge.z), edge.y));

  float flare = 0.0;
  for (int i = 0; i < ${PULSE_SLOTS}; i++) {
    vec4 pulse = uEchoPulses[i];
    float age = uEchoClock - pulse.w;
    vec3 away = world - pulse.xyz;
    float dist = length(away);
    float x = dist - age * ${f(PULSE_SPEED)};
    float life = 1.0 - smoothstep(0.45, 1.0, age * ${f(PULSE_SPEED / PULSE_RADIUS)});
    flare += exp(-x * x * 0.05) * life;
    world += away / max(dist, 1e-3) * smoothstep(0.0, 8.0, -x) * life * 1.2;
  }

  float vale = texture(uTerrainSplat, world.xz / ${f(TERRAIN_UV_SCALE)} + 0.5).g;
  float presence = mix(1.0 - 0.6 * vale, 0.1 + 0.9 * vale, spore);
  float twinkle = 0.65 + 0.35 * sin(t * 2.3 + aRand * 97.0);
  vColor = mix(vec3(1.0, 0.7, 0.45) * 0.25, vec3(0.3, 1.0, 0.8) * 0.9 * twinkle, spore)
         + vec3(0.32, 0.86, 1.0) * flare * 2.0;

  vec4 mv = viewMatrix * vec4(world, 1.0);
  float size = mix(0.04, 0.08, spore) * (0.7 + 0.6 * fract(aRand * 13.7));
  float px = size * projectionMatrix[1][1] * uViewport * 0.5 / max(-mv.z, 0.1);
  gl_PointSize = clamp(px, 1.0, 24.0);
  // Below one pixel, dim instead of shrinking so distant motes don't flicker.
  vAlpha = fade * presence * min(px * px, 1.0);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = 1.0 - r2;
  gl_FragColor = vec4(vColor * a * a * vAlpha, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Floating dust and glowing spores in a box that follows the camera (positions are computed on the GPU). */
export class AmbientParticles {
  readonly points: THREE.Points
  private readonly viewport = { value: 1080 }
  private readonly size = new THREE.Vector2()

  constructor() {
    const random = mulberry32(911)
    const seeds = new Float32Array(MAX_PARTICLES * 3)
    const rand = new Float32Array(MAX_PARTICLES)
    for (let i = 0; i < MAX_PARTICLES; i++) {
      seeds[i * 3] = random()
      seeds[i * 3 + 1] = random()
      seeds[i * 3 + 2] = random()
      rand[i] = random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3))
    geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    const material = new THREE.ShaderMaterial({
      name: 'echo.particles',
      uniforms: {
        uEchoTime: sharedUniforms.uEchoTime,
        uEchoClock: sharedUniforms.uEchoClock,
        uEchoPulses: sharedUniforms.uEchoPulses,
        uTerrainSplat: sharedUniforms.uTerrainSplat,
        uViewport: this.viewport,
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.points = new THREE.Points(geometry, material)
    this.points.name = 'echo.particles'
    this.points.frustumCulled = false
    this.points.onBeforeRender = (renderer) => {
      const target = renderer.getRenderTarget()
      this.viewport.value = target ? target.height : renderer.getDrawingBufferSize(this.size).y
    }
  }

  /** Quality preset particle budget. */
  setBudget(count: number) {
    this.points.geometry.setDrawRange(0, Math.min(Math.max(0, Math.round(count)), MAX_PARTICLES))
  }
}

import * as THREE from 'three'
import type { Collision } from '../physics/collision'
import { sharedUniforms } from '../render/shaderChunks'
import { Polyline, type Point2 } from '../world/layout'
import { PULSE_INACTIVE } from './pulseShader'
import { arrivalAt, type PulseInfo, type Reactive } from './reactive'

const GLYPH_SIZE = 1.5
/** Seconds a glyph stays lit after the wavefront reaches it, then fades over GLYPH_FADE. */
const GLYPH_HOLD = 8
const GLYPH_FADE = 2.5
/** Lift off the terrain (lower terrain LODs deviate a little from the heightmap). */
const GLYPH_LIFT = 0.12

const f = (n: number) => n.toFixed(4)

// Per instance: aArrive = arrival times of the two latest pulses (max of both envelopes, so a new pulse extends the
// showing instead of restarting it). Hidden instances collapse outside the clip volume.
const GLYPH_VERTEX = /* glsl */ `
attribute vec2 aArrive;
attribute float aSeed;
uniform float uEchoClock;
varying vec2 vGlyphUv;
varying float vGlyphShow;
varying float vGlyphSeed;
varying float vGlyphFade;
float glyphEnvelope(float since) {
  return smoothstep(0.0, 0.3, since) * (1.0 - smoothstep(${f(GLYPH_HOLD)}, ${f(GLYPH_HOLD + GLYPH_FADE)}, since));
}
void main() {
  vGlyphUv = uv * 2.0 - 1.0;
  vGlyphSeed = aSeed;
  vGlyphShow = max(glyphEnvelope(uEchoClock - aArrive.x), glyphEnvelope(uEchoClock - aArrive.y));
  vec4 mvPosition = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  vGlyphFade = exp(-length(mvPosition.xyz) * 0.006);
  gl_Position = vGlyphShow > 0.0 ? projectionMatrix * mvPosition : vec4(0.0, 0.0, -2.0, 1.0);
}
`

const GLYPH_FRAGMENT = /* glsl */ `
uniform float uEchoTime;
uniform vec3 uColor;
varying vec2 vGlyphUv;
varying float vGlyphShow;
varying float vGlyphSeed;
varying float vGlyphFade;
float glyphHash(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float glyphSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
void main() {
  vec2 p = vGlyphUv;
  float r = length(p);
  // Ring + a chevron pointing along the path + two marks that vary per glyph.
  float d = abs(r - 0.8);
  d = min(d, glyphSegment(p, vec2(-0.42, -0.16), vec2(0.0, 0.3)));
  d = min(d, glyphSegment(p, vec2(0.42, -0.16), vec2(0.0, 0.3)));
  float h1 = glyphHash(vGlyphSeed);
  float h2 = glyphHash(vGlyphSeed + 7.13);
  d = min(d, h1 > 0.5 ? abs(length(p - vec2(0.0, -0.4)) - 0.12) : glyphSegment(p, vec2(-0.24, -0.44), vec2(0.24, -0.44)));
  vec2 tick = vec2(cos(h2 * 6.2832), sin(h2 * 6.2832));
  d = min(d, glyphSegment(p, tick * 0.8, tick * 0.6));
  float aa = fwidth(d) * 1.5 + 1e-4;
  float line = 1.0 - smoothstep(0.045, 0.045 + aa, d);
  float halo = exp(-d * d * 60.0) * 0.3 * (1.0 - smoothstep(0.88, 1.0, r));
  float flicker = 0.85 + 0.15 * sin(uEchoTime * 9.0 + vGlyphSeed * 17.0);
  gl_FragColor = vec4(uColor * (line + halo) * vGlyphShow * flicker * vGlyphFade * 1.3, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** A hidden path: glowing ground glyphs along a polyline that light up as the wavefront passes and fade after. */
export class GlyphTrail implements Reactive {
  readonly kind = 'glyphs' as const
  readonly center = new THREE.Vector3()
  readonly radius: number
  private readonly arrive: THREE.InstancedBufferAttribute
  /** World xyz of every glyph. */
  private readonly anchors: Float32Array

  constructor(
    scene: THREE.Scene,
    path: readonly Point2[],
    collision: Collision,
    spacing = 3.2,
    color: THREE.ColorRepresentation = '#4fd8ff',
  ) {
    const line = new Polyline(path)
    const count = Math.max(1, Math.floor(line.length / spacing) + 1)
    const geometry = new THREE.PlaneGeometry(GLYPH_SIZE, GLYPH_SIZE).rotateX(-Math.PI / 2)
    this.arrive = new THREE.InstancedBufferAttribute(new Float32Array(count * 2).fill(PULSE_INACTIVE), 2)
    this.arrive.setUsage(THREE.DynamicDrawUsage)
    const seeds = new Float32Array(count)
    geometry.setAttribute('aArrive', this.arrive)
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    const material = new THREE.ShaderMaterial({
      name: 'echo.glyphTrail',
      vertexShader: GLYPH_VERTEX,
      fragmentShader: GLYPH_FRAGMENT,
      uniforms: {
        uEchoClock: sharedUniforms.uEchoClock,
        uEchoTime: sharedUniforms.uEchoTime,
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.name = 'echo.glyphTrail'
    this.anchors = new Float32Array(count * 3)

    const back = { x: 0, z: 0 }
    const ahead = { x: 0, z: 0 }
    const up = new THREE.Vector3(0, 1, 0)
    const normal = new THREE.Vector3()
    const position = new THREE.Vector3()
    const tilt = new THREE.Quaternion()
    const yaw = new THREE.Quaternion()
    const unit = new THREE.Vector3(1, 1, 1)
    const matrix = new THREE.Matrix4()
    const bounds = new THREE.Box3()
    for (let i = 0; i < count; i++) {
      const s = Math.min(i * spacing, line.length)
      line.pointAt(Math.max(0, s - 0.5), back)
      line.pointAt(Math.min(line.length, s + 0.5), ahead)
      const x = (back.x + ahead.x) / 2
      const z = (back.z + ahead.z) / 2
      collision.groundNormal(x, z, normal)
      position.set(x, collision.groundHeight(x, z), z).addScaledVector(normal, GLYPH_LIFT)
      // Local −z (the chevron's direction) along the path, then tilted onto the slope.
      yaw.setFromAxisAngle(up, Math.atan2(-(ahead.x - back.x), -(ahead.z - back.z)))
      tilt.setFromUnitVectors(up, normal).multiply(yaw)
      mesh.setMatrixAt(i, matrix.compose(position, tilt, unit))
      position.toArray(this.anchors, i * 3)
      bounds.expandByPoint(position)
      seeds[i] = i * 1.618 + 0.37
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    bounds.getCenter(this.center)
    this.radius = bounds.getSize(position).length() / 2 + GLYPH_SIZE
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

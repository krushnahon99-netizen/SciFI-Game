import * as THREE from 'three'
import type { QualityLevel, QualitySettings } from '../render/quality'
import { SHARED_GLSL, sharedUniforms } from '../render/shaderChunks'
import { SKY } from './layout'

const CLOUD_OCTAVES: Record<QualityLevel, number> = { low: 2, medium: 3, high: 4, ultra: 4 }

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Rotation only: the dome is always centred on the camera and never reaches the far plane.
  gl_Position = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
}
`

// Everything in the sky is analytic: gradient, sun, stars, a ray-traced ringed planet and a drifting cloud layer.
const FRAGMENT = /* glsl */ `
${SHARED_GLSL}
uniform vec3 uPlanetDir;
uniform float uPlanetRadius;
uniform vec3 uRingNormal;
uniform vec2 uRingRange;
varying vec3 vDir;

float skyHash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 starField(vec3 dir) {
  vec3 p = dir * 170.0;
  vec3 cell = floor(p);
  float h = skyHash13(cell);
  if (h < 0.955) return vec3(0.0);
  vec3 star = cell + 0.15 + 0.7 * vec3(skyHash13(cell + 11.7), skyHash13(cell + 23.1), skyHash13(cell + 37.9));
  float brightness = (h - 0.955) / 0.045;
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.3 + h * 4.0) + h * 91.0);
  vec3 tint = mix(vec3(1.0, 0.84, 0.7), vec3(0.75, 0.85, 1.0), skyHash13(cell + 5.3));
  return tint * (1.0 - smoothstep(0.0, 0.24, length(p - star))) * brightness * brightness * twinkle * 1.5;
}

float ringDensity(float r) {
  float t = (r - uRingRange.x) / (uRingRange.y - uRingRange.x);
  if (t <= 0.0 || t >= 1.0) return 0.0;
  float bands = 0.55 + 0.25 * sin(r * 41.0) + 0.2 * sin(r * 97.0 + 1.3);
  bands *= 0.6 + 0.4 * echoNoise(vec2(r * 160.0, 0.5));
  float division = smoothstep(0.012, 0.03, abs(t - 0.62));
  float edges = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
  return clamp(bands, 0.0, 1.0) * division * edges;
}

vec3 planetAlbedo(vec3 n) {
  float lat = dot(n, uRingNormal);
  float swirl = sin(n.x * 9.0 + n.z * 7.0 + lat * 5.0) * 0.035 + sin(n.y * 23.0 - n.x * 11.0) * 0.012;
  float l = lat + swirl;
  vec3 albedo = mix(vec3(0.36, 0.42, 0.5), vec3(0.7, 0.64, 0.54), 0.5 + 0.5 * sin(l * 15.0));
  albedo = mix(albedo, vec3(0.52, 0.31, 0.22), smoothstep(0.55, 1.0, sin(l * 37.0 + 1.7)) * 0.45);
  return albedo * (1.0 - 0.2 * smoothstep(0.3, 0.95, abs(lat)));
}

// The planet sits at unit distance; rings lie in the plane through its centre with normal uRingNormal.
vec3 applyPlanet(vec3 dir, vec3 col, vec3 haze) {
  vec3 c = uPlanetDir;
  float radius = uPlanetRadius;
  float b = dot(dir, c);
  float h = b * b - (1.0 - radius * radius);
  float disc = clamp(h / max(fwidth(h), 1e-7), 0.0, 1.0) * step(0.0, b);
  float tSphere = b - sqrt(max(h, 0.0));

  float facing = dot(dir, uRingNormal);
  float tRing = dot(c, uRingNormal) / (abs(facing) > 1e-5 ? facing : 1e-5);
  vec3 q = dir * tRing;
  float ringAlpha = tRing > 0.0 ? ringDensity(length(q - c) / radius) * 0.85 : 0.0;

  vec3 ringColor = vec3(0.0);
  if (ringAlpha > 0.0) {
    vec3 oc = q - c;
    float sb = dot(oc, uSunDirection);
    float sh = sb * sb - (dot(oc, oc) - radius * radius);
    float shadow = 1.0 - smoothstep(-0.0004, 0.0004, sh) * step(sb, 0.0);
    float forward = pow(max(dot(dir, uSunDirection), 0.0), 5.0);
    ringColor = vec3(0.86, 0.8, 0.7) * uSunColor * (0.2 + 2.2 * forward) * shadow + haze * 0.35;
  }

  vec3 planetColor = col;
  if (disc > 0.0) {
    vec3 p = dir * tSphere;
    vec3 n = (p - c) / radius;
    float ndl = dot(n, uSunDirection);
    float day = smoothstep(-0.1, 0.35, ndl);
    float sunFacing = dot(uSunDirection, uRingNormal);
    float tShadow = dot(c - p, uRingNormal) / (abs(sunFacing) > 1e-5 ? sunFacing : 1e-5);
    float ringShadow = tShadow > 0.0 ? 1.0 - 0.75 * ringDensity(length(p + uSunDirection * tShadow - c) / radius) : 1.0;
    vec3 lit = planetAlbedo(n) * (uSunColor * day * ringShadow * 1.15 + uSkyMid * 0.3);
    float rim = pow(1.0 - clamp(dot(n, -dir), 0.0, 1.0), 3.0);
    lit += uFogSunColor * rim * (0.06 + 1.4 * smoothstep(-0.3, 0.3, ndl));
    planetColor = mix(col, mix(lit, haze, 0.28), disc);
  }

  float ringVisible = tRing < tSphere ? 1.0 : 1.0 - disc;
  return mix(planetColor, ringColor, ringAlpha * ringVisible);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 base = echoSkyColor(dir);
  float sunDot = dot(dir, uSunDirection);
  float starMask = smoothstep(0.06, 0.4, dir.y) * (1.0 - smoothstep(0.5, 0.9, sunDot));
  vec3 col = base + starField(dir) * starMask;
  col = applyPlanet(dir, col, base);
  col += uSunColor * smoothstep(0.99962, 0.99975, sunDot) * 20.0;
#if CLOUD_OCTAVES > 0
  if (dir.y > 0.0) {
    vec2 p = (dir.xz / (dir.y + 0.1) * 1.4 + vec2(uTime * 0.006, uTime * 0.0025)) * vec2(1.0, 3.2);
    float n = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < CLOUD_OCTAVES; i++) {
      n += amplitude * echoNoise(p);
      p = p * 2.07 + 13.7;
      amplitude *= 0.5;
    }
    n /= 1.0 - pow(0.5, float(CLOUD_OCTAVES));
    float cover = smoothstep(0.5, 0.82, n) * smoothstep(0.02, 0.2, dir.y) * 0.7;
    vec3 cloud = mix(uSkyMid * 1.2 + uFogColor * 0.25, uFogSunColor * 1.2, pow(max(sunDot, 0.0), 3.0));
    cloud += uSunColor * pow(max(sunDot, 0.0), 24.0) * 0.8;
    col = mix(col, cloud, cover);
  }
#endif
  col *= 1.0 + (skyHash13(vec3(gl_FragCoord.xy, 7.0)) - 0.5) * 0.015;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function directionFromYaw(yaw: number, elevation: number): THREE.Vector3 {
  const horizontal = Math.cos(elevation)
  return new THREE.Vector3(-Math.sin(yaw) * horizontal, Math.sin(elevation), -Math.cos(yaw) * horizontal)
}

/** Camera-centred sky dome, drawn first with no depth test (mountains and the world paint over it). */
export class Sky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  readonly planetDirection: THREE.Vector3

  constructor(quality: QualitySettings) {
    const planet = SKY.planet
    this.planetDirection = directionFromYaw(planet.yaw, planet.elevation)
    const forward = this.planetDirection
    const right = new THREE.Vector3().crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    // Roll the ring's major axis in screen space, then tip the plane towards the viewer so its upper face shows.
    const ringNormal = up
      .clone()
      .multiplyScalar(Math.cos(planet.ringRoll))
      .addScaledVector(right, -Math.sin(planet.ringRoll))
      .multiplyScalar(Math.cos(planet.ringInclination))
      .addScaledVector(forward, -Math.sin(planet.ringInclination))
      .normalize()

    const material = new THREE.ShaderMaterial({
      name: 'echo.sky',
      uniforms: {
        ...sharedUniforms,
        uPlanetDir: { value: this.planetDirection.clone() },
        uPlanetRadius: { value: Math.sin(planet.angularRadius) },
        uRingNormal: { value: ringNormal },
        uRingRange: { value: new THREE.Vector2(planet.ringInner, planet.ringOuter) },
      },
      defines: { CLOUD_OCTAVES: CLOUD_OCTAVES[quality.level] },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material)
    this.mesh.name = 'sky'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -100
  }

  applyQuality(quality: QualitySettings) {
    const material = this.mesh.material
    const octaves = CLOUD_OCTAVES[quality.level]
    if (material.defines.CLOUD_OCTAVES === octaves) return
    material.defines.CLOUD_OCTAVES = octaves
    material.needsUpdate = true
  }
}

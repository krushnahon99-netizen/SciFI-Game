import * as THREE from 'three'
import { ATMOSPHERE_GLSL, sharedUniforms } from '../render/shaderChunks'
import { PLANET_DIRECTION, PLANET_RADIUS } from './layout'

const f = (n: number) => n.toFixed(6)
const v3 = (v: THREE.Vector3) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`

/** Ring plane normal: opened ~0.32 toward the viewer and tilted 0.34 rad off the horizon. */
function ringNormal(): THREE.Vector3 {
  const p = PLANET_DIRECTION
  const upPerp = new THREE.Vector3(0, 1, 0).addScaledVector(p, -p.y).normalize()
  const right = new THREE.Vector3().crossVectors(upPerp, p).normalize()
  return upPerp
    .multiplyScalar(Math.cos(0.34))
    .addScaledVector(right, Math.sin(0.34))
    .multiplyScalar(0.947)
    .addScaledVector(p, -0.32)
    .normalize()
}

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // Rotation only (always centred on the camera); z = w puts it on the far plane.
  gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
}
`

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uFogColor;
uniform sampler2D uEchoNoise;
varying vec3 vDir;

${ATMOSPHERE_GLSL}

const vec3 PLANET_DIR = ${v3(PLANET_DIRECTION)};
const float PLANET_R = ${f(PLANET_RADIUS)};
const vec3 RING_N = ${v3(ringNormal())};
const vec3 SUN_COLOR = vec3(1.0, 0.6, 0.32);
const float SUN_COS = ${f(Math.cos(0.021))};

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float raySphere(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - (dot(oc, oc) - r * r);
  return h < 0.0 ? -1.0 : -b - sqrt(h);
}

// rho in planet radii. 1D lookups use textureLod(…, 0.0): no derivative-driven mip spikes.
float ringDensity(float rho) {
  if (rho < 1.32 || rho > 2.4) return 0.0;
  float bands = textureLod(uEchoNoise, vec2(rho * 0.37, 0.43), 0.0).r;
  float fine = textureLod(uEchoNoise, vec2(rho * 2.9, 0.77), 0.0).g;
  float d = 0.3 + 0.7 * smoothstep(0.3, 0.7, bands) * (0.7 + 0.6 * fine);
  d *= smoothstep(1.32, 1.42, rho) * (1.0 - smoothstep(2.2, 2.4, rho));
  d *= mix(0.1, 1.0, smoothstep(0.025, 0.06, abs(rho - 1.86)));
  return d;
}

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float mu = dot(d, ECHO_SUN_DIR);
  float muP = max(mu, 0.0);

  // Gradient: fogged horizon (same in-scatter as the fog) → dusk violet → deep indigo zenith.
  vec3 horizon = echoAtmosphere(uFogColor, d);
  float up = max(y, 0.0);
  vec3 col = mix(horizon, vec3(0.05, 0.043, 0.08), smoothstep(0.0, 0.24, up));
  col = mix(col, vec3(0.011, 0.013, 0.035), smoothstep(0.2, 0.9, up));
  col += ECHO_SUN_SCATTER * 0.35 * pow(muP, 5.0) * smoothstep(-0.05, 0.4, y);
  vec3 sky = col;
  float haze = 1.0 - smoothstep(0.0, 0.4, y);

  // Planet coverage (anti-aliased limb).
  float cosP = dot(d, PLANET_DIR);
  float sinP = length(cross(d, PLANET_DIR));
  float planetMask = cosP > 0.0 ? 1.0 - smoothstep(PLANET_R - 0.0012, PLANET_R + 0.0004, sinP) : 0.0;

  // Stars.
  float starMask = smoothstep(0.03, 0.3, y) * (1.0 - planetMask) * (1.0 - smoothstep(0.3, 0.9, muP));
  if (starMask > 0.0) {
    vec3 sp = d * 260.0;
    vec3 cell = floor(sp);
    float rnd = hash13(cell);
    if (rnd > 0.995) {
      vec3 off = fract(sp) - (0.2 + 0.6 * hash33(cell));
      float twinkle = 0.75 + 0.25 * sin(uTime * (1.3 + 3.0 * rnd) + rnd * 91.0);
      col += vec3(0.8, 0.88, 1.0) * exp(-dot(off, off) * 36.0) * (rnd - 0.995) * 160.0 * twinkle * starMask;
    }
  }

  // Ringed gas giant: analytic sphere + ring plane with mutual shadows.
  float hP = cosP * cosP - (1.0 - PLANET_R * PLANET_R);
  float tP = cosP - sqrt(max(hP, 0.0));
  if (planetMask > 0.0) {
    vec3 X = d * tP;
    vec3 N = normalize(X - PLANET_DIR);
    float lat = dot(N, RING_N);
    float lon = dot(N, normalize(cross(RING_N, PLANET_DIR)));
    float b1 = textureLod(uEchoNoise, vec2(lat * 0.8 + lon * 0.05 + 0.13, 0.21), 0.0).r;
    float b2 = textureLod(uEchoNoise, vec2(lat * 2.7 + 0.5, 0.63 + lon * 0.08), 0.0).g;
    vec3 surf = mix(vec3(0.16, 0.24, 0.27), vec3(0.42, 0.31, 0.21), smoothstep(0.3, 0.7, b1));
    surf = mix(surf, vec3(0.58, 0.52, 0.44), 0.4 * smoothstep(0.45, 0.8, b2));
    float ndl = dot(N, ECHO_SUN_DIR);
    float light = smoothstep(-0.06, 0.25, ndl) * (0.3 + 0.7 * max(ndl, 0.0));
    float tS = dot(PLANET_DIR - X, RING_N) / dot(ECHO_SUN_DIR, RING_N);
    if (tS > 0.0) light *= 1.0 - 0.7 * ringDensity(length(X + ECHO_SUN_DIR * tS - PLANET_DIR) / PLANET_R);
    vec3 planet = surf * SUN_COLOR * 2.4 * light + surf * 0.012;
    float rim = pow(1.0 - max(dot(N, -d), 0.0), 4.0);
    planet += vec3(0.3, 0.5, 0.65) * rim * 0.4 * smoothstep(-0.25, 0.35, ndl);
    col = mix(col, mix(planet, sky, 0.18 + 0.5 * haze), planetMask);
  }

  float denom = dot(d, RING_N);
  float tR = abs(denom) > 1e-5 ? dot(PLANET_DIR, RING_N) / denom : -1.0;
  if (tR > 0.0) {
    vec3 ringP = d * tR;
    float ring = ringDensity(length(ringP - PLANET_DIR) / PLANET_R);
    if (ring > 0.0) {
      float shadow = raySphere(ringP, ECHO_SUN_DIR, PLANET_DIR, PLANET_R) > 0.0 ? 0.1 : 1.0;
      float side = 0.4 + 0.6 * abs(dot(ECHO_SUN_DIR, RING_N));
      vec3 ringCol = mix(vec3(0.6, 0.53, 0.45) * SUN_COLOR * 1.7 * side * shadow, sky, 0.18 + 0.5 * haze);
      float vis = ring * 0.8 * (tR < tP ? 1.0 : 1.0 - planetMask);
      col = mix(col, ringCol, vis);
    }
  }

  // Streaky clouds drifting along the wind.
  float cloud = 0.0;
  if (y > 0.0) {
    vec2 cuv = d.xz / (y + 0.14);
    vec2 q = vec2(dot(cuv, vec2(0.92, 0.39)), dot(cuv, vec2(-0.39, 0.92)));
    q = q * vec2(0.09, 0.3) + vec2(uTime * 0.0025, 0.0);
    float c1 = texture(uEchoNoise, q).r;
    float c2 = texture(uEchoNoise, q * 3.1 + 0.27).g;
    cloud = smoothstep(0.5, 0.8, c1 * 0.8 + c2 * 0.3) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.45, 0.9, y));
    vec3 cloudCol = mix(uFogColor * 0.75, vec3(0.09, 0.075, 0.11), smoothstep(0.0, 0.4, y));
    cloudCol += SUN_COLOR * (0.08 + 0.9 * pow(muP, 6.0)) * (0.5 + 0.5 * c2);
    col = mix(col, cloudCol, cloud * 0.6);
  }

  // Sun disk (HDR, blooms) + corona.
  float t = clamp((1.0 - mu) / (1.0 - SUN_COS), 0.0, 1.0);
  col += SUN_COLOR * mix(18.0, 9.0, t) * (1.0 - smoothstep(0.85, 1.0, t)) * (1.0 - 0.75 * cloud);
  col += SUN_COLOR * (0.5 * pow(muP, 1200.0) + 0.08 * pow(muP, 120.0)) * (1.0 - 0.5 * cloud);

  // Far ranges painted at the horizon (integer repeats keep the atan seam invisible).
  float az = atan(d.z, d.x) / 6.2831853;
  float range = 0.014 + 0.03 * textureLod(uEchoNoise, vec2(az * 4.0, 0.11), 0.0).a
              + 0.01 * textureLod(uEchoNoise, vec2(az * 16.0, 0.57), 0.0).r;
  float sunward = max(dot(normalize(d.xz + 1e-5), normalize(ECHO_SUN_DIR.xz)), 0.0);
  range *= 1.0 - 0.45 * sunward * sunward;
  col = mix(col, horizon * 0.8, (1.0 - smoothstep(range - 0.002, range, y)) * step(-0.1, y));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Dither against banding: ±1 % before the composer's tone mapping, ±0.5/255 when writing sRGB directly.
  float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  gl_FragColor.rgb *= 1.0 + (ign - 0.5) * 0.02;
  if (linearToOutputTexel(vec4(0.5)).r > 0.6) gl_FragColor.rgb += (ign - 0.5) / 255.0;
}
`

/** Sky dome drawn after opaques (renderOrder 1000) on the far plane, so only uncovered pixels shade it. */
export function createSky(fogColor: THREE.Color): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    name: 'echo.sky',
    uniforms: {
      uTime: sharedUniforms.uEchoTime,
      uEchoNoise: sharedUniforms.uEchoNoise,
      uFogColor: { value: fogColor },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material)
  sky.name = 'sky'
  sky.frustumCulled = false
  sky.renderOrder = 1000
  sky.matrixAutoUpdate = false
  return sky
}

import * as THREE from 'three'
import type { QualitySettings } from '../render/quality'
import { patchMaterial } from '../render/shaderChunks'

// Procedural terrain: wind-swept dust on flats, stratified rock on steep ground, darker in the depths.
const TERRAIN_PARS = /* glsl */ `
uniform vec3 uDust;
uniform vec3 uDustPale;
uniform vec3 uRock;
uniform vec3 uRockPale;

vec3 terrainSurface(vec3 wp, vec3 wn, out float rough, out float bump) {
  float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
  float macro = echoFbm(wp.xz * 0.011);
  float mid = echoNoise(wp.xz * 0.13);
  float fine = echoNoise(wp.xz * 1.9);
  float ripple = 0.5 + 0.5 * sin(dot(wp.xz, vec2(0.83, 0.55)) * 2.2 + mid * 7.0);

  vec3 dust = mix(uDust, uDustPale, smoothstep(0.3, 0.8, macro + wp.y * 0.01));
  dust *= (0.88 + 0.22 * mid) * (0.95 + 0.07 * ripple);

  float strata = echoNoise(vec2(wp.y * 0.6 + echoNoise(wp.xz * 0.035) * 3.0, 0.37));
  vec3 rock = mix(uRock, uRockPale, smoothstep(0.25, 0.85, strata));
  rock *= 0.82 + 0.3 * fine;

  float rockMask = smoothstep(0.24, 0.45, slope + (mid - 0.5) * 0.14);
  vec3 albedo = mix(dust, rock, rockMask);
  albedo *= mix(0.62, 1.0, smoothstep(-30.0, -2.0, wp.y));
  rough = mix(0.97, 0.84, rockMask);
  bump = mix(fine * 0.05 + ripple * 0.03, strata * 0.3 + fine * 0.08, rockMask);
  return albedo;
}
`

const TERRAIN_COLOR = /* glsl */ `
vec3 terrainNormalW = normalize((vec4(normalize(vNormal), 0.0) * viewMatrix).xyz);
float terrainRough;
float terrainBump;
diffuseColor.rgb *= terrainSurface(vEchoWorld, terrainNormalW, terrainRough, terrainBump);
`

// Derivative bump mapping (Mikkelsen) on the procedural height; fades out before it can alias.
const TERRAIN_BUMP = /* glsl */ `
#ifdef TERRAIN_BUMP
{
  float bumpFade = 1.0 - smoothstep(20.0, 65.0, length(vViewPosition));
  vec3 dpdx = dFdx(-vViewPosition);
  vec3 dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(terrainBump) * bumpFade;
  float dhy = dFdy(terrainBump) * bumpFade;
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}
#endif
`

export function createTerrainMaterial(quality: QualitySettings): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 })
  material.name = 'echo.terrain'
  setTerrainQuality(material, quality)
  return patchMaterial(material, {
    key: 'terrain',
    uniforms: {
      uDust: { value: new THREE.Color('#8f7a6d') },
      uDustPale: { value: new THREE.Color('#b39d88') },
      uRock: { value: new THREE.Color('#4f4140') },
      uRockPale: { value: new THREE.Color('#7a665d') },
    },
    fragmentPars: TERRAIN_PARS,
    fragmentChunks: {
      color_fragment: TERRAIN_COLOR,
      roughnessmap_fragment: 'roughnessFactor = terrainRough;',
      normal_fragment_maps: TERRAIN_BUMP,
    },
  })
}

/** Bump detail is skipped on Low. Toggling the define recompiles the program once. */
export function setTerrainQuality(material: THREE.MeshStandardMaterial, quality: QualitySettings) {
  const wantBump = quality.level !== 'low'
  if (wantBump === 'TERRAIN_BUMP' in material.defines) return
  if (wantBump) material.defines.TERRAIN_BUMP = ''
  else delete material.defines.TERRAIN_BUMP
  material.needsUpdate = true
}

const STONE_COLOR = /* glsl */ `
{
  float n = echoNoise(vEchoWorld.xz * 0.6 + vEchoWorld.y * 0.45) * 0.6 + echoNoise(vEchoWorld.xy * 2.1 + vEchoWorld.z) * 0.4;
  float streak = echoNoise(vec2((vEchoWorld.x + vEchoWorld.z) * 0.15, vEchoWorld.y * 1.4));
  diffuseColor.rgb *= (0.78 + 0.34 * n) * (0.92 + 0.12 * streak);
}
`

/** Weathered alien stone for ruins and monoliths (world-space variation, no UVs needed). */
export function createStoneMaterial(color = '#7a6a62'): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02 })
  material.name = 'echo.stone'
  return patchMaterial(material, { key: 'stone', fragmentChunks: { color_fragment: STONE_COLOR } })
}

/** Self-lit energy surfaces (beacons, glyph light). Shares the height fog so distant glow fades correctly. */
export function createEnergyMaterial(color: string, intensity: number): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: '#0b1a1f',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0,
  })
  material.name = 'echo.energy'
  return patchMaterial(material, { key: 'energy' })
}

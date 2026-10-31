import * as THREE from 'three'
import { patchWorldMaterial, type WorldMaterialPatch } from '../render/shaderChunks'
import { fbmTile, ridgedTile, worleyTile } from './noise'

const NOISE_SIZE = 256
const toByte = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))

/** 256² tileable RGBA noise: R = fbm (8 cells), G = fbm (32 cells), B = Worley F1 (16 cells), A = ridged (8 cells). */
export function createNoiseTexture(anisotropy = 1): THREE.DataTexture {
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4)
  for (let y = 0; y < NOISE_SIZE; y++) {
    const v = y / NOISE_SIZE
    for (let x = 0; x < NOISE_SIZE; x++) {
      const u = x / NOISE_SIZE
      const k = (y * NOISE_SIZE + x) * 4
      data[k] = toByte(fbmTile(u, v, 8, 5) * 0.75 + 0.5)
      data[k + 1] = toByte(fbmTile(u, v, 32, 3) * 0.75 + 0.5)
      data[k + 2] = toByte(worleyTile(u, v, 16))
      data[k + 3] = toByte(ridgedTile(u, v, 8, 4))
    }
  }
  const texture = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.name = 'echo.noise'
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
  return texture
}

// Linear albedos. Soil/rock blend by slope, then splat layers (vale tint, works ash, sediment, trails).
const TERRAIN_COLOR = /* glsl */ `
  vec4 tSplat = texture(uTerrainSplat, echoTerrainUV(vWorldPos.xz));
  vec3 tN = normalize(vWorldNormal);
  float tSlope = 1.0 - tN.y;
  vec2 tXZ = vWorldPos.xz;
  vec4 tA = texture(uEchoNoise, tXZ * 0.0123);
  vec4 tB = texture(uEchoNoise, tXZ * 0.071 + 0.37);
  vec4 tC = texture(uEchoNoise, tXZ * 0.43 + 0.71);
  // Biplanar side projections so steep faces aren't smeared.
  vec2 tW = abs(tN.xz) + 1e-3;
  tW /= tW.x + tW.y;
  vec4 tS = texture(uEchoNoise, vWorldPos.zy * vec2(0.083, 0.19)) * tW.x
          + texture(uEchoNoise, vWorldPos.xy * vec2(0.083, 0.19) + 0.5) * tW.y;
  float tStrata = 0.5 + 0.5 * sin(vWorldPos.y * 1.9 + tS.r * 7.0 + tA.g * 5.0);
  vec3 tRock = mix(vec3(0.06, 0.052, 0.048), vec3(0.22, 0.175, 0.15),
                   clamp(0.3 + 0.45 * tStrata * tS.g + 0.35 * (tS.a - 0.4), 0.0, 1.0));
  float tSoilVar = clamp(tA.r * 0.65 + tB.g * 0.45 - 0.1, 0.0, 1.0);
  vec3 tSoil = mix(vec3(0.085, 0.066, 0.056), vec3(0.19, 0.142, 0.11), tSoilVar) * (0.86 + 0.28 * tC.r);
  float tRockMask = smoothstep(0.16, 0.36, tSlope + (tB.b - 0.4) * 0.22);
  float tFlat = 1.0 - tRockMask;
  vec3 tAlbedo = mix(tSoil, tRock, tRockMask);
  tAlbedo = mix(tAlbedo, vec3(0.07, 0.1, 0.13) * (0.8 + 0.4 * tB.r), tSplat.g * (1.0 - 0.6 * tRockMask));
  tAlbedo = mix(tAlbedo, vec3(0.035, 0.033, 0.032) * (0.8 + 0.4 * tC.g), tSplat.b * tFlat);
  tAlbedo = mix(tAlbedo, vec3(0.12, 0.095, 0.082) * (0.9 + 0.2 * tB.a), tSplat.a * tFlat);
  // Low-frequency edge breakup: the 14 cm Worley term aliased into blocky pebbles along trail edges.
  float tTrail = smoothstep(0.25, 0.65, tSplat.r + (tB.b - 0.45) * 0.35 + (tC.r - 0.5) * 0.12) * tFlat;
  tAlbedo = mix(tAlbedo, vec3(0.28, 0.21, 0.15) * (0.82 + 0.3 * tC.r), tTrail);
  diffuseColor.rgb = tAlbedo;
  float echoBump = (tC.r * 0.05 + tB.b * 0.16) * (1.0 - 0.75 * tTrail) + tRockMask * (tS.a * 0.45 + tStrata * 0.12);
  float echoRough = mix(0.97, 0.86, tRockMask) - 0.05 * tTrail;
`

export function createTerrainMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 })
  material.name = 'echo.terrain'
  return patchWorldMaterial(material, {
    key: 'terrain',
    color: TERRAIN_COLOR,
    roughness: 'roughnessFactor = echoRough;',
    normal: 'normal = echoPerturbNormal(-vViewPosition, normal, echoBump);',
  })
}

// Triplanar wear + grain on top of the material colour.
const STONE_COLOR = /* glsl */ `
  vec3 sW = abs(normalize(vWorldNormal)) + 1e-3;
  sW /= sW.x + sW.y + sW.z;
  vec4 sT = texture(uEchoNoise, vWorldPos.zy * 0.21) * sW.x
          + texture(uEchoNoise, vWorldPos.xz * 0.21 + 0.3) * sW.y
          + texture(uEchoNoise, vWorldPos.xy * 0.21 + 0.6) * sW.z;
  float sWear = clamp(sT.r * 1.2 - 0.1 + sT.a * 0.3, 0.0, 1.0);
  diffuseColor.rgb *= mix(0.55, 1.15, sWear) * (0.9 + 0.2 * sT.g);
  float echoBump = sT.a * 0.06 + sT.b * 0.03;
`

/** Extra vertex-stage hooks for a material variant (e.g. instanced scatter); `key` names the variant's shader. */
export type MaterialVariant = Pick<WorldMaterialPatch, 'uniforms' | 'vertexPars' | 'vertex' | 'fragmentPars'> & {
  key: string
}

export function createStoneMaterial(
  color: THREE.ColorRepresentation = '#8b7d72',
  variant?: MaterialVariant,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 })
  material.name = 'echo.stone'
  return patchWorldMaterial(material, {
    ...variant,
    key: variant ? `stone-${variant.key}` : 'stone',
    color: STONE_COLOR,
    roughness: 'roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * sT.g), 0.0, 1.0);',
    normal: 'normal = echoPerturbNormal(-vViewPosition, normal, echoBump);',
  })
}

// Weathered alloy: noise stretched vertically on the side faces reads as grime streaks; oxidised patches go matte.
const METAL_COLOR = /* glsl */ `
  vec3 mW = abs(normalize(vWorldNormal)) + 1e-3;
  mW /= mW.x + mW.y + mW.z;
  vec4 mT = texture(uEchoNoise, vWorldPos.zy * vec2(0.3, 0.07)) * mW.x
          + texture(uEchoNoise, vWorldPos.xz * 0.17 + 0.5) * mW.y
          + texture(uEchoNoise, vWorldPos.xy * vec2(0.3, 0.07) + 0.25) * mW.z;
  float echoRust = smoothstep(0.55, 0.8, mT.r + mT.a * 0.25);
  vec3 mRustColor = vec3(0.34, 0.19, 0.11) * (0.8 + 0.4 * mT.b);
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.72 + 0.4 * mT.g), mRustColor, echoRust);
  float echoBump = mT.b * 0.02 + echoRust * 0.05;
`

/** Alien alloy of the Conduit Works: grime streaks and rust patches over a muted base colour. */
export function createMetalMaterial(color: THREE.ColorRepresentation = '#626b6c'): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
  material.name = 'echo.metal'
  return patchWorldMaterial(material, {
    key: 'metal',
    color: METAL_COLOR,
    roughness: 'roughnessFactor = clamp(mix(roughnessFactor * (0.8 + 0.4 * mT.g), 0.95, echoRust), 0.0, 1.0);',
    normal: 'normal = echoPerturbNormal(-vViewPosition, normal, echoBump);',
  })
}

// Faceted crystal: slow bands of light drifting up through it plus a bright rim at grazing angles.
const CRYSTAL_GLOW = /* glsl */ `
  float cBand = 0.5 + 0.5 * sin(vWorldPos.y * 0.7 - uEchoTime * 1.3 + vWorldPos.x * 0.21 + vWorldPos.z * 0.17);
  float cRim = 1.0 - abs(dot(normalize(cameraPosition - vWorldPos), normalize(vWorldNormal)));
  totalEmissiveRadiance *= 0.3 + 0.5 * cBand * cBand + 0.9 * cRim * cRim;
`

/** Non-reactive glowing crystal (Vale pipes, ribs, sprigs). Reactive shards use `CrystalCluster` instead. */
export function createCrystalMaterial(
  color: THREE.ColorRepresentation = '#3ee6c8',
  intensity = 1,
  variant?: MaterialVariant,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: '#10222a',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.18,
    metalness: 0.2,
    flatShading: true,
  })
  material.name = 'echo.crystalGlow'
  return patchWorldMaterial(material, {
    ...variant,
    key: variant ? `crystal-glow-${variant.key}` : 'crystal-glow',
    emissive: CRYSTAL_GLOW,
  })
}

/** Emissive "living energy" with a slow pulse travelling up the surface. */
export function createEnergyMaterial(color: THREE.ColorRepresentation = '#56e6ff', intensity = 3): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: '#0b1a1f',
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.35,
    metalness: 0.1,
  })
  material.name = 'echo.energy'
  return patchWorldMaterial(material, {
    key: 'energy',
    emissive: 'totalEmissiveRadiance *= 0.7 + 0.3 * sin(uEchoTime * 2.2 + vWorldPos.y * 1.4);',
  })
}

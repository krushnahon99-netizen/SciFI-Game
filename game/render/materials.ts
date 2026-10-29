/** Shared material library. Every world surface is a patched MeshStandardMaterial. */
import * as THREE from 'three'
import { ATMOSPHERE, patchWorldMaterial } from './shaderChunks'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)

export function createMaterials() {
  const echoHDR = ATMOSPHERE.echo.clone().multiplyScalar(4)
  const m = {
    terrain: patchWorldMaterial(std({ vertexColors: true, roughness: 0.95, metalness: 0 }), {
      terrain: true,
      ripple: 1,
      glyph: 0.1,
      front: 0.85,
      detailScale: 6,
      detailStrength: 1,
      normalStrength: 0.55,
    }),
    sandstone: patchWorldMaterial(std({ color: '#a8957c', roughness: 0.9 }), {
      glyph: 1,
      detailScale: 3,
      detailStrength: 0.45,
      normalStrength: 0.8,
    }),
    basalt: patchWorldMaterial(std({ color: '#3f3b47', roughness: 0.72 }), {
      glyph: 1.15,
      baseGlyph: 0.05,
      detailScale: 3,
      detailStrength: 0.4,
      normalStrength: 0.7,
    }),
    rock: patchWorldMaterial(std({ color: '#62585f', roughness: 0.9 }), {
      glyph: 0.15,
      detailScale: 3,
      detailStrength: 0.6,
      normalStrength: 1,
    }),
    bone: patchWorldMaterial(std({ color: '#cbbfa9', roughness: 0.68 }), {
      glyph: 0.6,
      detailScale: 2,
      detailStrength: 0.25,
      normalStrength: 0.4,
    }),
    metal: patchWorldMaterial(std({ color: '#5a616b', roughness: 0.48, metalness: 0.75 }), {
      glyph: 0.55,
      detailScale: 2,
      detailStrength: 0.3,
      normalStrength: 0.45,
    }),
    rust: patchWorldMaterial(std({ color: '#70503c', roughness: 0.82, metalness: 0.35 }), {
      glyph: 0.35,
      detailScale: 2.5,
      detailStrength: 0.55,
      normalStrength: 0.7,
    }),
    crystal: patchWorldMaterial(
      std({
        color: '#93b4ff',
        emissive: '#38cfff',
        emissiveIntensity: 0.32,
        roughness: 0.16,
        metalness: 0.05,
        flatShading: true,
      }),
      { front: 2.2, detailStrength: 0, normalStrength: 0 },
    ),
    plant: patchWorldMaterial(std({ color: '#a7a18e', roughness: 0.92, side: THREE.DoubleSide }), {
      front: 1.3,
      detailStrength: 0,
      normalStrength: 0,
    }),
    petal: patchWorldMaterial(
      std({
        color: '#d9d2ff',
        emissive: '#9a8cff',
        emissiveIntensity: 0.25,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
      { front: 1.6, detailStrength: 0, normalStrength: 0 },
    ),
    glass: patchWorldMaterial(
      std({
        color: '#a9e6ff',
        emissive: '#3fcaff',
        emissiveIntensity: 0.55,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      }),
      { front: 1.4, detailStrength: 0, normalStrength: 0, indoor: false },
    ),
    glow: new THREE.MeshBasicMaterial({ color: echoHDR }),
    glowWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae66').multiplyScalar(3.2) }),
    glowViolet: new THREE.MeshBasicMaterial({ color: new THREE.Color('#b59cff').multiplyScalar(3) }),
    glowDim: new THREE.MeshBasicMaterial({ color: ATMOSPHERE.echo.clone().multiplyScalar(0.6) }),
    halo: new THREE.MeshBasicMaterial({
      color: ATMOSPHERE.echo.clone().multiplyScalar(1.4),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  }
  return m
}

export type Materials = ReturnType<typeof createMaterials>

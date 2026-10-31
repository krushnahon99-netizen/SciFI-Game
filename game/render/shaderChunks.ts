import * as THREE from 'three'
import { PLAYER_PULSE, PULSE_GLSL, PULSE_INACTIVE, PULSE_SLOTS } from '../echo/pulseShader'
import { SUN_DIRECTION, TERRAIN_UV_SCALE } from '../world/layout'

/** Exponential height-fog falloff per metre (density = fogDensity · e^(−falloff · y)). */
export const FOG_HEIGHT_FALLOFF = 0.0115
/** Linear sun in-scatter colour added toward the sun (fog and sky horizon share it). */
export const SUN_SCATTER = new THREE.Vector3(0.62, 0.3, 0.12)

const f = (n: number) => n.toFixed(6)
const v3 = (v: { x: number; y: number; z: number }) => `vec3(${f(v.x)}, ${f(v.y)}, ${f(v.z)})`

/**
 * Shared atmosphere GLSL. Built-in materials can't take custom uniforms through the fog chunks
 * (ShaderLib uniforms are cloned), so the sun direction, in-scatter colour and falloff are baked constants.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
const vec3 ECHO_SUN_DIR = ${v3(SUN_DIRECTION)};
const vec3 ECHO_SUN_SCATTER = ${v3(SUN_SCATTER)};
const float ECHO_FOG_FALLOFF = ${f(FOG_HEIGHT_FALLOFF)};

vec3 echoAtmosphere(vec3 base, vec3 dir) {
  float mu = max(dot(dir, ECHO_SUN_DIR), 0.0);
  return base + ECHO_SUN_SCATTER * (0.22 * mu * mu + 0.5 * pow(mu, 12.0) + 1.1 * pow(mu, 64.0));
}

// Exponential height fog integrated along the camera ray.
float echoFogFactor(float density, float dist, vec3 dir, float camY) {
  float k = ECHO_FOG_FALLOFF * dir.y * dist;
  float g = abs(k) < 1e-3 ? 1.0 - 0.5 * k : (1.0 - exp(-k)) / k;
  return 1.0 - exp(-density * dist * exp(-ECHO_FOG_FALLOFF * camY) * g);
}

vec3 echoSRGBToLinear(vec3 c) {
  return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045))));
}
`

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vEchoFogRay;
#endif
`

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vEchoFogRay = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;
#endif
`

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying vec3 vEchoFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${ATMOSPHERE_GLSL}
#endif
`

// three applies fog after tone mapping + colour-space conversion, and uploads fogColor sRGB-encoded when drawing
// straight to the canvas but linear into the composer target. Work in linear, then re-encode like the fragment.
const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  {
    float echoDist = length(vEchoFogRay);
    vec3 echoDir = vEchoFogRay / max(echoDist, 1e-4);
    #ifdef FOG_EXP2
      float echoFog = echoFogFactor(fogDensity, echoDist, echoDir, cameraPosition.y);
    #else
      float echoFog = smoothstep(fogNear, fogFar, echoDist);
    #endif
    bool echoEncoded = linearToOutputTexel(vec4(0.5)).r > 0.6;
    vec3 echoFogColor = echoAtmosphere(echoEncoded ? echoSRGBToLinear(fogColor) : fogColor, echoDir);
    #ifdef TONE_MAPPING
      echoFogColor = toneMapping(echoFogColor);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(echoFogColor, 1.0)).rgb, echoFog);
  }
#endif
`

let fogInstalled = false

/** Replaces three's fog chunks globally (call before any material compiles). */
export function installEchoFog() {
  if (fogInstalled) return
  fogInstalled = true
  THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX
  THREE.ShaderChunk.fog_vertex = FOG_VERTEX
  THREE.ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT
  THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT
}

/** Uniforms shared by every patched world material (one update drives them all). */
export const sharedUniforms = {
  uEchoTime: { value: 0 },
  /** Play clock the pulses are timed on (frozen while paused); written by EchoSystem. */
  uEchoClock: { value: 0 },
  /** Per pulse slot: emitter position (xyz) + start time on uEchoClock (w). */
  uEchoPulses: { value: Array.from({ length: PULSE_SLOTS }, () => new THREE.Vector4(0, 0, 0, PULSE_INACTIVE)) },
  /** Per pulse slot: wavefront speed (x, m/s) and dissolve radius (y, m); written by EchoSystem. */
  uEchoPulseShapes: {
    value: Array.from({ length: PULSE_SLOTS }, () => new THREE.Vector2(PLAYER_PULSE.speed, PLAYER_PULSE.radius)),
  },
  uEchoNoise: { value: null as THREE.Texture | null },
  uTerrainShadow: { value: null as THREE.Texture | null },
  uTerrainSplat: { value: null as THREE.Texture | null },
}

const VERTEX_COMMON = /* glsl */ `
uniform float uEchoTime;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
`

const FRAGMENT_COMMON = /* glsl */ `
uniform float uEchoTime;
uniform sampler2D uEchoNoise;
uniform sampler2D uTerrainShadow;
uniform sampler2D uTerrainSplat;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;

vec2 echoTerrainUV(vec2 xz) { return xz / ${TERRAIN_UV_SCALE.toFixed(1)} + 0.5; }

// Baked terrain sun shadow: lit once the point rises above the shadow height of its column.
float echoTerrainSunVisibility(vec3 p) {
  float sh = texture(uTerrainShadow, echoTerrainUV(p.xz)).r;
  return smoothstep(sh - 1.6, sh + 0.6, p.y);
}

// Bump from a scalar height (metres) via screen-space derivatives (surface-gradient method).
vec3 echoPerturbNormal(vec3 surfPos, vec3 surfNormal, float height) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * surfNormal - grad);
}
${PULSE_GLSL}
`

const WORLD_POSITION_VERTEX = /* glsl */ `
  vec4 echoWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    echoWorld = batchingMatrix * echoWorld;
  #endif
  #ifdef USE_INSTANCING
    echoWorld = instanceMatrix * echoWorld;
  #endif
  echoWorld = modelMatrix * echoWorld;
  vWorldPos = echoWorld.xyz;
`

const DIRECTIONAL_ANCHOR = 'getDirectionalLightInfo( directionalLight, directLight );'

function patchedLightsBegin(visibility: string): string {
  const chunk = THREE.ShaderChunk.lights_fragment_begin
  if (!chunk.includes(DIRECTIONAL_ANCHOR)) {
    console.warn('[echo] lights_fragment_begin anchor not found; terrain sun shadow disabled')
    return chunk
  }
  return `float echoSunVisibility = ${visibility};\n${chunk.replace(
    DIRECTIONAL_ANCHOR,
    `${DIRECTIONAL_ANCHOR}\n\t\tdirectLight.color *= echoSunVisibility;`,
  )}`
}

export interface WorldMaterialPatch {
  /** Unique per shader variant (becomes the program cache key). */
  key: string
  uniforms?: Record<string, THREE.IUniform>
  vertexPars?: string
  /** Runs after project_vertex; `vWorldPos` is set. */
  vertex?: string
  fragmentPars?: string
  /** After color_fragment: edit `diffuseColor`. */
  color?: string
  /** After roughnessmap_fragment: edit `roughnessFactor`. */
  roughness?: string
  /** After normal_fragment_maps: edit `normal` (view space). */
  normal?: string
  /** After emissivemap_fragment: edit `totalEmissiveRadiance`. */
  emissive?: string
  /** GLSL float expression multiplied into the sun's light (default: baked terrain shadow). */
  sunVisibility?: string
  /** Draw the echo pulse wavefront and glyph reveal on this surface (default true). */
  pulse?: boolean
}

/** Injects shared uniforms, world-space varyings, terrain sun shadow and per-material hooks into a built-in material. */
export function patchWorldMaterial<T extends THREE.Material>(material: T, patch: WorldMaterialPatch): T {
  const withNormal = !('isMeshBasicMaterial' in material)
  const withPulse = patch.pulse !== false
  const pulseEmission = withPulse ? 'totalEmissiveRadiance += echoPulseEmission(vWorldPos, normalize(vWorldNormal));' : ''
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, patch.uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_COMMON}\n${patch.vertexPars ?? ''}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n${WORLD_POSITION_VERTEX}\n${
          withNormal
            ? 'vWorldNormal = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);'
            : 'vWorldNormal = vec3(0.0, 1.0, 0.0);'
        }\n${patch.vertex ?? ''}`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_COMMON}\n${patch.fragmentPars ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${patch.color ?? ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${patch.roughness ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${patch.normal ?? ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${patch.emissive ?? ''}\n${pulseEmission}`)
      .replace(
        '#include <lights_fragment_begin>',
        patchedLightsBegin(patch.sunVisibility ?? 'echoTerrainSunVisibility(vWorldPos)'),
      )
  }
  // The default key is onBeforeCompile.toString(), identical for every patched material → wrong program reuse.
  material.customProgramCacheKey = () => `echo:${patch.key}${withPulse ? '' : ':nopulse'}`
  return material
}

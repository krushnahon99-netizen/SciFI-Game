import * as THREE from 'three'

/**
 * Uniforms shared by every patched world material and the sky/mountain shaders.
 * Update values in place (never reassign) so one write per frame reaches every program.
 */
export const sharedUniforms = {
  uTime: { value: 0 },
  uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color() },
  uSkyZenith: { value: new THREE.Color() },
  uSkyMid: { value: new THREE.Color() },
  uFogColor: { value: new THREE.Color() },
  uFogSunColor: { value: new THREE.Color() },
  /** x: density at base height, y: height falloff (1/m), z: base height (m), w: uniform distance density. */
  uFogParams: { value: new THREE.Vector4() },
}

/** Uniform declarations + helpers available to every patched material and custom world shader. */
export const SHARED_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyZenith;
uniform vec3 uSkyMid;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFogParams;

float echoHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float echoNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = echoHash12(i);
  float b = echoHash12(i + vec2(1.0, 0.0));
  float c = echoHash12(i + vec2(0.0, 1.0));
  float d = echoHash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float echoFbm(vec2 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amplitude * echoNoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.31;
    amplitude *= 0.5;
  }
  return sum / 0.9375;
}

// Exponential height fog integrated analytically along the view ray. offset = fragment - camera.
float echoFogAmount(vec3 offset) {
  float dist = length(offset);
  float k = clamp(uFogParams.y * offset.y, -30.0, 30.0);
  float heightTerm = abs(k) > 1e-3 ? (1.0 - exp(-k)) / k : 1.0 - 0.5 * k;
  float density = uFogParams.x * exp(min(-uFogParams.y * (cameraPosition.y - uFogParams.z), 20.0));
  return 1.0 - exp(-(density * heightTerm + uFogParams.w) * dist);
}

vec3 echoFogColor(vec3 dir) {
  float s = max(dot(dir, uSunDirection), 0.0);
  return mix(uFogColor, uFogSunColor, s * s) + uSunColor * (pow(s, 24.0) * 0.45);
}

// Matches echoFogColor exactly at the horizon so fully fogged terrain melts into the sky.
vec3 echoSkyColor(vec3 dir) {
  float up = clamp(dir.y, 0.0, 1.0);
  float s = max(dot(dir, uSunDirection), 0.0);
  vec3 col = mix(echoFogColor(dir), uSkyMid, smoothstep(0.0, 0.4, up));
  col = mix(col, uSkyZenith, smoothstep(0.35, 1.0, up));
  col += uSunColor * (pow(s, 8.0) * 0.35) * smoothstep(-0.05, 0.15, dir.y);
  return mix(col, uFogColor * 0.7, 1.0 - smoothstep(-0.3, 0.0, dir.y));
}
`

export interface MaterialPatch {
  /** Unique per distinct shader variant; becomes the program cache key. */
  key: string
  uniforms?: Record<string, THREE.IUniform>
  vertexPars?: string
  fragmentPars?: string
  /** GLSL appended after `#include <chunk>`, keyed by chunk name. `project_vertex` is reserved. */
  vertexChunks?: Record<string, string>
  fragmentChunks?: Record<string, string>
}

const WORLD_POSITION_VERTEX = /* glsl */ `
vEchoWorld = cameraPosition + (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;`

function appendAfterChunks(source: string, chunks: Record<string, string> | undefined): string {
  if (!chunks) return source
  let out = source
  for (const [chunk, code] of Object.entries(chunks)) {
    const include = `#include <${chunk}>`
    if (!out.includes(include)) {
      console.warn(`[echo] shader chunk <${chunk}> not found`)
      continue
    }
    out = out.replace(include, `${include}\n${code}`)
  }
  return out
}

/**
 * Injects the shared uniforms, a world-position varying (`vEchoWorld`, works with instancing/skinning)
 * and the height fog into a built-in material, plus optional material-specific GLSL.
 */
export function patchMaterial<T extends THREE.Material>(material: T, patch: MaterialPatch): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, patch.uniforms)
    const header = `#define ECHO_SHARED\nvarying vec3 vEchoWorld;\n${SHARED_GLSL}\n`
    const vertex = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>\n${WORLD_POSITION_VERTEX}`,
    )
    shader.vertexShader = `${header}${patch.vertexPars ?? ''}\n${appendAfterChunks(vertex, patch.vertexChunks)}`
    shader.fragmentShader = `${header}${patch.fragmentPars ?? ''}\n${appendAfterChunks(shader.fragmentShader, patch.fragmentChunks)}`
  }
  material.customProgramCacheKey = () => `echo:${patch.key}`
  return material
}

let installed = false

/** Swaps three's fog for the shared height fog on patched materials. Call once before the first render. */
export function installShaderChunks(): void {
  if (installed) return
  installed = true
  const original = THREE.ShaderChunk.fog_fragment
  // Fog runs after tone mapping/colour-space conversion, so the fog colour gets the same treatment
  // (a no-op when rendering into the linear HDR composer target).
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef ECHO_SHARED
#ifdef USE_FOG
  vec3 echoFogOffset = vEchoWorld - cameraPosition;
  vec3 echoFogTint = echoFogColor(echoFogOffset / max(length(echoFogOffset), 1e-3));
  #ifdef TONE_MAPPING
    echoFogTint = toneMapping(echoFogTint);
  #endif
  echoFogTint = linearToOutputTexel(vec4(echoFogTint, 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, echoFogTint, echoFogAmount(echoFogOffset));
#endif
#else
${original}
#endif
`
}

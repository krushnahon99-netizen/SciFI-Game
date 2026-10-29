/**
 * Global shader plumbing:
 *  - overrides three's fog chunks with analytic height fog + sun in-scatter (all built-in materials)
 *  - shared uniforms (time, two echo-pulse slots, indoor volumes) referenced by every world material
 *  - patchWorldMaterial(): injects triplanar detail, terrain blending, detail normals, the echo
 *    wavefront / glyph reveal and indoor darkening into MeshStandardMaterial via onBeforeCompile.
 */
import * as THREE from 'three'
import { SUN_DIR } from '../world/layout'

const lin = (hex: string) => new THREE.Color(hex)
const glslVec3 = (c: THREE.Color | THREE.Vector3 | number[], scale = 1) => {
  const a = Array.isArray(c) ? c : c instanceof THREE.Color ? [c.r, c.g, c.b] : [c.x, c.y, c.z]
  return `vec3(${a.map((v) => (v * scale).toFixed(5)).join(', ')})`
}

/** Atmosphere palette (linear). Shared by sky, distant mountains and fog so horizons match. */
export const ATMOSPHERE = {
  fogColor: lin('#5d6175'),
  fogSunColor: lin('#e0905c').multiplyScalar(0.95),
  fogSunPower: 5,
  fogBaseHeight: 0,
  fogDensity: 0.0026,
  fogFalloff: 0.045,
  fogHaze: 0.00042,
  zenith: lin('#0b0e24'),
  mid: lin('#2a2f52'),
  sunGlow: lin('#ff9a55'),
  sunDisk: lin('#ffc27a'),
  echo: lin('#5ff2ff'),
}

export const SUN_VEC = new THREE.Vector3(...SUN_DIR)

/**
 * Height fog. three's Fog uniforms are repurposed: fog.near = density at y=0, fog.far = height
 * falloff (1/m). Using THREE.Fog keeps three's uniform plumbing for every built-in material.
 */
export class HeightFog extends THREE.Fog {
  constructor(color: THREE.ColorRepresentation, density: number, falloff: number) {
    super(color, density, falloff)
  }
  get density() {
    return this.near
  }
  set density(v: number) {
    this.near = v
  }
}

export const FOG_GLSL = /* glsl */ `
const vec3 FOG_SUN_DIR = ${glslVec3(SUN_VEC)};
const vec3 FOG_SUN_COLOR = ${glslVec3(ATMOSPHERE.fogSunColor)};
const float FOG_SUN_POWER = ${ATMOSPHERE.fogSunPower.toFixed(2)};
const float FOG_BASE = ${ATMOSPHERE.fogBaseHeight.toFixed(2)};
const float FOG_HAZE = ${ATMOSPHERE.fogHaze.toFixed(6)};
vec3 echoFogColor( vec3 baseColor, vec3 rd ) {
  float s = pow( max( dot( rd, FOG_SUN_DIR ), 0.0 ), FOG_SUN_POWER );
  return baseColor + FOG_SUN_COLOR * s;
}
float echoFogAmount( vec3 wp, float density, float falloff, out vec3 rd ) {
  vec3 ray = wp - cameraPosition;
  float dist = length( ray );
  rd = ray / max( dist, 1e-3 );
  float k = falloff * rd.y * dist;
  float F = abs( k ) > 1e-4 ? ( 1.0 - exp( - k ) ) / k : 1.0 - 0.5 * k;
  float amount = density * exp( - falloff * ( cameraPosition.y - FOG_BASE ) ) * dist * F + dist * FOG_HAZE;
  return clamp( 1.0 - exp( - max( amount, 0.0 ) ), 0.0, 1.0 );
}
`

let chunksInstalled = false

/** Must run before the first material compiles. */
export function installShaderChunks() {
  if (chunksInstalled) return
  chunksInstalled = true
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif`
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${FOG_GLSL}
#endif`
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  {
    vec3 fogRd;
    #ifdef FOG_EXP2
      float fogF = echoFogAmount( vFogWorldPos, fogDensity, 0.045, fogRd );
    #else
      float fogF = echoFogAmount( vFogWorldPos, fogNear, fogFar, fogRd );
    #endif
    gl_FragColor.rgb = mix( gl_FragColor.rgb, echoFogColor( fogColor, fogRd ), fogF );
  }
#endif`
}

// ---------------------------------------------------------------------------------------------
// Shared uniforms
// ---------------------------------------------------------------------------------------------

export const ECHO_SLOTS = 2
export const INDOOR_SLOTS = 3

export const globalUniforms = {
  uTime: { value: 0 },
  uEchoOrigin: { value: Array.from({ length: ECHO_SLOTS }, () => new THREE.Vector3(0, -9999, 0)) },
  /** x: front radius (m), y: front intensity, z: glyph reveal amount, w: max radius */
  uEchoData: { value: Array.from({ length: ECHO_SLOTS }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uEchoActive: { value: 0 },
  /** 0..1 world-wide reveal used by the finale. */
  uEchoWorld: { value: 0 },
  uNoiseTex: { value: null as THREE.Texture | null },
  uDetailNormal: { value: null as THREE.Texture | null },
  uIndoorMin: { value: Array.from({ length: INDOOR_SLOTS }, () => new THREE.Vector3(1e5, 1e5, 1e5)) },
  uIndoorMax: { value: Array.from({ length: INDOOR_SLOTS }, () => new THREE.Vector3(-1e5, -1e5, -1e5)) },
  uIndoorLightPos: { value: Array.from({ length: INDOOR_SLOTS }, () => new THREE.Vector3(0, -9999, 0)) },
  uIndoorLightCol: { value: Array.from({ length: INDOOR_SLOTS }, () => new THREE.Vector3(0, 0, 0)) },
  uPlayerPos: { value: new THREE.Vector3() },
}

/** GLSL shared by every shader that reacts to the echo pulse. */
export const ECHO_COMMON_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uEchoOrigin[ ${ECHO_SLOTS} ];
uniform vec4 uEchoData[ ${ECHO_SLOTS} ];
uniform float uEchoActive;
uniform float uEchoWorld;
const vec3 ECHO_COLOR = ${glslVec3(ATMOSPHERE.echo)};

float echoHash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

float echoLine( float d, float w, float aa ) {
  return 1.0 - smoothstep( w - aa, w + aa, abs( d ) );
}

/** Procedural ancient glyphs, projected along the dominant normal axis (cells ≈ 1.2 m). */
float echoGlyph( vec3 p, vec3 n ) {
  vec3 an = abs( n );
  vec2 uv = an.y > max( an.x, an.z ) ? p.xz : ( an.x > an.z ? p.zy : p.xy );
  uv *= 0.85;
  float aa = ( fwidth( uv.x ) + fwidth( uv.y ) ) * 0.75 + 1e-4;
  vec2 id = floor( uv );
  vec2 f = fract( uv ) - 0.5;
  float h = echoHash12( id );
  float h2 = echoHash12( id + 17.3 );
  if ( h2 > 0.5 ) f = vec2( f.y, - f.x );
  float r = length( f );
  float w = 0.035;
  float g = 0.0;
  if ( h < 0.2 ) {
    g = echoLine( r - 0.3, w, aa ) + ( 1.0 - smoothstep( 0.05, 0.07, r ) );
  } else if ( h < 0.4 ) {
    g = echoLine( f.x, w, aa ) * step( abs( f.y ), 0.38 )
      + echoLine( f.y - 0.15, w, aa ) * step( abs( f.x ), 0.2 )
      + echoLine( f.y + 0.2, w, aa ) * step( abs( f.x ), 0.12 );
  } else if ( h < 0.58 ) {
    g = echoLine( r - 0.3, w, aa ) * step( 0.0, f.y ) + echoLine( f.y, w, aa ) * step( abs( f.x ), 0.3 );
  } else if ( h < 0.74 ) {
    g = echoLine( abs( f.x ) + abs( f.y ) - 0.32, w, aa ) + ( 1.0 - smoothstep( 0.04, 0.06, r ) );
  } else if ( h < 0.86 ) {
    g = echoLine( f.y - 0.25, w, aa ) * step( abs( f.x ), 0.35 )
      + echoLine( f.y + 0.25, w, aa ) * step( abs( f.x ), 0.35 )
      + echoLine( f.x, w, aa ) * step( abs( f.y ), 0.25 );
  }
  vec2 e = abs( fract( uv ) - 0.5 );
  float trace = echoLine( e.y - 0.5, 0.018, aa ) * step( 0.7, echoHash12( id + 3.1 ) )
              + echoLine( e.x - 0.5, 0.018, aa ) * step( 0.78, echoHash12( id + 8.7 ) );
  return clamp( g + trace * 0.6, 0.0, 1.0 );
}

/** Returns emitted radiance from the travelling wavefront, ripples and revealed glyphs. */
vec3 echoEmission( vec3 wp, vec3 wn, float glyphStrength, float rippleStrength, float frontStrength ) {
  vec3 em = vec3( 0.0 );
  float reveal = uEchoWorld;
  for ( int i = 0; i < ${ECHO_SLOTS}; i ++ ) {
    vec4 d = uEchoData[ i ];
    if ( d.y + d.z <= 0.001 ) continue;
    float dist = distance( wp, uEchoOrigin[ i ] );
    float x = dist - d.x;
    float front = exp( - x * x * 0.32 ) * d.y;
    float trail = ( 1.0 - step( 0.0, x ) ) * exp( x * 0.14 ) * d.y * 0.3;
    float inside = smoothstep( 1.5, - 2.5, x );
    reveal = max( reveal, inside * d.z );
    float ripple = pow( 1.0 - abs( fract( dist * 0.2 - uTime * 0.35 ) * 2.0 - 1.0 ), 14.0 ) * inside * d.z;
    em += ECHO_COLOR * ( ( front * 2.4 + trail ) * frontStrength + ripple * rippleStrength * 0.6 );
  }
  if ( reveal > 0.002 && glyphStrength > 0.0 ) {
    float g = echoGlyph( wp, wn );
    float flicker = 0.85 + 0.15 * sin( uTime * 7.0 + wp.x * 0.7 + wp.z * 0.3 );
    em += ECHO_COLOR * g * reveal * glyphStrength * 1.7 * flicker;
  }
  return em;
}
`

const WORLD_FRAG_PARS = /* glsl */ `
${ECHO_COMMON_GLSL}
varying vec3 vEchoWPos;
varying vec3 vEchoWNormal;
uniform sampler2D uNoiseTex;
uniform sampler2D uDetailNormal;
uniform vec3 uIndoorMin[ ${INDOOR_SLOTS} ];
uniform vec3 uIndoorMax[ ${INDOOR_SLOTS} ];
uniform vec3 uIndoorLightPos[ ${INDOOR_SLOTS} ];
uniform vec3 uIndoorLightCol[ ${INDOOR_SLOTS} ];
uniform float uGlyphStrength;
uniform float uRippleStrength;
uniform float uFrontStrength;
uniform float uBaseGlyph;
uniform float uDetailScale;
uniform float uDetailStrength;
uniform float uNormalStrength;

vec4 echoSampleNoise( vec3 p, vec3 n ) {
#ifdef ECHO_HQ
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  w /= ( w.x + w.y + w.z );
  return texture2D( uNoiseTex, p.zy ) * w.x + texture2D( uNoiseTex, p.xz ) * w.y + texture2D( uNoiseTex, p.xy ) * w.z;
#else
  vec3 an = abs( n );
  vec2 uv = an.y > max( an.x, an.z ) ? p.xz : ( an.x > an.z ? p.zy : p.xy );
  return texture2D( uNoiseTex, uv );
#endif
}

vec3 echoDetailNormal( vec3 p, vec3 n, float s ) {
  vec3 w = pow( abs( n ), vec3( 4.0 ) );
  w /= ( w.x + w.y + w.z );
  vec3 tx = texture2D( uDetailNormal, p.zy ).xyz * 2.0 - 1.0;
  vec3 ty = texture2D( uDetailNormal, p.xz ).xyz * 2.0 - 1.0;
  vec3 tz = texture2D( uDetailNormal, p.xy ).xyz * 2.0 - 1.0;
  tx.xy *= s; ty.xy *= s; tz.xy *= s;
  tx = vec3( tx.xy + n.zy, abs( tx.z ) * n.x );
  ty = vec3( ty.xy + n.xz, abs( ty.z ) * n.y );
  tz = vec3( tz.xy + n.xy, abs( tz.z ) * n.z );
  return normalize( tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z );
}

float echoIndoor( vec3 p ) {
  float m = 0.0;
  for ( int i = 0; i < ${INDOOR_SLOTS}; i ++ ) {
    vec3 a = step( uIndoorMin[ i ], p ) * step( p, uIndoorMax[ i ] );
    m = max( m, a.x * a.y * a.z );
  }
  return m;
}

const vec3 ROCK_DARK = ${glslVec3(lin('#2f2c35'))};
const vec3 ROCK_LIGHT = ${glslVec3(lin('#6b6070'))};
float echoRockMask = 0.0;
`

export interface WorldMaterialOptions {
  /** Glyph reveal strength when a pulse passes (ancient stone ≈ 1, terrain low). */
  glyph?: number
  /** Concentric ripple lines inside the pulse (terrain). */
  ripple?: number
  /** Brightness of the travelling wavefront band. */
  front?: number
  /** Always-on faint glyph glow (very old, still-active stone). */
  baseGlyph?: number
  /** World meters per detail-texture tile. */
  detailScale?: number
  /** Albedo variation from the noise texture (0 disables detail sampling). */
  detailStrength?: number
  /** Detail normal strength (0 disables). */
  normalStrength?: number
  /** Sand/rock slope blending with basalt strata. */
  terrain?: boolean
  /** Receives Undervault indoor darkening + fake local lights. */
  indoor?: boolean
}

const patched = new Set<THREE.Material>()
let hq = true
let detailNormals = true

/** Global quality switches for every world material; recompiles affected programs. */
export function setWorldMaterialQuality(opts: { hq: boolean; detailNormals: boolean }) {
  if (opts.hq === hq && opts.detailNormals === detailNormals) return
  hq = opts.hq
  detailNormals = opts.detailNormals
  for (const m of patched) m.needsUpdate = true
}

export function patchWorldMaterial<T extends THREE.MeshStandardMaterial>(mat: T, options: WorldMaterialOptions = {}): T {
  const o = {
    glyph: 0,
    ripple: 0,
    front: 1,
    baseGlyph: 0,
    detailScale: 4,
    detailStrength: 0.35,
    normalStrength: 0.6,
    terrain: false,
    indoor: true,
    ...options,
  }
  const local = {
    uGlyphStrength: { value: o.glyph },
    uRippleStrength: { value: o.ripple },
    uFrontStrength: { value: o.front },
    uBaseGlyph: { value: o.baseGlyph },
    uDetailScale: { value: 1 / o.detailScale },
    uDetailStrength: { value: o.detailStrength },
    uNormalStrength: { value: o.normalStrength },
  }
  mat.userData.echo = local
  patched.add(mat)

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globalUniforms, local)
    const defines = (shader.defines ??= {})
    if (hq) defines.ECHO_HQ = ''
    if (detailNormals && o.normalStrength > 0) defines.ECHO_DETAIL_NORMAL = ''
    if (o.terrain) defines.ECHO_TERRAIN = ''
    if (o.indoor) defines.ECHO_INDOOR = ''
    if (o.detailStrength > 0) defines.ECHO_DETAIL = ''
    if (o.baseGlyph > 0) defines.ECHO_BASE_GLYPH = ''

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEchoWPos;\nvarying vec3 vEchoWNormal;')
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vEchoWPos = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
        vEchoWNormal = normalize( transformedNormal * mat3( viewMatrix ) );`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_FRAG_PARS}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 echoWN = normalize( vEchoWNormal );
        #ifdef ECHO_DETAIL
        {
          vec4 nd = echoSampleNoise( vEchoWPos * uDetailScale, echoWN );
          vec4 nm = echoSampleNoise( vEchoWPos * uDetailScale * 0.16, echoWN );
          #ifdef ECHO_TERRAIN
            float slope = 1.0 - echoWN.y;
            echoRockMask = smoothstep( 0.2, 0.36, slope + ( nm.r - 0.5 ) * 0.2 );
            vec3 sand = diffuseColor.rgb * ( 0.8 + 0.4 * nd.g ) * ( 0.88 + 0.24 * nm.a );
            float rip = sin( vEchoWPos.x * 2.4 + vEchoWPos.z * 0.6 + nm.r * 7.0 ) * 0.5 + 0.5;
            sand *= 0.93 + 0.1 * rip * ( 1.0 - echoRockMask ) * smoothstep( 0.35, 0.85, nm.g );
            float strata = sin( vEchoWPos.y * 1.25 + nm.r * 5.0 ) * 0.5 + 0.5;
            vec3 rock = mix( ROCK_DARK, ROCK_LIGHT, strata * 0.55 + nd.b * 0.45 ) * ( 0.72 + 0.5 * nd.g );
            rock = mix( rock, rock * diffuseColor.rgb * 2.2, 0.35 );
            diffuseColor.rgb = mix( sand, rock, echoRockMask );
          #else
            float crack = mix( 1.0, 0.55 + 0.45 * nd.b, uDetailStrength );
            diffuseColor.rgb *= ( 1.0 - uDetailStrength * 0.5 + uDetailStrength * nd.r ) * crack * ( 0.9 + 0.2 * nm.a );
          #endif
        }
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        #ifdef ECHO_TERRAIN
          roughnessFactor = mix( 0.97, 0.8, echoRockMask );
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        #ifdef ECHO_DETAIL_NORMAL
        {
          vec3 dn = echoDetailNormal( vEchoWPos * uDetailScale, echoWN * faceDirection, uNormalStrength );
          normal = normalize( ( viewMatrix * vec4( dn, 0.0 ) ).xyz );
        }
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        if ( uEchoActive > 0.5 || uEchoWorld > 0.001 ) {
          totalEmissiveRadiance += echoEmission( vEchoWPos, echoWN, uGlyphStrength, uRippleStrength, uFrontStrength );
        }
        #ifdef ECHO_BASE_GLYPH
          totalEmissiveRadiance += ECHO_COLOR * echoGlyph( vEchoWPos, echoWN ) * uBaseGlyph * ( 0.75 + 0.25 * sin( uTime * 1.3 + vEchoWPos.y * 0.4 ) );
        #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
        #ifdef ECHO_INDOOR
        {
          float ind = echoIndoor( vEchoWPos );
          if ( ind > 0.0 ) {
            reflectedLight.directDiffuse *= 1.0 - ind;
            reflectedLight.directSpecular *= 1.0 - ind;
            reflectedLight.indirectDiffuse *= 0.1;
            reflectedLight.indirectSpecular *= 0.1;
            vec3 iwn = echoWN * faceDirection;
            for ( int i = 0; i < ${INDOOR_SLOTS}; i ++ ) {
              vec3 L = uIndoorLightPos[ i ] - vEchoWPos;
              float d2 = max( dot( L, L ), 0.01 );
              float ndl = max( dot( iwn, L * inversesqrt( d2 ) ), 0.0 ) * 0.85 + 0.15;
              reflectedLight.indirectDiffuse += uIndoorLightCol[ i ] * ndl / ( 1.0 + d2 * 0.025 ) * BRDF_Lambert( material.diffuseColor );
            }
          }
        }
        #endif`,
      )
  }
  mat.customProgramCacheKey = () =>
    `echo|${o.terrain ? 't' : ''}${o.indoor ? 'i' : ''}${o.detailStrength > 0 ? 'd' : ''}${o.baseGlyph > 0 ? 'g' : ''}|${hq ? 'hq' : 'lq'}|${detailNormals && o.normalStrength > 0 ? 'n' : ''}`
  mat.needsUpdate = true
  return mat
}

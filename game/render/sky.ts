/**
 * Analytic sky dome: twilight gradient matched to the fog horizon, sun disc + halo, a giant
 * ringed planet (banded, terminator, ring shadow), procedural stars and streaked clouds.
 */
import * as THREE from 'three'
import { PLANET_DIR } from '../world/layout'
import { ATMOSPHERE, FOG_GLSL, SUN_VEC, globalUniforms } from './shaderChunks'

const v3 = (c: THREE.Color | THREE.Vector3, s = 1) =>
  c instanceof THREE.Color
    ? `vec3(${(c.r * s).toFixed(5)}, ${(c.g * s).toFixed(5)}, ${(c.b * s).toFixed(5)})`
    : `vec3(${(c.x * s).toFixed(5)}, ${(c.y * s).toFixed(5)}, ${(c.z * s).toFixed(5)})`
const lin = (hex: string) => new THREE.Color(hex)

function planetFrame() {
  const v = new THREE.Vector3(...PLANET_DIR)
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(v, -v.y).normalize()
  const right = new THREE.Vector3().crossVectors(v, up).normalize()
  const tiltedUp = up.clone().multiplyScalar(Math.cos(0.45)).addScaledVector(right, Math.sin(0.45))
  const ringN = v.clone().multiplyScalar(0.36).addScaledVector(tiltedUp, 0.93).normalize()
  const e1 = new THREE.Vector3().crossVectors(ringN, new THREE.Vector3(0, 0, 1)).normalize()
  const e2 = new THREE.Vector3().crossVectors(ringN, e1).normalize()
  return { v, ringN, e1, e2 }
}

export class Sky {
  readonly mesh: THREE.Mesh
  readonly material: THREE.ShaderMaterial

  constructor(fogColor: THREE.Color, cloudOctaves: number) {
    const pf = planetFrame()
    this.material = new THREE.ShaderMaterial({
      name: 'sky',
      uniforms: {
        uTime: globalUniforms.uTime,
        uEchoWorld: globalUniforms.uEchoWorld,
        uNoiseTex: globalUniforms.uNoiseTex,
        uFogColor: { value: fogColor },
        uSunDir: { value: SUN_VEC.clone() },
        uPlanetDir: { value: pf.v },
        uRingN: { value: pf.ringN },
        uPlanetE1: { value: pf.e1 },
        uPlanetE2: { value: pf.e2 },
      },
      defines: { CLOUD_OCTAVES: cloudOctaves },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uEchoWorld;
        uniform sampler2D uNoiseTex;
        uniform vec3 uFogColor;
        uniform vec3 uSunDir;
        uniform vec3 uPlanetDir;
        uniform vec3 uRingN;
        uniform vec3 uPlanetE1;
        uniform vec3 uPlanetE2;
        varying vec3 vDir;
        ${FOG_GLSL}
        const vec3 ZENITH = ${v3(ATMOSPHERE.zenith)};
        const vec3 MID = ${v3(ATMOSPHERE.mid)};
        const vec3 SUN_GLOW = ${v3(ATMOSPHERE.sunGlow)};
        const vec3 SUN_DISK = ${v3(ATMOSPHERE.sunDisk)};
        const vec3 ECHO = ${v3(ATMOSPHERE.echo)};
        const vec3 PLANET_A = ${v3(lin('#cdbca2'))};
        const vec3 PLANET_B = ${v3(lin('#6f9196'))};
        const vec3 PLANET_C = ${v3(lin('#b2775a'))};
        const vec3 PLANET_ATMO = ${v3(lin('#86d6ff'))};
        const vec3 RING_COL = ${v3(lin('#d8c6aa'))};
        const float PR = 0.2;

        float hash13( vec3 p3 ) {
          p3 = fract( p3 * 0.1031 );
          p3 += dot( p3, p3.zyx + 31.32 );
          return fract( ( p3.x + p3.y ) * p3.z );
        }

        float ringDensity( float rr ) {
          float band = texture2D( uNoiseTex, vec2( rr * 0.37, 0.31 ) ).g;
          float fine = texture2D( uNoiseTex, vec2( rr * 1.9, 0.77 ) ).r;
          float a = smoothstep( 1.28, 1.36, rr ) * ( 1.0 - smoothstep( 2.2, 2.38, rr ) );
          a *= 1.0 - 0.85 * smoothstep( 0.02, 0.0, abs( rr - 1.78 ) - 0.035 );
          return a * ( 0.3 + 0.5 * band + 0.3 * fine );
        }

        void main() {
          vec3 rd = normalize( vDir );
          float h = rd.y;
          float sunAmt = max( dot( rd, uSunDir ), 0.0 );
          vec3 horizon = echoFogColor( uFogColor, rd );
          float t = clamp( h, 0.0, 1.0 );
          vec3 col = mix( horizon, MID, smoothstep( 0.0, 0.28, t ) );
          col = mix( col, ZENITH, smoothstep( 0.22, 0.9, t ) );
          col += SUN_GLOW * pow( sunAmt, 3.0 ) * ( 1.0 - smoothstep( 0.0, 0.55, t ) ) * 0.55;
          if ( h < 0.0 ) col = mix( horizon, uFogColor * 0.7, smoothstep( 0.0, - 0.25, h ) );

          // Clouds: stretched streaks lit from the sun side.
          float cloud = 0.0;
          if ( h > 0.0 ) {
            vec2 uv = rd.xz / ( h + 0.1 ) * 0.11 + vec2( uTime * 0.0025, uTime * 0.0009 );
            float n = 0.0;
            float amp = 0.55;
            vec2 q = uv * vec2( 1.0, 2.6 );
            for ( int i = 0; i < CLOUD_OCTAVES; i ++ ) {
              n += texture2D( uNoiseTex, q ).r * amp;
              q = q * 2.03 + vec2( 0.31, 0.17 );
              amp *= 0.5;
            }
            cloud = smoothstep( 0.5, 0.82, n ) * smoothstep( 0.015, 0.22, h ) * ( 1.0 - smoothstep( 0.6, 0.95, h ) );
            vec3 cloudCol = mix( MID * 1.3, SUN_GLOW * 0.9 + horizon * 0.4, pow( sunAmt, 2.0 ) );
            col = mix( col, cloudCol, cloud * 0.7 );
          }

          // Stars.
          float starVis = smoothstep( 0.04, 0.4, h ) * ( 1.0 - cloud ) * ( 1.0 - smoothstep( 0.5, 0.95, sunAmt ) );
          if ( starVis > 0.0 ) {
            vec3 sp = rd * 300.0;
            vec3 id = floor( sp );
            float hs = hash13( id );
            if ( hs > 0.9925 ) {
              vec3 f = fract( sp ) - 0.5;
              float tw = 0.65 + 0.35 * sin( uTime * ( 1.0 + hs * 3.0 ) + hs * 40.0 );
              float star = smoothstep( 0.16, 0.0, length( f ) ) * ( hs - 0.9925 ) * 160.0 * tw;
              col += vec3( 0.85, 0.9, 1.0 ) * star * starVis;
            }
          }

          // Ringed planet.
          vec3 c = uPlanetDir;
          float b = dot( rd, c );
          float disc = b * b - ( 1.0 - PR * PR );
          float tPlanet = 1e9;
          vec3 planetCol = vec3( 0.0 );
          float planetMask = 0.0;
          if ( disc > 0.0 ) {
            tPlanet = b - sqrt( disc );
            vec3 p = rd * tPlanet;
            vec3 pn = ( p - c ) / PR;
            float lat = dot( pn, uRingN );
            float lon = atan( dot( pn, uPlanetE2 ), dot( pn, uPlanetE1 ) );
            float turb = texture2D( uNoiseTex, vec2( lon * 0.32 + uTime * 0.0012, lat * 1.3 ) ).r;
            float bands = lat * 7.0 + turb * 0.9;
            vec3 base = mix( PLANET_A, PLANET_B, 0.5 + 0.5 * sin( bands * 3.1 ) );
            base = mix( base, PLANET_C, smoothstep( 0.55, 0.92, sin( bands * 1.7 + 1.3 ) * 0.5 + 0.5 ) * 0.6 );
            float ndl = dot( pn, uSunDir );
            float diff = smoothstep( - 0.1, 0.6, ndl );
            // Ring shadow cast onto the planet.
            float s = dot( c - p, uRingN ) / dot( uSunDir, uRingN );
            if ( s > 0.0 ) {
              vec3 qp = p + uSunDir * s - c;
              diff *= 1.0 - 0.7 * ringDensity( length( qp ) / PR );
            }
            planetCol = base * diff * 1.1;
            float rim = pow( 1.0 - clamp( dot( pn, - rd ), 0.0, 1.0 ), 2.5 );
            planetCol += PLANET_ATMO * rim * ( 0.12 + diff * 0.8 );
            planetMask = smoothstep( 0.0, 0.002, disc );
          }

          // Rings (composited in depth order with the planet).
          float denom = dot( rd, uRingN );
          float ringA = 0.0;
          vec3 ringCol = vec3( 0.0 );
          float tRing = abs( denom ) > 1e-4 ? dot( c, uRingN ) / denom : - 1.0;
          if ( tRing > 0.0 ) {
            vec3 rp = rd * tRing;
            float rr = length( rp - c ) / PR;
            ringA = ringDensity( rr );
            if ( ringA > 0.0 ) {
              vec3 oc = rp - c;
              float bb = dot( oc, uSunDir );
              float cc = dot( oc, oc ) - PR * PR;
              float shadow = ( bb < 0.0 && bb * bb - cc > 0.0 ) ? 0.15 : 1.0;
              float lit = 0.35 + 0.65 * abs( dot( uSunDir, uRingN ) );
              ringCol = RING_COL * lit * shadow * 0.95;
            }
          }
          vec3 sky = col;
          if ( tRing > 0.0 && tRing < tPlanet ) {
            col = mix( mix( col, planetCol, planetMask ), ringCol, ringA * 0.85 );
          } else {
            col = mix( mix( col, ringCol, ringA * 0.85 ), planetCol, planetMask );
          }
          col = mix( col, sky, 0.1 );

          // Sun disc + halo.
          float ang = acos( clamp( dot( rd, uSunDir ), - 1.0, 1.0 ) );
          float sunR = 0.033;
          float disk = 1.0 - smoothstep( sunR * 0.9, sunR, ang );
          float limb = sqrt( max( 0.0, 1.0 - ( ang / sunR ) * ( ang / sunR ) ) );
          col += SUN_DISK * ( 0.55 + 0.45 * limb ) * disk * 7.0 * ( 1.0 - cloud * 0.7 );
          col += SUN_GLOW * ( exp( - ang * 16.0 ) * 0.9 + exp( - ang * 4.0 ) * 0.18 );

          // Finale: aurora of remembered light.
          if ( uEchoWorld > 0.001 && h > 0.0 ) {
            vec2 au = rd.xz / ( h + 0.25 );
            float wave = texture2D( uNoiseTex, au * 0.09 + vec2( uTime * 0.01, 0.0 ) ).a;
            float curtain = smoothstep( 0.45, 0.75, wave ) * smoothstep( 0.05, 0.35, h ) * ( 1.0 - smoothstep( 0.55, 0.9, h ) );
            col += ECHO * curtain * uEchoWorld * 0.9;
          }

          gl_FragColor = vec4( col, 1.0 );
        }`,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      fog: false,
    })
    const geo = new THREE.SphereGeometry(1, 48, 24)
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.name = 'sky'
    this.mesh.scale.setScalar(1500)
    this.mesh.renderOrder = -100
    this.mesh.frustumCulled = false
  }

  setCloudOctaves(n: number) {
    if (this.material.defines.CLOUD_OCTAVES === n) return
    this.material.defines.CLOUD_OCTAVES = n
    this.material.needsUpdate = true
  }

  update(camPos: THREE.Vector3) {
    this.mesh.position.copy(camPos)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}

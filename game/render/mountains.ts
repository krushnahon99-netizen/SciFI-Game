/** Three parallax rings of distant mountain silhouettes that dissolve into the horizon haze. */
import * as THREE from 'three'
import { fbm2, ridged2 } from '../world/noise'
import { ATMOSPHERE, FOG_GLSL, SUN_VEC } from './shaderChunks'

const LAYERS = [
  { radius: 560, base: 95, amp: 120, color: '#2b2b3b', haze: 0.5, seed: 3.1, freq: 2.2 },
  { radius: 760, base: 120, amp: 170, color: '#363850', haze: 0.68, seed: 7.4, freq: 1.6 },
  { radius: 980, base: 150, amp: 230, color: '#45475f', haze: 0.82, seed: 11.9, freq: 1.1 },
]

export class Mountains {
  readonly group = new THREE.Group()
  private materials: THREE.ShaderMaterial[] = []

  constructor(fogColor: THREE.Color) {
    this.group.name = 'mountains'
    LAYERS.forEach((layer, li) => {
      const segs = 420
      const pos = new Float32Array((segs + 1) * 2 * 3)
      const hAttr = new Float32Array((segs + 1) * 2)
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2
        const cx = Math.cos(a)
        const cz = Math.sin(a)
        const nx = cx * layer.freq + layer.seed
        const nz = cz * layer.freq - layer.seed
        const profile = Math.max(0, fbm2(nx, nz, 4) * 0.6 + 0.45) * 0.55 + ridged2(nx * 1.7, nz * 1.7, 4) * 0.45
        const top = layer.base + profile * layer.amp
        const r = layer.radius
        pos.set([cx * r, top, cz * r], i * 6)
        pos.set([cx * r, -120, cz * r], i * 6 + 3)
        hAttr[i * 2] = 1
        hAttr[i * 2 + 1] = 0
      }
      const idx: number[] = []
      for (let i = 0; i < segs; i++) {
        const a = i * 2
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('aH', new THREE.BufferAttribute(hAttr, 1))
      geo.setIndex(idx)
      geo.computeBoundingSphere()

      const mat = new THREE.ShaderMaterial({
        name: `mountains-${li}`,
        uniforms: {
          uFogColor: { value: fogColor },
          uLayerColor: { value: new THREE.Color(layer.color) },
          uHaze: { value: layer.haze },
          uSunDir: { value: SUN_VEC.clone() },
        },
        vertexShader: /* glsl */ `
          attribute float aH;
          varying float vH;
          varying vec3 vWorld;
          void main() {
            vH = aH;
            vec4 wp = modelMatrix * vec4( position, 1.0 );
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uFogColor;
          uniform vec3 uLayerColor;
          uniform float uHaze;
          uniform vec3 uSunDir;
          varying float vH;
          varying vec3 vWorld;
          ${FOG_GLSL}
          const vec3 SUN_RIM = vec3(${ATMOSPHERE.sunGlow.r.toFixed(4)}, ${ATMOSPHERE.sunGlow.g.toFixed(4)}, ${ATMOSPHERE.sunGlow.b.toFixed(4)});
          void main() {
            vec3 rd = normalize( vWorld - cameraPosition );
            float sunAmt = max( dot( rd, uSunDir ), 0.0 );
            vec3 horizon = echoFogColor( uFogColor, rd );
            float hh = clamp( vH, 0.0, 1.0 );
            vec3 col = uLayerColor * ( 0.75 + 0.35 * hh );
            col += SUN_RIM * pow( sunAmt, 5.0 ) * 0.6 * smoothstep( 0.75, 1.0, hh );
            float haze = uHaze + ( 1.0 - uHaze ) * ( 1.0 - smoothstep( 0.0, 0.7, hh ) ) * 0.7;
            col = mix( col, horizon, clamp( haze, 0.0, 1.0 ) );
            gl_FragColor = vec4( col, 1.0 );
          }`,
        side: THREE.DoubleSide,
        fog: false,
      })
      this.materials.push(mat)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = -50 + li
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      this.group.add(mesh)
    })
  }

  dispose() {
    for (const m of this.group.children as THREE.Mesh[]) m.geometry.dispose()
    for (const m of this.materials) m.dispose()
  }
}

import * as THREE from 'three'
import { sharedUniforms } from '../render/shaderChunks'

const VERTEX = /* glsl */ `
varying vec3 vHoloWorld;
varying vec3 vHoloNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vHoloWorld = world.xyz;
  vHoloNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Additive fresnel + scanlines. Builds upward below uSweepY (bright edge at the line) and dissolves into noise as
// uReveal falls. Distance fade stands in for fog (additive surfaces must fade to nothing, not to the fog colour).
const FRAGMENT = /* glsl */ `
uniform float uEchoTime;
uniform sampler2D uEchoNoise;
uniform vec3 uColor;
uniform float uReveal;
uniform float uSweepY;
uniform float uIntensity;
varying vec3 vHoloWorld;
varying vec3 vHoloNormal;
void main() {
  vec3 toCamera = cameraPosition - vHoloWorld;
  float dist = length(toCamera);
  float facing = abs(dot(normalize(vHoloNormal), toCamera / dist));
  float fresnel = pow(1.0 - facing, 2.0);
  float noise = texture(uEchoNoise, vec2(vHoloWorld.x + vHoloWorld.z, vHoloWorld.y) * 0.11 + vec2(0.0, uEchoTime * 0.05)).r;
  float below = uSweepY - vHoloWorld.y + (noise - 0.5) * 0.8;
  float built = smoothstep(0.0, 0.2, below);
  float edge = exp(-below * below * 5.0);
  float solid = smoothstep(-0.08, 0.08, uReveal * 1.16 - 0.08 - noise);
  float lines = 0.5 + 0.5 * sin(vHoloWorld.y * 34.0 - uEchoTime * 3.0);
  float scan = mix(1.0, 0.55 + 0.45 * lines, 1.0 - smoothstep(0.2, 0.6, fwidth(vHoloWorld.y * 5.4)));
  float flicker = 0.92 + 0.08 * sin(uEchoTime * 21.0 + vHoloWorld.y * 1.7);
  float glow = ((0.12 + 0.88 * fresnel) * scan * built + edge * 1.6) * solid * flicker * uIntensity;
  gl_FragColor = vec4(uColor * glow * exp(-dist * 0.005), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Memory hologram used by ghosts and past-state overlays. Drive `uReveal` (0…1) and `uSweepY` (world y). */
export function createHologramMaterial(color: THREE.ColorRepresentation = '#8fdcff', intensity = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'echo.hologram',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uEchoTime: sharedUniforms.uEchoTime,
      uEchoNoise: sharedUniforms.uEchoNoise,
      uColor: { value: new THREE.Color(color) },
      uReveal: { value: 0 },
      uSweepY: { value: 1e4 },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

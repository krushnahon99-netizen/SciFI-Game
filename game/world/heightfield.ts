/**
 * Analytic terrain height function + the sampled HeightField shared by the terrain mesh,
 * physics, camera collision and scattering. Pure TypeScript (no three.js).
 *
 * The mesh and physics agree exactly: heightAt() interpolates over the same two triangles per
 * cell that terrain.ts emits (diagonal from (i+1, j) to (i, j+1)).
 */
import { clamp, fbm2, lerp, noise2, ridged2, smoothstep } from './noise'
import {
  BRIDGE,
  CAUSEWAY,
  CHASM,
  CLIFFS,
  CRADLE,
  CRATER,
  GARDEN,
  GIANT,
  MONOLITH,
  PASS,
  RIDGE,
  SPIRE,
  VALE,
  VAULT,
  WORKS,
  WORLD,
} from './layout'

/** Rolling dunes and broad undulation — the landscape before any authored features. */
export function baseHeight(x: number, z: number): number {
  const wx = x + noise2(x * 0.0041 + 11.3, z * 0.0041 - 3.1) * 38
  const wz = z + noise2(x * 0.0041 - 7.7, z * 0.0041 + 5.9) * 38
  let h = fbm2(wx * 0.0042, wz * 0.0042, 4) * 7.5
  // Asymmetric wind dunes: long windward slope, short slip face. Crests run roughly north–south.
  const dn = noise2(wx * 0.009 + 3.3, wz * 0.009 + 1.7)
  const phase = (wx * 0.038 + dn * 2.4) / (Math.PI * 2)
  const f = phase - Math.floor(phase)
  const p = f < 0.78 ? f / 0.78 : (1 - f) / 0.22
  const dune = p * p * (3 - 2 * p)
  const duneAmp = 2.4 * (0.3 + 0.7 * smoothstep(-0.3, 0.6, noise2(wx * 0.005 + 40, wz * 0.005 - 20)))
  h += dune * duneAmp
  h += fbm2(x * 0.045, z * 0.045, 3) * 0.7
  return h
}

/** Regional basins, bowls and mounds layered on top of the base landscape. */
function regional(x: number, z: number, h: number): number {
  const dCr = Math.hypot(x - CRADLE.x, z - CRADLE.z)
  h -= 4.5 * (1 - smoothstep(0, CRADLE.r, dCr))

  const dV = Math.hypot(x - VALE.x, (z - VALE.z) * 1.15) + noise2(x * 0.02, z * 0.02) * 8
  h -= VALE.depth * (1 - smoothstep(VALE.r * 0.2, VALE.r, dV))

  const dG = Math.hypot(x - GARDEN.x, z - GARDEN.z)
  h += GARDEN.height * (1 - smoothstep(GARDEN.r * 0.7, GARDEN.r * 1.9, dG))

  const dK = Math.hypot(x - CRATER.x, z - CRATER.z)
  h -= CRATER.depth * (1 - smoothstep(0, CRATER.r, dK))
  h += 2.5 * Math.exp(-(((dK - CRATER.r) / 7) ** 2))

  const dS = Math.hypot(x - GIANT.x, z - GIANT.z)
  h += 3.2 * (1 - smoothstep(4, GIANT.r * 1.8, dS))
  return h
}

const regionalAt = (x: number, z: number) => regional(x, z, baseHeight(x, z))

/** Heights of authored flat areas, derived from the natural terrain so they sit believably. */
export const FLAT = {
  monolith: regionalAt(MONOLITH.x, MONOLITH.z),
  works: regionalAt(WORKS.x, WORKS.z),
  pass:
    (regionalAt(PASS.x, RIDGE.z + RIDGE.halfWidth + 6) + regionalAt(PASS.x, RIDGE.z - RIDGE.halfWidth - 6)) * 0.5,
  bridge: (regionalAt(BRIDGE.southPad.x, BRIDGE.southPad.z) + regionalAt(BRIDGE.northPad.x, BRIDGE.northPad.z)) * 0.5,
  causewayStart: regionalAt(CAUSEWAY.ax, CAUSEWAY.az),
}

/** Absolute heights for the sunken vault (relative depths are in layout.ts). */
export const VAULT_H = {
  floor: FLAT.works - VAULT.floorDepth,
  ceiling: FLAT.works - VAULT.ceilingDepth,
  roofTop: FLAT.works + 0.15,
}

function roundedRectSDF(px: number, pz: number, hx: number, hz: number, r: number): number {
  const qx = Math.abs(px) - hx + r
  const qz = Math.abs(pz) - hz + r
  const ox = Math.max(qx, 0)
  const oz = Math.max(qz, 0)
  return Math.hypot(ox, oz) + Math.min(Math.max(qx, qz), 0) - r
}

const flattenTo = (h: number, target: number, mask: number) => h + (target - h) * mask

/** Final terrain height at a world position (meters). */
export function terrainHeight(x: number, z: number): number {
  let h = regional(x, z, baseHeight(x, z))

  // --- Authored flat areas ---------------------------------------------------------------
  const dMo = Math.hypot(x - MONOLITH.x, z - MONOLITH.z)
  h = flattenTo(h, FLAT.monolith, 1 - smoothstep(MONOLITH.daisR, MONOLITH.daisR + 12, dMo))

  const sdW = roundedRectSDF(x - WORKS.x, z - WORKS.z, WORKS.hx, WORKS.hz, WORKS.corner)
  if (sdW < WORKS.blend) {
    h = flattenTo(h, FLAT.works + noise2(x * 0.11, z * 0.11) * 0.12, 1 - smoothstep(0, WORKS.blend, sdW))
  }

  for (const pad of [BRIDGE.southPad, BRIDGE.northPad]) {
    const d = Math.hypot(x - pad.x, z - pad.z)
    h = flattenTo(h, FLAT.bridge, 1 - smoothstep(BRIDGE.padR, BRIDGE.padR + 10, d))
  }

  // --- The ridge and the Hall of Echoes pass ------------------------------------------------
  const passDX = Math.abs(x - PASS.x)
  const ridgeDZ = Math.abs(z - RIDGE.z)
  const passFloor =
    (1 - smoothstep(PASS.floorHalf - 1, PASS.floorHalf + 1.5, passDX)) *
    (1 - smoothstep(RIDGE.halfWidth + 2, RIDGE.halfWidth + 12, ridgeDZ))
  if (passFloor > 0) h = flattenTo(h, FLAT.pass, passFloor)

  const wobble = noise2(x * 0.012, 3.7) * 5 * smoothstep(20, 45, passDX)
  const dz = Math.abs(z - RIDGE.z + wobble)
  const ridgeMask = smoothstep(RIDGE.halfWidth, RIDGE.crestHalf, dz)
  if (ridgeMask > 0) {
    const crest = RIDGE.height + ridged2(x * 0.018, z * 0.018) * 12
    const passMask = smoothstep(PASS.floorHalf, PASS.edge, passDX)
    h += crest * ridgeMask * passMask
  }

  // --- The chasm ------------------------------------------------------------------------------
  const bridgeDX = Math.abs(x - BRIDGE.x)
  const awayFromBridge = smoothstep(10, 30, bridgeDX)
  const chasmWobble = noise2(x * 0.025, 9.1) * 3.5 * awayFromBridge
  const hw = CHASM.halfWidth + noise2(x * 0.06, 2.2) * 1.2 * awayFromBridge
  const cdz = Math.abs(z - CHASM.z + chasmWobble)
  const chasmMask = smoothstep(hw + CHASM.edge, hw, cdz)
  if (chasmMask > 0) h = lerp(h, CHASM.floor + noise2(x * 0.05, z * 0.05) * 3, chasmMask)

  // --- Spire mesa + causeway -----------------------------------------------------------------
  const dSp = Math.hypot(x - SPIRE.x, z - SPIRE.z) + noise2(x * 0.05, z * 0.05) * 2.5
  const mesaMask = smoothstep(SPIRE.topR + 10, SPIRE.topR + 1, dSp)
  if (mesaMask > 0) h = lerp(h, SPIRE.top + noise2(x * 0.08, z * 0.08) * 0.25, mesaMask)

  const abx = CAUSEWAY.bx - CAUSEWAY.ax
  const abz = CAUSEWAY.bz - CAUSEWAY.az
  const t = ((x - CAUSEWAY.ax) * abx + (z - CAUSEWAY.az) * abz) / (abx * abx + abz * abz)
  if (t > -0.08 && t < 1.2) {
    const tc = clamp(t, 0, 1.06)
    const px = CAUSEWAY.ax + abx * tc
    const pz = CAUSEWAY.az + abz * tc
    const dPerp = Math.hypot(x - px, z - pz)
    const side = smoothstep(CAUSEWAY.halfW + 3.5, CAUSEWAY.halfW, dPerp) * smoothstep(-0.06, 0, t)
    if (side > 0) {
      const hc = lerp(FLAT.causewayStart, SPIRE.top, clamp(t, 0, 1))
      if (hc > h) h = lerp(h, hc, side)
    }
  }

  // --- Outer cliffs ---------------------------------------------------------------------------
  const r = Math.hypot(x, z)
  if (r > CLIFFS.start - 14) {
    const ang = Math.atan2(z, x)
    const rw = r + noise2(Math.cos(ang) * 3 + 7, Math.sin(ang) * 3 + 7) * 12
    const cliffMask = smoothstep(CLIFFS.start, CLIFFS.end, rw)
    if (cliffMask > 0) h += cliffMask * (CLIFFS.height + ridged2(x * 0.007, z * 0.007) * 50 * cliffMask)
  }

  // --- Undervault carve (hidden under a flush stone roof) ------------------------------------
  const vdx = Math.abs(x - VAULT.x)
  if (vdx <= VAULT.corridorHalfW + 1.2 && z <= VAULT.corridorZ0 && z >= VAULT.corridorZ1 - 1) {
    const k = clamp((VAULT.corridorZ0 - z) / (VAULT.corridorZ0 - VAULT.corridorZ1), 0, 1)
    h = lerp(FLAT.works, VAULT_H.floor, k)
  }
  if (vdx <= VAULT.chamberHX + 1.2 && Math.abs(z - VAULT.chamberZ) <= VAULT.chamberHZ + 1.2) {
    h = VAULT_H.floor
  }

  return h
}

/** Region weights used for terrain vertex colouring. All values in [0, 1]. */
export function regionWeights(x: number, z: number) {
  const vale = 1 - smoothstep(VALE.r * 0.35, VALE.r * 1.05, Math.hypot(x - VALE.x, (z - VALE.z) * 1.15))
  const crater = 1 - smoothstep(CRATER.r * 0.5, CRATER.r * 1.2, Math.hypot(x - CRATER.x, z - CRATER.z))
  const garden = 1 - smoothstep(GARDEN.r * 0.6, GARDEN.r * 1.4, Math.hypot(x - GARDEN.x, z - GARDEN.z))
  const works =
    1 - smoothstep(-6, WORKS.blend, roundedRectSDF(x - WORKS.x, z - WORKS.z, WORKS.hx, WORKS.hz, WORKS.corner))
  const north = smoothstep(-40, -90, z)
  const spire = 1 - smoothstep(SPIRE.topR, SPIRE.topR + 30, Math.hypot(x - SPIRE.x, z - SPIRE.z))
  const r = Math.hypot(x, z)
  const cliff = smoothstep(CLIFFS.start - 10, CLIFFS.end, r)
  const cradle = 1 - smoothstep(CRADLE.r * 0.3, CRADLE.r * 1.3, Math.hypot(x - CRADLE.x, z - CRADLE.z))
  return { vale, crater, garden, works, north, spire, cliff, cradle }
}

/**
 * Sampled terrain at WORLD.cell resolution. heightAt() is triangle-exact with the mesh;
 * gradientAt() is bilinear (smooth) for slope classification.
 */
export class HeightField {
  readonly res = WORLD.res
  readonly cell = WORLD.cell
  readonly origin = -WORLD.half
  readonly data: Float32Array

  constructor(data?: Float32Array) {
    if (data) {
      this.data = data
      return
    }
    const { res, cell, origin } = this
    this.data = new Float32Array(res * res)
    for (let j = 0; j < res; j++) {
      const z = origin + j * cell
      for (let i = 0; i < res; i++) this.data[j * res + i] = terrainHeight(origin + i * cell, z)
    }
  }

  /** Raw grid sample with edge clamping. */
  at(i: number, j: number): number {
    const r = this.res - 1
    i = i < 0 ? 0 : i > r ? r : i
    j = j < 0 ? 0 : j > r ? r : j
    return this.data[j * this.res + i]
  }

  heightAt(x: number, z: number): number {
    const gx = (x - this.origin) / this.cell
    const gz = (z - this.origin) / this.cell
    const max = this.res - 1.0001
    const cx = gx < 0 ? 0 : gx > max ? max : gx
    const cz = gz < 0 ? 0 : gz > max ? max : gz
    const i = Math.floor(cx)
    const j = Math.floor(cz)
    const u = cx - i
    const v = cz - j
    const ha = this.at(i, j)
    const hb = this.at(i + 1, j)
    const hc = this.at(i, j + 1)
    if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v
    const hd = this.at(i + 1, j + 1)
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v)
  }

  /** Smooth (bilinear) height gradient. Writes [dh/dx, dh/dz] into `out`. */
  gradientAt(x: number, z: number, out: { x: number; z: number }) {
    const gx = (x - this.origin) / this.cell
    const gz = (z - this.origin) / this.cell
    const i = Math.floor(gx)
    const j = Math.floor(gz)
    const u = gx - i
    const v = gz - j
    const ha = this.at(i, j)
    const hb = this.at(i + 1, j)
    const hc = this.at(i, j + 1)
    const hd = this.at(i + 1, j + 1)
    out.x = ((hb - ha) * (1 - v) + (hd - hc) * v) / this.cell
    out.z = ((hc - ha) * (1 - u) + (hd - hb) * u) / this.cell
    return out
  }

  /** Grid-space normal via central differences (used for mesh vertex normals). */
  gridNormal(i: number, j: number, out: [number, number, number]) {
    const dx = (this.at(i + 1, j) - this.at(i - 1, j)) / (2 * this.cell)
    const dz = (this.at(i, j + 1) - this.at(i, j - 1)) / (2 * this.cell)
    const l = Math.hypot(dx, 1, dz)
    out[0] = -dx / l
    out[1] = 1 / l
    out[2] = -dz / l
    return out
  }
}

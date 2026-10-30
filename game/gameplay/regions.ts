import type { Emitter, GameEvents } from '../core/events'
import { uiStore } from '../ui/store'
import { REGION_AREAS, type RegionShape } from '../world/layout'
import type { RegionId } from './ids'

/** Once inside a region, the player has to get this far past its edge before another region can take over. */
const EXIT_MARGIN = 4

function shapeContains(shape: RegionShape, x: number, z: number, margin: number): boolean {
  if (shape.kind === 'circle') {
    const r = shape.radius + margin
    const dx = x - shape.x
    const dz = z - shape.z
    return dx * dx + dz * dz <= r * r
  }
  if (shape.kind === 'box') {
    return Math.abs(x - shape.x) <= shape.halfX + margin && Math.abs(z - shape.z) <= shape.halfZ + margin
  }
  const reach = shape.halfWidth + margin
  return !shape.line.outside(x, z, reach) && shape.line.distance(x, z) <= reach
}

/**
 * Area discovery. The player is in the first area of `REGION_AREAS` (priority order) that contains them; the current
 * region's area is widened by EXIT_MARGIN so standing on a border can't flicker. Outside every area the last region
 * stays current. A change sets `uiStore.region` (HUD title) and emits `regionEnter` (progression checkpoint).
 */
export class RegionTracker {
  current: RegionId | null = null

  constructor(private readonly events: Emitter<GameEvents>) {}

  update(position: { x: number; z: number }) {
    const next = this.resolve(position.x, position.z)
    if (next === null || next === this.current) return
    this.current = next
    uiStore.setState({ region: next })
    this.events.emit('regionEnter', { id: next })
  }

  private resolve(x: number, z: number): RegionId | null {
    for (const area of REGION_AREAS) {
      if (shapeContains(area.shape, x, z, area.id === this.current ? EXIT_MARGIN : 0)) return area.id
    }
    return null
  }
}

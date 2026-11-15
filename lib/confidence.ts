import { demandArrival, isNoGo, movementRisk, routeById, weatherBand } from "@/lib/risk"
import type { Plan, Roe, World } from "@/lib/types"

function round2(value: number): number {
  return Math.round(Math.min(0.97, Math.max(0.05, value)) * 100) / 100
}

/** Deterministic confidence. Does not trust a model's self-score. */
export function assessConfidence(plan: Plan, world: World, roe: Roe): number {
  if (plan.movements.length === 0) return 0.15
  const served = world.demands.filter((demand) => {
    const arrival = demandArrival(plan.movements, demand)
    return arrival !== null && arrival <= demand.latestMinute
  }).length
  const coverage = world.demands.length === 0 ? 1 : served / world.demands.length
  let worst = 0
  let penalty = 0
  for (const movement of plan.movements) {
    const route = routeById(world, movement.routeId)
    if (!route) {
      penalty += 0.2
      continue
    }
    const comms = world.comms[movement.to] ?? "up"
    worst = Math.max(worst, movementRisk(route, comms))
    if (isNoGo(route, roe)) penalty += 0.25
    if (world.routeStatus[route.id] === "closed") penalty += 0.2
    const band = weatherBand(route, world.weather, roe)
    if (band === "abort") penalty += 0.2
    if (band === "advisory") penalty += 0.08
    if (comms === "degraded") penalty += 0.05
    if (comms === "lost") penalty += 0.12
  }
  const margin = Math.max(0, roe.maxRisk - worst) / Math.max(1, roe.maxRisk)
  return round2(0.42 + 0.4 * coverage + 0.18 * margin - penalty)
}

export function stampConfidence(plan: Plan, world: World, roe: Roe): Plan {
  const reported = plan.reportedConfidence ?? plan.confidence
  return {
    ...plan,
    reportedConfidence: reported,
    confidence: assessConfidence({ ...plan, reportedConfidence: reported }, world, roe),
  }
}

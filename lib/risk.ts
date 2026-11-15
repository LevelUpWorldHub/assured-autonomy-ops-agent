import type { CommsState, Demand, Roe, RouteLeg, WeatherState, World } from "@/lib/types"

export const RISK_HARD_MARGIN = 12
export const WEATHER_EXPOSURE_FLOOR = 0.5

export function routeById(world: World, id: string): RouteLeg | undefined {
  return world.routes.find((route) => route.id === id)
}

export function movementRisk(route: RouteLeg, destComms: CommsState): number {
  let risk = route.baseRisk
  if (destComms === "degraded") risk += 8
  if (destComms === "lost") risk += 22
  return Math.min(100, risk)
}

export type WeatherBand = "ok" | "advisory" | "abort"

export function weatherBand(route: RouteLeg, weather: WeatherState, roe: Roe): WeatherBand {
  if (route.weatherExposure < WEATHER_EXPOSURE_FLOOR) return "ok"
  const abort = weather.windKt >= roe.weatherAbortWindKt || weather.precipMm >= roe.weatherAbortPrecipMm
  if (abort) return "abort"
  const advisory = weather.windKt >= roe.weatherAdvisoryWindKt || weather.precipMm >= roe.weatherAdvisoryPrecipMm
  return advisory ? "advisory" : "ok"
}

export function isNoGo(route: RouteLeg, roe: Roe): boolean {
  return route.noGo || roe.noGoRouteIds.includes(route.id)
}

export function demandArrival(movements: { to: string; cargo: string; qty: number; arriveMinute: number }[], demand: Demand): number | null {
  const legs = movements.filter((movement) => movement.to === demand.nodeId && movement.cargo === demand.cargo)
  const qty = legs.reduce((sum, movement) => sum + movement.qty, 0)
  if (qty < demand.qty) return null
  return Math.max(...legs.map((movement) => movement.arriveMinute))
}

import { stampConfidence } from "@/lib/confidence"
import { cargoShort } from "@/lib/format"
import { isNoGo, movementRisk, weatherBand } from "@/lib/risk"
import { siteName } from "@/lib/theater"
import type { Convoy, Demand, InventoryLot, Movement, Plan, Roe, RouteLeg, World } from "@/lib/types"

interface PathChoice {
  routes: RouteLeg[]
  risk: number
  minutes: number
}

function legalRoutes(world: World, roe: Roe): RouteLeg[] {
  return world.routes.filter((route) => {
    if (isNoGo(route, roe)) return false
    if ((world.routeStatus[route.id] ?? "open") === "closed") return false
    if (weatherBand(route, world.weather, roe) === "abort") return false
    return true
  })
}

function enumerate(from: string, to: string, routes: RouteLeg[]): RouteLeg[][] {
  const found: RouteLeg[][] = []
  const walk = (node: string, path: RouteLeg[], seen: Set<string>) => {
    if (path.length > 3) return
    if (node === to && path.length > 0) {
      found.push([...path])
      return
    }
    for (const route of routes) {
      if (route.from !== node || seen.has(route.to)) continue
      seen.add(route.to)
      path.push(route)
      walk(route.to, path, seen)
      path.pop()
      seen.delete(route.to)
    }
  }
  walk(from, [], new Set([from]))
  return found
}

function scorePath(path: RouteLeg[], world: World): PathChoice {
  let risk = 0
  let minutes = 0
  for (const route of path) {
    const comms = world.comms[route.to] ?? "up"
    risk = Math.max(risk, movementRisk(route, comms))
    minutes += route.minutes
  }
  return { routes: path, risk, minutes }
}

function better(a: PathChoice, b: PathChoice): PathChoice {
  if (a.risk !== b.risk) return a.risk < b.risk ? a : b
  if (a.minutes !== b.minutes) return a.minutes < b.minutes ? a : b
  return a.routes.length <= b.routes.length ? a : b
}

function availableQty(stock: InventoryLot[], nodeId: string, cargo: Demand["cargo"]): { onHand: number; reserve: number } {
  const lot = stock.find((item) => item.nodeId === nodeId && item.cargo === cargo)
  return { onHand: lot?.onHand ?? 0, reserve: lot?.reserve ?? 0 }
}

function pickConvoy(convoys: Convoy[], origin: string, qty: number, depart: number): Convoy | undefined {
  return convoys
    .filter((convoy) => convoy.location === origin && convoy.capacity >= qty && convoy.availableMinute <= depart)
    .sort((a, b) => a.id.localeCompare(b.id))[0]
}

function drawStock(stock: InventoryLot[], nodeId: string, cargo: Demand["cargo"], qty: number) {
  const lot = stock.find((item) => item.nodeId === nodeId && item.cargo === cargo)
  if (lot) lot.onHand -= qty
}

export function deterministicPlan(world: World, roe: Roe): Plan {
  const routes = legalRoutes(world, roe)
  const stock = world.inventory.map((lot) => ({ ...lot }))
  const convoys = world.convoys.map((convoy) => ({ ...convoy }))
  const demands = [...world.demands].sort((a, b) => a.priority - b.priority || a.latestMinute - b.latestMinute)
  const movements: Movement[] = []
  const uncovered: string[] = []
  let serial = 1

  for (const demand of demands) {
    const origins = world.nodes
      .map((node) => node.id)
      .filter((nodeId) => {
        const stockAt = availableQty(stock, nodeId, demand.cargo)
        return stockAt.onHand - demand.qty >= stockAt.reserve
      })
    let best: (PathChoice & { origin: string }) | null = null
    for (const origin of origins) {
      if (origin === demand.nodeId) continue
      for (const path of enumerate(origin, demand.nodeId, routes)) {
        const scored = scorePath(path, world)
        const choice = { ...scored, origin }
        best = best ? better(best, choice) === choice ? choice : best : choice
      }
    }
    if (!best) {
      uncovered.push(demand.label)
      continue
    }
    const departBase = world.exerciseMinute + 8
    const convoy = pickConvoy(convoys, best.origin, demand.qty, departBase)
    if (!convoy) {
      uncovered.push(`${demand.label} (no package free at the origin)`)
      continue
    }
    let minute = Math.max(departBase, convoy.availableMinute)
    let cursor = best.origin
    for (const route of best.routes) {
      const arrive = minute + route.minutes
      movements.push({
        id: `m-${serial}`,
        convoyId: convoy.id,
        from: cursor,
        to: route.to,
        routeId: route.id,
        cargo: demand.cargo,
        qty: demand.qty,
        departMinute: minute,
        arriveMinute: arrive,
      })
      serial += 1
      minute = arrive
      cursor = route.to
    }
    drawStock(stock, best.origin, demand.cargo, demand.qty)
    convoy.location = demand.nodeId
    convoy.availableMinute = minute
  }

  const served = demands.length - uncovered.length
  const routeNames = [...new Set(movements.map((movement) => world.routes.find((route) => route.id === movement.routeId)?.name ?? movement.routeId))]
  const legs = movements
    .map((movement) => `${convoyName(world, movement.convoyId)} ${cargoShort(movement.cargo)} ${siteName(world, movement.from)} to ${siteName(world, movement.to)}`)
    .join("; ")
  const rationale = uncovered.length
    ? `Deterministic planner covered ${served} of ${demands.length} demands on ${routeNames.join(", ") || "no route"}. Uncovered: ${uncovered.join("; ")}. Closed routes, no-go routes, and weather-abort legs were not used.`
    : `Deterministic planner covered ${served} of ${demands.length} demands. ${legs}. Closed routes, no-go routes, and weather-abort legs were removed before scoring.`

  const draft: Plan = {
    id: `plan-det-t${world.exerciseMinute}`,
    source: "deterministic",
    reportedConfidence: 0,
    confidence: 0,
    rationale,
    assumptions: [
      "Hard constraints are filtered before a route can be chosen.",
      "Weather advisories and degraded communications are left for the validator.",
      "This planner does not call a model.",
    ],
    movements,
  }
  const stamped = stampConfidence(draft, world, roe)
  return { ...stamped, reportedConfidence: stamped.confidence }
}

function convoyName(world: World, id: string): string {
  return world.convoys.find((convoy) => convoy.id === id)?.name ?? id
}

export function unconstrainedShortcut(world: World): Plan {
  const depart = world.exerciseMinute + 8
  return {
    id: "plan-unconstrained-shortcut",
    source: "scripted",
    reportedConfidence: 0.91,
    confidence: 0.91,
    rationale:
      "Shortest path back to the Class I window is Corridor Red, then Spur North. The status feed still lists Corridor Red as open. Speed is preferred over the published no-go.",
    assumptions: [
      "A confident shortest path is not the same thing as permission to move.",
      "Corridor Red is treated as available because the route-status feed has not closed it.",
    ],
    movements: [
      {
        id: "m-short-1",
        convoyId: "alpha",
        from: "davis",
        to: "ridge",
        routeId: "corridor-red",
        cargo: "I",
        qty: 8,
        departMinute: depart,
        arriveMinute: depart + 40,
      },
      {
        id: "m-short-2",
        convoyId: "alpha",
        from: "ridge",
        to: "north",
        routeId: "spur-north",
        cargo: "I",
        qty: 8,
        departMinute: depart + 40,
        arriveMinute: depart + 75,
      },
      {
        id: "m-short-3",
        convoyId: "bravo",
        from: "davis",
        to: "harbor",
        routeId: "msr-coast",
        cargo: "III",
        qty: 6,
        departMinute: depart,
        arriveMinute: depart + 50,
      },
    ],
  }
}

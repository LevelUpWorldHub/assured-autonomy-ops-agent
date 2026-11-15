import { assessConfidence } from "@/lib/confidence"
import { cargoLabel } from "@/lib/format"
import { RISK_HARD_MARGIN, demandArrival, isNoGo, movementRisk, routeById, weatherBand } from "@/lib/risk"
import type { Check, CheckStatus, Movement, Plan, Roe, ValidationReport, World } from "@/lib/types"

function check(code: string, title: string, status: CheckStatus, detail: string): Check {
  return { code, title, status, detail }
}

function consumesStock(movement: Movement, prior: Movement[]): boolean {
  return !prior.some(
    (earlier) =>
      earlier.convoyId === movement.convoyId &&
      earlier.cargo === movement.cargo &&
      earlier.to === movement.from &&
      earlier.qty >= movement.qty &&
      earlier.arriveMinute <= movement.departMinute,
  )
}

export function validate(plan: Plan, world: World, roe: Roe): ValidationReport {
  const graph: string[] = []
  const noGo: string[] = []
  const closed: string[] = []
  const capacity: string[] = []
  const reserve: string[] = []
  const cargo: string[] = []
  const weatherAbort: string[] = []
  const weatherAdvisory: string[] = []
  const riskHard: string[] = []
  const riskSoft: string[] = []
  const commsLost: string[] = []
  const commsDegraded: string[] = []
  const deadlines: string[] = []
  const gaps: string[] = []

  const ordered = [...plan.movements].sort((a, b) => a.departMinute - b.departMinute || a.id.localeCompare(b.id))
  const stock = world.inventory.map((lot) => ({ ...lot }))

  ordered.forEach((movement, index) => {
    const route = routeById(world, movement.routeId)
    const from = world.nodes.some((node) => node.id === movement.from)
    const to = world.nodes.some((node) => node.id === movement.to)
    if (!route || !from || !to || route.from !== movement.from || route.to !== movement.to) {
      graph.push(`${movement.id} is not a real leg on the exercise map.`)
      return
    }
    if (isNoGo(route, roe)) noGo.push(`${route.name} is a no-go route.`)
    const status = world.routeStatus[route.id] ?? "open"
    if (status === "closed") closed.push(`${route.name} is closed in the route feed.`)

    const convoy = world.convoys.find((item) => item.id === movement.convoyId)
    if (!convoy) {
      capacity.push(`${movement.id} names an unknown package.`)
    } else if (movement.qty > convoy.capacity) {
      capacity.push(`${convoy.name} capacity is ${convoy.capacity}; this leg loads ${movement.qty}.`)
    }

    const band = weatherBand(route, world.weather, roe)
    if (band === "abort") weatherAbort.push(`${route.name} is past the weather abort (${world.weather.windKt} kt, ${world.weather.precipMm} mm).`)
    if (band === "advisory") weatherAdvisory.push(`${route.name} is inside a weather advisory (${world.weather.windKt} kt, ${world.weather.precipMm} mm).`)

    const comms = world.comms[movement.to] ?? "up"
    const risk = movementRisk(route, comms)
    if (risk > roe.maxRisk + RISK_HARD_MARGIN) riskHard.push(`${route.name} risk ${risk} is past the hard ceiling ${roe.maxRisk + RISK_HARD_MARGIN}.`)
    else if (risk > roe.maxRisk) riskSoft.push(`${route.name} risk ${risk} is above the commander ceiling ${roe.maxRisk}.`)

    if (comms === "lost" && roe.commsLossPolicy !== "continue-last-approved") {
      commsLost.push(`Communications at ${movement.to} are lost. Policy is ${roe.commsLossPolicy}.`)
    } else if (comms === "degraded") {
      commsDegraded.push(`Communications at ${movement.to} are degraded.`)
    }

    if (route.civilian && movement.cargo === "V" && !roe.allowClassVOnCivilian) {
      cargo.push(`${cargoLabel("V")} is not allowed on civilian route ${route.name}.`)
    }

    if (consumesStock(movement, ordered.slice(0, index))) {
      const lot = stock.find((item) => item.nodeId === movement.from && item.cargo === movement.cargo)
      if (!lot) {
        reserve.push(`No ${movement.cargo} stock at ${movement.from}.`)
      } else if (lot.onHand - movement.qty < lot.reserve) {
        reserve.push(
          `${movement.from} ${movement.cargo} would fall to ${lot.onHand - movement.qty}, under the reserve of ${lot.reserve}.`,
        )
      } else {
        lot.onHand -= movement.qty
      }
    }
  })

  const byConvoy = new Map<string, Movement[]>()
  for (const movement of ordered) {
    const list = byConvoy.get(movement.convoyId) ?? []
    list.push(movement)
    byConvoy.set(movement.convoyId, list)
  }
  for (const [convoyId, legs] of byConvoy) {
    const convoy = world.convoys.find((item) => item.id === convoyId)
    if (!convoy) continue
    for (let i = 0; i < legs.length; i += 1) {
      for (let j = i + 1; j < legs.length; j += 1) {
        const a = legs[i]
        const b = legs[j]
        const overlaps = a.departMinute < b.arriveMinute && b.departMinute < a.arriveMinute
        if (overlaps && a.qty + b.qty > convoy.capacity) {
          capacity.push(`${convoy.name} overlaps two loads (${a.qty} + ${b.qty}) above capacity ${convoy.capacity}.`)
        }
      }
    }
  }

  for (const demand of world.demands) {
    const arrival = demandArrival(plan.movements, demand)
    if (arrival === null) gaps.push(`${demand.label} is not covered.`)
    else if (arrival > demand.latestMinute) deadlines.push(`${demand.label} arrives at minute ${arrival}, after ${demand.latestMinute}.`)
  }

  const assessed = assessConfidence(plan, world, roe)
  const gated = Math.min(plan.confidence, assessed)
  const lowConfidence = gated < roe.minConfidenceAuto

  const checks: Check[] = [
    check("GRAPH", "Known routes", graph.length ? "hard" : "pass", graph.join(" ") || "Every leg exists on the exercise map."),
    check("NO_GO", "No-go routes", noGo.length ? "hard" : "pass", noGo.join(" ") || "No leg uses a no-go route."),
    check("ROUTE_OPEN", "Route status", closed.length ? "hard" : "pass", closed.join(" ") || "No leg uses a closed route."),
    check("CAPACITY", "Package capacity", capacity.length ? "hard" : "pass", capacity.join(" ") || "Loads fit the assigned packages."),
    check("RESERVE", "Inventory reserve", reserve.length ? "hard" : "pass", reserve.join(" ") || "Issues stay at or above reserve."),
    check("CARGO_POLICY", "Cargo policy", cargo.length ? "hard" : "pass", cargo.join(" ") || "Cargo is allowed on the chosen routes."),
    check(
      "WEATHER",
      "Weather",
      weatherAbort.length ? "hard" : weatherAdvisory.length ? "waivable" : "pass",
      weatherAbort.join(" ") || weatherAdvisory.join(" ") || "Weather is inside limits for these routes.",
    ),
    check(
      "RISK",
      "Risk ceiling",
      riskHard.length ? "hard" : riskSoft.length ? "waivable" : "pass",
      riskHard.join(" ") || riskSoft.join(" ") || `Risk stays at or under ${roe.maxRisk}.`,
    ),
    check(
      "COMMS",
      "Communications",
      commsLost.length ? "hard" : commsDegraded.length ? "waivable" : "pass",
      commsLost.join(" ") || commsDegraded.join(" ") || "Destination communications support the movement.",
    ),
    check(
      "CONFIDENCE",
      "Confidence floor",
      lowConfidence ? "waivable" : "pass",
      lowConfidence
        ? `Gated confidence ${gated.toFixed(2)} is under the auto-execute floor ${roe.minConfidenceAuto.toFixed(2)}.`
        : `Gated confidence ${gated.toFixed(2)} meets the floor ${roe.minConfidenceAuto.toFixed(2)}.`,
    ),
    check(
      "MISSION",
      "Demand coverage",
      gaps.length || deadlines.length ? "waivable" : "pass",
      [...gaps, ...deadlines].join(" ") || "Every demand is covered inside its window.",
    ),
  ]

  const disposition = checks.some((item) => item.status === "hard")
    ? "blocked"
    : checks.some((item) => item.status === "waivable")
      ? "waivable"
      : "cleared"

  return {
    planId: plan.id,
    disposition,
    autoExecute: disposition === "cleared" && roe.autonomy === "execute-within-bounds",
    gatedConfidence: gated,
    assessedConfidence: assessed,
    reportedConfidence: plan.reportedConfidence,
    checks,
  }
}

export function hardFindings(report: ValidationReport): Check[] {
  return report.checks.filter((item) => item.status === "hard")
}

export function waivableFindings(report: ValidationReport): Check[] {
  return report.checks.filter((item) => item.status === "waivable")
}

import { describe, expect, it } from "vitest"
import { createNominalWorld, defaultRoe, stormWeather } from "@/lib/theater"
import { deterministicPlan, unconstrainedShortcut } from "@/lib/planner"
import { validate } from "@/lib/validator"
import { stampConfidence } from "@/lib/confidence"
import type { Plan, World } from "@/lib/types"

function codes(plan: Plan, world: World, roe = defaultRoe()) {
  const stamped = stampConfidence(plan, world, roe)
  const report = validate(stamped, world, roe)
  return {
    disposition: report.disposition,
    autoExecute: report.autoExecute,
    failed: report.checks.filter((check) => check.status !== "pass").map((check) => `${check.code}:${check.status}`),
    routes: stamped.movements.map((movement) => movement.routeId),
  }
}

describe("validator and planner", () => {
  it("clears the nominal baseline and avoids the no-go route", () => {
    const world = createNominalWorld()
    const plan = deterministicPlan(world, defaultRoe())
    const result = codes(plan, world)
    expect(result.disposition).toBe("cleared")
    expect(result.autoExecute).toBe(true)
    expect(plan.reportedConfidence).toBe(plan.confidence)
    expect(plan.confidence).toBeGreaterThan(0.85)
    expect(result.routes).toContain("msr-north")
    expect(result.routes).not.toContain("corridor-red")
    expect(result.routes).toContain("msr-coast")
  })

  it("reroutes around a closure without using the no-go corridor", () => {
    const world = createNominalWorld()
    world.exerciseMinute = 16
    world.routeStatus["msr-north"] = "closed"
    world.weather = stormWeather()
    world.comms.ridge = "degraded"
    const plan = deterministicPlan(world, defaultRoe())
    const result = codes(plan, world)
    expect(result.routes).toContain("alt-ridge")
    expect(result.routes).not.toContain("msr-north")
    expect(result.routes).not.toContain("corridor-red")
    expect(result.disposition).toBe("waivable")
    expect(result.autoExecute).toBe(false)
    expect(result.failed).toEqual(expect.arrayContaining(["WEATHER:waivable", "COMMS:waivable"]))
  })

  it("blocks the unconstrained shortcut on hard rules and refuses an override path", () => {
    const world = createNominalWorld()
    world.exerciseMinute = 16
    world.routeStatus["msr-north"] = "closed"
    const result = codes(unconstrainedShortcut(world), world)
    expect(result.disposition).toBe("blocked")
    expect(result.failed).toEqual(expect.arrayContaining(["NO_GO:hard", "RISK:hard"]))
    expect(result.autoExecute).toBe(false)
  })

  it("blocks a draw below reserve and an overload", () => {
    const world = createNominalWorld()
    const base = deterministicPlan(world, defaultRoe())
    const heavy: Plan = {
      ...base,
      movements: base.movements.map((movement) =>
        movement.cargo === "I" ? { ...movement, qty: 30 } : movement,
      ),
    }
    expect(codes(heavy, world).failed).toContain("RESERVE:hard")
    const overload: Plan = {
      ...base,
      movements: base.movements.map((movement) =>
        movement.convoyId === "alpha" ? { ...movement, qty: 13 } : movement,
      ),
    }
    expect(codes(overload, world).failed).toContain("CAPACITY:hard")
  })

  it("blocks class V on a civilian route", () => {
    const world = createNominalWorld()
    world.routes.push({
      id: "yard-road",
      name: "Yard Road",
      from: "davis",
      to: "harbor",
      km: 10,
      minutes: 20,
      baseRisk: 10,
      weatherExposure: 0.1,
      noGo: false,
      civilian: true,
      path: "",
    })
    world.routeStatus["yard-road"] = "open"
    const plan: Plan = {
      id: "civil",
      source: "scripted",
      reportedConfidence: 0.95,
      confidence: 0.95,
      rationale: "test",
      assumptions: [],
      movements: [
        {
          id: "m-v",
          convoyId: "alpha",
          from: "davis",
          to: "harbor",
          routeId: "yard-road",
          cargo: "V",
          qty: 2,
          departMinute: 20,
          arriveMinute: 40,
        },
      ],
    }
    expect(codes(plan, world).failed).toContain("CARGO_POLICY:hard")
  })

  it("does not auto-execute a cleared plan when autonomy is propose-only", () => {
    const world = createNominalWorld()
    const plan = deterministicPlan(world, defaultRoe())
    const roe = { ...defaultRoe(), autonomy: "propose-only" as const }
    expect(codes(plan, world, roe).autoExecute).toBe(false)
    expect(codes(plan, world, roe).disposition).toBe("cleared")
  })

  it("leaves a demand uncovered instead of using a no-go route when every legal path is aborted", () => {
    const world = createNominalWorld()
    world.routeStatus["msr-north"] = "closed"
    world.weather = { ...stormWeather(), windKt: 48, precipMm: 14, summary: "Abort conditions" }
    const plan = deterministicPlan(world, defaultRoe())
    expect(plan.movements.some((movement) => movement.routeId === "corridor-red")).toBe(false)
    expect(plan.movements.some((movement) => movement.cargo === "I")).toBe(false)
    expect(plan.rationale.toLowerCase()).toContain("uncovered")
  })
})

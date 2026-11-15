import { describe, expect, it } from "vitest"
import { verifyLog } from "@/lib/audit"
import { SCRIPT_JUSTIFICATION, createInitialState, reducer } from "@/lib/scenario"

function stepTo(beat: string) {
  let state = createInitialState(true)
  while (state.scenario.beat !== beat) {
    const before = state.scenario.beat
    state = reducer(state, { type: "step" })
    if (state.scenario.beat === before) break
  }
  return state
}

describe("scripted scenario", () => {
  it("opens on a cleared baseline with an intact chain and does not touch the network", () => {
    const state = createInitialState()
    expect(state.baselineReport.disposition).toBe("cleared")
    expect(state.execution).toBe("baseline")
    expect(verifyLog(state.audit).intact).toBe(true)
    expect(state.baseline.movements.some((movement) => movement.routeId === "msr-north")).toBe(true)
  })

  it("blocks the shortcut, then accepts only a justified override of the alternate", () => {
    const blocked = stepTo("blocked")
    expect(blocked.proposed?.report.disposition).toBe("blocked")
    expect(blocked.blocked?.plan.movements.some((movement) => movement.routeId === "corridor-red")).toBe(true)
    const refused = reducer(blocked, { type: "commander", action: "override", justification: SCRIPT_JUSTIFICATION })
    expect(refused.execution).not.toBe("overridden")
    expect(refused.notice).toMatch(/cannot be overridden/i)

    const alternate = stepTo("alternate")
    expect(alternate.proposed?.plan.source).toBe("deterministic")
    expect(alternate.proposed?.plan.movements.some((movement) => movement.routeId === "corridor-red")).toBe(false)
    expect(alternate.proposed?.plan.movements.some((movement) => movement.routeId === "alt-ridge")).toBe(true)
    expect(alternate.proposed?.report.disposition).toBe("waivable")
    expect(alternate.health.planner).toBe("deterministic")
    expect(alternate.health.fallbackReason).toMatch(/timed out/i)

    const shortReason = reducer(alternate, { type: "commander", action: "override", justification: "too short" })
    expect(shortReason.notice).toMatch(/justification/i)
    const approved = reducer(alternate, { type: "commander", action: "approve", justification: "" })
    expect(approved.notice).toMatch(/every check/i)

    const overridden = reducer(alternate, { type: "commander", action: "override", justification: SCRIPT_JUSTIFICATION })
    expect(overridden.execution).toBe("overridden")
    expect(overridden.lastDecision?.actor).toBe("commander")
    expect(verifyLog(overridden.audit).intact).toBe(true)
    expect(overridden.audit.events.some((event) => event.type === "plan-overridden")).toBe(true)
    expect(overridden.blocked?.report.disposition).toBe("blocked")
  })

  it("auto-overrides on the scenario timer and does not duplicate the chain while ticking", () => {
    let state = reducer(createInitialState(true), { type: "play" })
    state = reducer(state, { type: "tick", deltaMs: 160_000 })
    expect(state.execution).toBe("overridden")
    expect(state.lastDecision?.actor).toBe("commander (scenario timer)")
    const count = state.audit.events.length
    state = reducer(state, { type: "tick", deltaMs: 1_000 })
    expect(state.audit.events.length).toBe(count)
    expect(verifyLog(state.audit).intact).toBe(true)
  })

  it("finishes the three-minute pass with a verified chain", () => {
    const done = stepTo("verified")
    expect(done.scenario.beat).toBe("verified")
    expect(done.execution).toBe("overridden")
    expect(done.audit.events.some((event) => event.type === "chain-verified")).toBe(true)
    expect(verifyLog(done.audit).intact).toBe(true)
    expect(done.audit.events.some((event) => event.type === "plan-overridden")).toBe(true)
  })

  it("holds packages when the commander denies the alternate", () => {
    const alternate = stepTo("alternate")
    const denied = reducer(alternate, { type: "commander", action: "deny", justification: "" })
    expect(denied.execution).toBe("denied")
    const finished = reducer(denied, { type: "step" })
    expect(finished.execution).toBe("denied")
    expect(finished.narration.toLowerCase()).toContain("denied")
  })
})

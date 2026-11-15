import { appendEvent, verifyLog } from "@/lib/audit"
import { stampConfidence } from "@/lib/confidence"
import { exerciseStamp } from "@/lib/format"
import { deterministicPlan, unconstrainedShortcut } from "@/lib/planner"
import { createNominalWorld, defaultRoe, stormWeather } from "@/lib/theater"
import type { AuditLog, HealthSnapshot, Plan, Roe, ValidationReport, World } from "@/lib/types"
import { validate } from "@/lib/validator"

export type BeatId =
  | "brief"
  | "nominal"
  | "disruption"
  | "detect"
  | "unsafe"
  | "blocked"
  | "fallback"
  | "alternate"
  | "decision"
  | "executing"
  | "verified"

export interface Beat {
  id: BeatId
  startMs: number
  label: string
  narration: string
}

export const DECISION_WINDOW_MS = 10_000
export const SCENARIO_MS = 180_000
export const MIN_JUSTIFICATION = 20
export const SCRIPT_JUSTIFICATION =
  "Accept the weather advisory and degraded communications at BSA Ridge to meet the Class I window. Abort if wind reaches 40 knots. No-go routes stay closed."

export const BEATS: Beat[] = [
  {
    id: "brief",
    startMs: 0,
    label: "Brief",
    narration:
      "Unclassified exercise. Two resupply packages are on an approved plan. The validator already cleared it, and the audit chain is open.",
  },
  {
    id: "nominal",
    startMs: 14_000,
    label: "Nominal",
    narration:
      "Feeds are nominal. Class I is released toward LP North on MSR North. Class III fuel is released toward FOB Harbor on MSR Coast. Grok is standing by, and the deterministic planner is armed.",
  },
  {
    id: "disruption",
    startMs: 32_000,
    label: "Disruption",
    narration:
      "Disruption, before the start point. MSR North is closed. Wind and rain are above the advisory on the exposed alternate. Communications with BSA Ridge are degraded.",
  },
  {
    id: "detect",
    startMs: 50_000,
    label: "Detect",
    narration:
      "The agent caught the closure before either package moved. The approved plan is no longer valid. Both packages are holding, and a replan has started inside the commander's rules.",
  },
  {
    id: "unsafe",
    startMs: 66_000,
    label: "Unsafe plan",
    narration:
      "First candidate: send Package Alpha down Corridor Red. It is shorter, the status feed still lists it open, and the reported confidence is high. Confidence is not permission.",
  },
  {
    id: "blocked",
    startMs: 86_000,
    label: "Blocked",
    narration:
      "Validator block. Corridor Red is a no-go, and the risk is past the hard ceiling. Approve and override are both refused. That plan cannot execute.",
  },
  {
    id: "fallback",
    startMs: 104_000,
    label: "Fallback",
    narration:
      "The model path does not answer. The agent retries, then drops to the deterministic planner. Same rules, no gap where a truck can move on an unreviewed plan.",
  },
  {
    id: "alternate",
    startMs: 124_000,
    label: "Alternate",
    narration:
      "Second plan: Alt Ridge, then Spur North, with fuel still on MSR Coast. Hard rules pass. Weather and degraded communications are waivable, so it will not auto-execute.",
  },
  {
    id: "decision",
    startMs: 142_000,
    label: "Decision",
    narration:
      "Commander's call. One tap. Override writes the justification into the hash chain. Deny keeps both packages at Davis. The no-go route is still impossible to approve.",
  },
  {
    id: "executing",
    startMs: 164_000,
    label: "Executing",
    narration:
      "The alternate is moving. The blocked shortcut stays in the log as a plan that did not execute. Hard constraints were not waived.",
  },
  {
    id: "verified",
    startMs: 176_000,
    label: "Verified",
    narration:
      "Chain verified. Every proposal, block, fallback, and override is hashed to the entry before it. Change one line and this chain breaks.",
  },
]

const READY =
  "Exercise Steadfast Haul is staged. Press play for a three-minute pass: a route closes, the validator blocks a shortcut, and the commander overrides only what the rules allow."

export type Execution = "baseline" | "holding" | "auto" | "approved" | "overridden" | "denied"

export interface PendingPlan {
  plan: Plan
  report: ValidationReport
}

export interface AppState {
  world: World
  roe: Roe
  baseline: Plan
  baselineReport: ValidationReport
  proposed: PendingPlan | null
  blocked: PendingPlan | null
  execution: Execution
  audit: AuditLog
  health: HealthSnapshot
  narration: string
  notice: string | null
  lastDecision: { action: "approve" | "deny" | "override"; actor: string; justification?: string } | null
  scenario: {
    playing: boolean
    autoDecide: boolean
    elapsedMs: number
    beat: BeatId | "ready"
    applied: BeatId[]
  }
}

export type Action =
  | { type: "tick"; deltaMs: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "reset" }
  | { type: "step" }
  | { type: "set-auto-decide"; value: boolean }
  | { type: "commander"; action: "approve" | "deny" | "override"; justification: string; actor?: string }
  | { type: "inject"; kind: "close-north" | "degrade-ridge" | "spike-weather" | "lose-comms" | "restore" }
  | { type: "propose-shortcut" }
  | { type: "propose-deterministic" }
  | {
      type: "proposal-result"
      plan: Plan
      attempts: number
      fallbackReason?: string
      errors: string[]
      model: string
    }
  | { type: "set-max-risk"; value: number }
  | { type: "set-confidence-floor"; value: number }
  | { type: "set-autonomy"; value: Roe["autonomy"] }
  | { type: "set-weather"; weather: World["weather"] }

export function createInitialState(autoDecide = true): AppState {
  const world = createNominalWorld()
  const roe = defaultRoe()
  const planned = deterministicPlan(world, roe)
  const baseline: Plan = { ...planned, id: "plan-baseline", source: "baseline" }
  const baselineReport = validate(baseline, world, roe)
  let audit: AuditLog = { events: [] }
  audit = appendEvent(audit, {
    ts: exerciseStamp(world.exerciseMinute),
    type: "mission-opened",
    actor: "exercise-control",
    summary: "Exercise Steadfast Haul opened. Simulated unclassified data only.",
    payload: { exercise: "STEADFAST HAUL", ao: "AO COPPER" },
  })
  audit = appendEvent(audit, {
    ts: exerciseStamp(world.exerciseMinute),
    type: "plan-proposed",
    actor: "deterministic-planner",
    summary: "Baseline resupply plan proposed.",
    payload: { planId: baseline.id, routes: baseline.movements.map((movement) => movement.routeId) },
  })
  audit = appendEvent(audit, {
    ts: exerciseStamp(world.exerciseMinute),
    type: "validation",
    actor: "validator",
    summary: `Baseline ${baselineReport.disposition}.`,
    payload: { planId: baseline.id, disposition: baselineReport.disposition },
  })
  audit = appendEvent(audit, {
    ts: exerciseStamp(world.exerciseMinute),
    type: "plan-approved",
    actor: "commander",
    summary: "Commander approved the baseline before release.",
    payload: { planId: baseline.id },
  })
  return {
    world,
    roe,
    baseline,
    baselineReport,
    proposed: null,
    blocked: null,
    execution: "baseline",
    audit,
    health: healthFrom(world, "standby", "up", 0, audit),
    narration: READY,
    notice: null,
    lastDecision: null,
    scenario: { playing: false, autoDecide, elapsedMs: 0, beat: "ready", applied: [] },
  }
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "tick":
      if (!state.scenario.playing) return state
      return advance(state, state.scenario.elapsedMs + action.deltaMs, true)
    case "play":
      if (state.scenario.elapsedMs >= SCENARIO_MS) {
        return reducer(createInitialState(state.scenario.autoDecide), { type: "play" })
      }
      return { ...state, notice: null, scenario: { ...state.scenario, playing: true } }
    case "pause":
      return { ...state, scenario: { ...state.scenario, playing: false } }
    case "reset":
      return createInitialState(state.scenario.autoDecide)
    case "step": {
      const index = state.scenario.beat === "ready" ? -1 : BEATS.findIndex((beat) => beat.id === state.scenario.beat)
      const next = BEATS[index + 1]
      if (!next) return { ...state, scenario: { ...state.scenario, playing: false } }
      return advance({ ...state, scenario: { ...state.scenario, playing: false } }, next.startMs, false)
    }
    case "set-auto-decide":
      return { ...state, scenario: { ...state.scenario, autoDecide: action.value } }
    case "commander":
      return applyCommander(state, action.action, action.justification, action.actor ?? "commander")
    case "inject":
      return inject(state, action.kind)
    case "propose-shortcut":
      return showShortcut(state, "Unconstrained shortcut submitted to the validator.", 1, "up")
    case "propose-deterministic":
      return proposeDeterministic(state, true)
    case "proposal-result":
      return acceptExternalPlan(state, action)
    case "set-max-risk":
      return revalidate({ ...state, roe: { ...state.roe, maxRisk: clamp(action.value, 10, 90) }, notice: null })
    case "set-confidence-floor":
      return revalidate({
        ...state,
        roe: { ...state.roe, minConfidenceAuto: clamp(action.value, 0.5, 0.99) },
        notice: null,
      })
    case "set-autonomy":
      return revalidate({ ...state, roe: { ...state.roe, autonomy: action.value }, notice: null })
    case "set-weather":
      return applyWeather(state, action.weather)
    default:
      return state
  }
}

export function activePlan(state: AppState): Plan | null {
  if (state.execution === "baseline") return state.baseline
  if (state.execution === "auto" || state.execution === "approved" || state.execution === "overridden") {
    return state.proposed?.plan ?? null
  }
  return null
}

export function beatById(id: BeatId): Beat {
  const beat = BEATS.find((item) => item.id === id)
  if (!beat) throw new Error(`Unknown beat ${id}`)
  return beat
}

function advance(state: AppState, elapsedMs: number, playing: boolean): AppState {
  const elapsed = Math.min(SCENARIO_MS, Math.max(0, elapsedMs))
  const beat = [...BEATS].reverse().find((item) => item.startMs <= elapsed)
  let next: AppState = {
    ...state,
    scenario: {
      ...state.scenario,
      elapsedMs: elapsed,
      playing: playing && elapsed < SCENARIO_MS,
      beat: beat?.id ?? "ready",
    },
  }
  for (const item of BEATS) {
    if (item.startMs > elapsed) break
    if (item.id === "executing") next = maybeAutoDecide(next)
    if (!next.scenario.applied.includes(item.id)) {
      next = applyBeat(next, item.id)
      next = { ...next, scenario: { ...next.scenario, applied: [...next.scenario.applied, item.id] } }
    }
  }
  next = maybeAutoDecide(next)
  if (elapsed >= SCENARIO_MS) {
    next = { ...next, scenario: { ...next.scenario, playing: false, elapsedMs: SCENARIO_MS } }
  }
  return next
}

function maybeAutoDecide(state: AppState): AppState {
  if (!state.scenario.autoDecide || state.lastDecision) return state
  if (!state.proposed || state.proposed.report.disposition !== "waivable") return state
  if (state.scenario.elapsedMs < beatById("decision").startMs + DECISION_WINDOW_MS) return state
  return applyCommander(state, "override", SCRIPT_JUSTIFICATION, "commander (scenario timer)")
}

function applyBeat(state: AppState, id: BeatId): AppState {
  const beat = beatById(id)
  switch (id) {
    case "brief":
    case "nominal":
      return { ...state, narration: beat.narration, health: healthFrom(state.world, "standby", "up", 0, state.audit) }
    case "disruption": {
      const world = structuredClone(state.world)
      world.exerciseMinute = 16
      world.routeStatus["msr-north"] = "closed"
      world.weather = stormWeather()
      world.comms.ridge = "degraded"
      let next = revalidate({ ...state, world, narration: beat.narration, execution: "holding" })
      next = log(next, "feed-disruption", "feed-adapter", "MSR North closed. Weather advisory. BSA Ridge communications degraded.", {
        route: "msr-north",
        windKt: world.weather.windKt,
        comms: "degraded",
      })
      const report = validate(next.baseline, next.world, next.roe)
      next = { ...next, baselineReport: report }
      return log(next, "plan-invalidated", "validator", "Approved baseline invalidated because MSR North is closed.", {
        planId: next.baseline.id,
        disposition: report.disposition,
      })
    }
    case "detect":
      return log(
        {
          ...state,
          narration: beat.narration,
          health: healthFrom(state.world, "scripted", "retrying", 1, state.audit, "Contacting the model path."),
        },
        "replan-started",
        "ops-agent",
        "Disruption detected before the start point. Replan requested.",
        { hold: true },
      )
    case "unsafe":
      return showShortcut(state, beat.narration, 1, "retrying")
    case "blocked":
      return {
        ...state,
        narration: beat.narration,
        health: healthFrom(state.world, "scripted", "down", 2, state.audit, "Model path timed out."),
      }
    case "fallback":
      return proposeDeterministic(
        {
          ...state,
          narration: beat.narration,
          health: healthFrom(
            state.world,
            "deterministic",
            "up",
            2,
            state.audit,
            "Grok timed out after 2 attempts. Deterministic planner engaged.",
          ),
        },
        false,
      )
    case "alternate":
    case "decision":
      if (state.lastDecision?.action === "deny") return state
      if (state.lastDecision) return { ...state, narration: beatById("executing").narration }
      return { ...state, narration: beat.narration }
    case "executing":
      if (state.lastDecision?.action === "deny") {
        return { ...state, narration: "Commander denied the alternate. Both packages stay at Davis." }
      }
      if (state.lastDecision) return { ...state, narration: beat.narration }
      return { ...state, narration: "No commander call landed. Packages stay held at Davis." }
    case "verified": {
      const result = verifyLog(state.audit)
      return log(
        { ...state, narration: beat.narration, health: { ...state.health, audit: result.intact ? "intact" : "tampered" } },
        "chain-verified",
        "validator",
        result.intact ? "Audit chain verified intact." : "Audit chain failed verification.",
        { intact: result.intact, events: state.audit.events.length },
      )
    }
    default:
      return state
  }
}

function showShortcut(
  state: AppState,
  narration: string,
  attempts: number,
  plannerStatus: HealthSnapshot["plannerStatus"],
): AppState {
  const plan = stampConfidence(unconstrainedShortcut(state.world), state.world, state.roe)
  const report = validate(plan, state.world, state.roe)
  const pending = { plan, report }
  let next: AppState = {
    ...state,
    proposed: pending,
    blocked: report.disposition === "blocked" ? pending : state.blocked,
    lastDecision: null,
    narration,
    notice: null,
    health: healthFrom(state.world, "scripted", plannerStatus, attempts, state.audit, "Unconstrained candidate is under review."),
  }
  next = log(next, "plan-proposed", "scripted-candidate", "Unconstrained shortcut proposed. Reported confidence is not permission.", {
    planId: plan.id,
    reportedConfidence: plan.reportedConfidence,
    assessedConfidence: report.assessedConfidence,
    routes: plan.movements.map((movement) => movement.routeId),
  })
  return log(next, "validation", "validator", `Shortcut ${report.disposition}.`, {
    planId: plan.id,
    disposition: report.disposition,
    checks: report.checks.filter((item) => item.status !== "pass"),
  })
}

function proposeDeterministic(state: AppState, allowAuto: boolean): AppState {
  const plan = deterministicPlan(state.world, state.roe)
  const report = validate(plan, state.world, state.roe)
  const next: AppState = {
    ...state,
    lastDecision: allowAuto ? null : state.lastDecision,
    health: healthFrom(state.world, "deterministic", "up", state.health.attempts || 0, state.audit, state.health.fallbackReason),
  }
  return presentPlan(next, plan, report, allowAuto, {
    actor: "deterministic-planner",
    attempts: next.health.attempts,
    fallbackReason: next.health.fallbackReason,
  })
}

function acceptExternalPlan(state: AppState, action: Extract<Action, { type: "proposal-result" }>): AppState {
  const plan = stampConfidence(action.plan, state.world, state.roe)
  const report = validate(plan, state.world, state.roe)
  const next: AppState = {
    ...state,
    lastDecision: null,
    health: healthFrom(
      state.world,
      plan.source === "grok" ? "grok" : "deterministic",
      "up",
      action.attempts,
      state.audit,
      action.fallbackReason,
    ),
  }
  return presentPlan(next, plan, report, true, {
    actor: plan.source === "grok" ? "grok" : "deterministic-planner",
    attempts: action.attempts,
    fallbackReason: action.fallbackReason,
    model: action.model,
    errors: action.errors,
  })
}

function presentPlan(
  state: AppState,
  plan: Plan,
  report: ValidationReport,
  allowAuto: boolean,
  meta: { actor: string; attempts: number; fallbackReason?: string; model?: string; errors?: string[] },
): AppState {
  let next: AppState = {
    ...state,
    proposed: { plan, report },
    blocked: report.disposition === "blocked" ? { plan, report } : state.blocked,
    notice: null,
  }
  next = log(next, "plan-proposed", meta.actor, `${plan.source} plan proposed.`, {
    planId: plan.id,
    source: plan.source,
    routes: plan.movements.map((movement) => movement.routeId),
    model: meta.model,
    attempts: meta.attempts,
    fallbackReason: meta.fallbackReason,
    errors: meta.errors,
  })
  next = log(next, "validation", "validator", `Plan ${plan.id} ${report.disposition}.`, {
    planId: plan.id,
    disposition: report.disposition,
    gatedConfidence: report.gatedConfidence,
    checks: report.checks.filter((item) => item.status !== "pass"),
  })
  if (allowAuto && report.autoExecute) {
    next = { ...next, execution: "auto", lastDecision: { action: "approve", actor: "ops-agent" } }
    next = log(next, "plan-auto-executed", "ops-agent", "Cleared plan auto-executed inside commander rules.", { planId: plan.id })
  }
  return next
}

function applyCommander(
  state: AppState,
  action: "approve" | "deny" | "override",
  justification: string,
  actor: string,
): AppState {
  if (!state.proposed) return { ...state, notice: "No plan is waiting for a decision." }
  const { report, plan } = state.proposed
  const reason = justification.trim()
  if (action === "approve" && report.disposition !== "cleared") {
    return { ...state, notice: "Approve is only available when every check passes." }
  }
  if (action === "override" && report.disposition === "blocked") {
    return { ...state, notice: "Hard constraints cannot be overridden." }
  }
  if (action === "override" && report.disposition !== "waivable") {
    return { ...state, notice: "Override is for a hold, not for a plan that already cleared." }
  }
  if (action === "override" && reason.length < MIN_JUSTIFICATION) {
    return { ...state, notice: `Override needs a justification of at least ${MIN_JUSTIFICATION} characters.` }
  }
  if (action === "deny") {
    const next: AppState = {
      ...state,
      execution: "denied",
      lastDecision: { action, actor },
      notice: null,
      narration: "Commander denied the waiting plan. Packages stay held.",
    }
    return log(next, "plan-denied", actor, `Commander denied ${plan.id}.`, { planId: plan.id })
  }
  const next: AppState = {
    ...state,
    execution: action === "override" ? "overridden" : "approved",
    lastDecision: { action, actor, justification: action === "override" ? reason : undefined },
    notice: null,
    narration:
      action === "override"
        ? "Override accepted and written into the audit chain. The blocked shortcut was not revived."
        : "Commander approved the cleared plan.",
  }
  return log(
    next,
    action === "override" ? "plan-overridden" : "plan-approved",
    actor,
    action === "override" ? `Override logged for ${plan.id}.` : `Approved ${plan.id}.`,
    {
      planId: plan.id,
      justification: action === "override" ? reason : undefined,
      waived: report.checks.filter((item) => item.status === "waivable").map((item) => item.code),
    },
  )
}

function applyWeather(state: AppState, weather: World["weather"]): AppState {
  if (state.scenario.playing) return { ...state, notice: "Weather stays on the script while the scenario is playing." }
  const world = structuredClone(state.world)
  world.weather = weather
  let next = revalidate({ ...state, world, notice: null })
  if (next.execution === "baseline" && next.baselineReport.disposition !== "cleared") next = { ...next, execution: "holding" }
  next = {
    ...next,
    health: healthFrom(next.world, next.health.planner, next.health.plannerStatus, next.health.attempts, next.audit, next.health.fallbackReason),
  }
  return log(next, "weather-feed", weather.source, `Weather feed updated from ${weather.source}: ${weather.summary}.`, {
    windKt: weather.windKt,
    precipMm: weather.precipMm,
  })
}

function inject(state: AppState, kind: "close-north" | "degrade-ridge" | "spike-weather" | "lose-comms" | "restore"): AppState {
  if (kind === "restore") {
    const world = createNominalWorld()
    const next = revalidate({
      ...state,
      world,
      proposed: null,
      blocked: null,
      lastDecision: null,
      execution: "baseline",
      narration: "Feeds restored. The approved baseline is back in force.",
      notice: null,
      health: healthFrom(world, "standby", "up", 0, state.audit),
    })
    return log(next, "feeds-restored", "exercise-control", "Route, weather, and communications feeds restored to nominal.", null)
  }
  const world = structuredClone(state.world)
  let summary = "Feed updated."
  if (kind === "close-north") {
    world.routeStatus["msr-north"] = "closed"
    summary = "MSR North closed from the route feed."
  } else if (kind === "degrade-ridge") {
    world.comms.ridge = "degraded"
    summary = "Communications with BSA Ridge degraded."
  } else if (kind === "lose-comms") {
    world.comms.ridge = "lost"
    summary = "Communications with BSA Ridge lost."
  } else if (kind === "spike-weather") {
    world.weather = stormWeather()
    summary = "Weather model spiked to advisory conditions."
  }
  let next = revalidate({ ...state, world, notice: null })
  if (next.execution === "baseline" && next.baselineReport.disposition !== "cleared") next = { ...next, execution: "holding" }
  next = {
    ...next,
    health: healthFrom(next.world, next.health.planner, next.health.plannerStatus, next.health.attempts, next.audit, next.health.fallbackReason),
  }
  return log(next, "feed-disruption", "feed-adapter", summary, { kind })
}

function revalidate(state: AppState): AppState {
  const baselineReport = validate(state.baseline, state.world, state.roe)
  let proposed = state.proposed
  if (proposed) {
    const plan = stampConfidence(proposed.plan, state.world, state.roe)
    proposed = { plan, report: validate(plan, state.world, state.roe) }
  }
  let execution = state.execution
  if (execution === "baseline" && baselineReport.disposition !== "cleared") execution = "holding"
  return { ...state, baselineReport, proposed, execution }
}

function log(state: AppState, type: string, actor: string, summary: string, payload: unknown): AppState {
  const audit = appendEvent(state.audit, {
    ts: exerciseStamp(state.world.exerciseMinute),
    type,
    actor,
    summary,
    payload,
  })
  return { ...state, audit, health: { ...state.health, audit: verifyLog(audit).intact ? "intact" : "tampered" } }
}

function healthFrom(
  world: World,
  planner: HealthSnapshot["planner"],
  plannerStatus: HealthSnapshot["plannerStatus"],
  attempts: number,
  audit: AuditLog,
  fallbackReason?: string,
): HealthSnapshot {
  const values = Object.values(world.comms)
  const commsFeed = values.includes("lost") ? "lost" : values.includes("degraded") ? "degraded" : "up"
  return {
    planner,
    plannerStatus,
    attempts,
    fallbackReason,
    weatherFeed: world.weather.source,
    routeFeed: "simulated",
    inventoryFeed: "simulated",
    commsFeed,
    validator: "ready",
    audit: verifyLog(audit).intact ? "intact" : "tampered",
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

export type CargoClass = "I" | "III" | "V" | "IX"

export type RouteStatus = "open" | "closed" | "advisory"

export type CommsState = "up" | "degraded" | "lost"

export type AutonomyMode = "propose-only" | "execute-within-bounds"

export type CommsLossPolicy = "hold" | "continue-last-approved" | "fallback-planner-only"

export type PlanSource = "grok" | "deterministic" | "scripted" | "baseline"

export type CheckStatus = "pass" | "waivable" | "hard"

export type Disposition = "cleared" | "waivable" | "blocked"

export interface MapPoint {
  x: number
  y: number
}

export interface NodeSite {
  id: string
  name: string
  short: string
  kind: "hub" | "bsa" | "fob" | "lp"
  x: number
  y: number
}

export interface RouteLeg {
  id: string
  name: string
  from: string
  to: string
  km: number
  minutes: number
  baseRisk: number
  weatherExposure: number
  noGo: boolean
  civilian: boolean
  path: string
}

export interface InventoryLot {
  nodeId: string
  cargo: CargoClass
  onHand: number
  reserve: number
  unit: string
}

export interface Demand {
  id: string
  nodeId: string
  cargo: CargoClass
  qty: number
  priority: number
  latestMinute: number
  label: string
}

export interface Convoy {
  id: string
  name: string
  capacity: number
  location: string
  availableMinute: number
}

export interface WeatherState {
  windKt: number
  precipMm: number
  tempC: number
  summary: string
  source: "simulated" | "open-meteo" | "fallback"
  label: string
}

export interface World {
  exerciseMinute: number
  nodes: NodeSite[]
  routes: RouteLeg[]
  routeStatus: Record<string, RouteStatus>
  inventory: InventoryLot[]
  demands: Demand[]
  convoys: Convoy[]
  weather: WeatherState
  comms: Record<string, CommsState>
}

export interface Movement {
  id: string
  convoyId: string
  from: string
  to: string
  routeId: string
  cargo: CargoClass
  qty: number
  departMinute: number
  arriveMinute: number
}

export interface Plan {
  id: string
  source: PlanSource
  /** Model- or planner-reported confidence before the assessed gate. */
  reportedConfidence: number
  /** Confidence the gate uses. Callers may set it; the validator takes the minimum of this and a fresh assessment. */
  confidence: number
  rationale: string
  assumptions: string[]
  movements: Movement[]
}

export interface Roe {
  maxRisk: number
  /** Assessed confidence required before execute-within-bounds may auto-execute. */
  minConfidenceAuto: number
  autonomy: AutonomyMode
  weatherAbortWindKt: number
  weatherAdvisoryWindKt: number
  weatherAbortPrecipMm: number
  weatherAdvisoryPrecipMm: number
  noGoRouteIds: string[]
  commsLossPolicy: CommsLossPolicy
  allowClassVOnCivilian: boolean
}

export interface Check {
  code: string
  title: string
  status: CheckStatus
  detail: string
}

export interface ValidationReport {
  planId: string
  disposition: Disposition
  autoExecute: boolean
  gatedConfidence: number
  assessedConfidence: number
  reportedConfidence: number
  checks: Check[]
}

export interface AuditEvent {
  index: number
  ts: string
  type: string
  actor: string
  summary: string
  payload: unknown
  prevHash: string
  hash: string
}

export interface AuditLog {
  events: AuditEvent[]
}

export type PlannerKind = "standby" | "grok" | "deterministic" | "scripted"

export interface HealthSnapshot {
  planner: PlannerKind
  plannerStatus: "up" | "retrying" | "down"
  attempts: number
  fallbackReason?: string
  weatherFeed: WeatherState["source"]
  routeFeed: "simulated"
  inventoryFeed: "simulated"
  commsFeed: CommsState
  validator: "ready"
  audit: "intact" | "tampered"
}

export interface PendingPlan {
  plan: Plan
  report: ValidationReport
}

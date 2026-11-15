import type {
  CargoClass,
  CommsState,
  Convoy,
  Demand,
  InventoryLot,
  NodeSite,
  Roe,
  RouteLeg,
  RouteStatus,
  WeatherState,
  World,
} from "@/lib/types"

export const EXERCISE = {
  name: "STEADFAST HAUL",
  ao: "AO COPPER",
  classification: "UNCLASSIFIED // SIMULATED",
  caveat: "Notional training data. Not a real operation. Not for operational use.",
  product: "Assured Autonomy Ops Agent",
  company: "Level Up Inc",
  owner: "Mark Yukhimets",
} as const

const nodes: NodeSite[] = [
  { id: "davis", name: "Distribution hub Davis", short: "DAVIS", kind: "hub", x: 118, y: 248 },
  { id: "ridge", name: "BSA Ridge", short: "RIDGE", kind: "bsa", x: 438, y: 108 },
  { id: "harbor", name: "FOB Harbor", short: "HARBOR", kind: "fob", x: 392, y: 392 },
  { id: "north", name: "LP North", short: "NORTH", kind: "lp", x: 688, y: 92 },
]

const routes: RouteLeg[] = [
  {
    id: "msr-north",
    name: "MSR North",
    from: "davis",
    to: "ridge",
    km: 42,
    minutes: 55,
    baseRisk: 18,
    weatherExposure: 0.35,
    noGo: false,
    civilian: false,
    path: "M 148 220 C 230 170, 330 140, 418 118",
  },
  {
    id: "alt-ridge",
    name: "Alt Ridge",
    from: "davis",
    to: "ridge",
    km: 68,
    minutes: 95,
    baseRisk: 27,
    weatherExposure: 0.85,
    noGo: false,
    civilian: false,
    path: "M 156 268 C 240 360, 340 300, 422 136",
  },
  {
    id: "corridor-red",
    name: "Corridor Red",
    from: "davis",
    to: "ridge",
    km: 31,
    minutes: 40,
    baseRisk: 74,
    weatherExposure: 0.25,
    noGo: true,
    civilian: false,
    path: "M 150 236 L 412 124",
  },
  {
    id: "msr-coast",
    name: "MSR Coast",
    from: "davis",
    to: "harbor",
    km: 36,
    minutes: 50,
    baseRisk: 16,
    weatherExposure: 0.3,
    noGo: false,
    civilian: false,
    path: "M 150 286 C 220 350, 300 400, 368 388",
  },
  {
    id: "spur-north",
    name: "Spur North",
    from: "ridge",
    to: "north",
    km: 22,
    minutes: 35,
    baseRisk: 14,
    weatherExposure: 0.25,
    noGo: false,
    civilian: false,
    path: "M 478 104 C 540 70, 600 68, 662 90",
  },
]

function lot(nodeId: string, cargo: CargoClass, onHand: number, reserve: number): InventoryLot {
  return { nodeId, cargo, onHand, reserve, unit: "pallets" }
}

const inventory: InventoryLot[] = [
  lot("davis", "I", 40, 12),
  lot("davis", "III", 28, 10),
  lot("davis", "IX", 14, 4),
  lot("davis", "V", 6, 2),
  lot("ridge", "I", 3, 3),
  lot("ridge", "III", 4, 4),
  lot("harbor", "III", 1, 1),
  lot("north", "I", 1, 1),
]

const demands: Demand[] = [
  {
    id: "d-north-i",
    nodeId: "north",
    cargo: "I",
    qty: 8,
    priority: 1,
    latestMinute: 220,
    label: "Class I to LP North",
  },
  {
    id: "d-harbor-iii",
    nodeId: "harbor",
    cargo: "III",
    qty: 6,
    priority: 2,
    latestMinute: 180,
    label: "Class III fuel to FOB Harbor",
  },
]

const convoys: Convoy[] = [
  { id: "alpha", name: "Package Alpha", capacity: 12, location: "davis", availableMinute: 0 },
  { id: "bravo", name: "Package Bravo", capacity: 8, location: "davis", availableMinute: 0 },
]

export function nominalWeather(): WeatherState {
  return {
    windKt: 8,
    precipMm: 0,
    tempC: 16,
    summary: "Clear, light wind",
    source: "simulated",
    label: "Exercise weather model",
  }
}

export function stormWeather(): WeatherState {
  return {
    windKt: 28,
    precipMm: 6.4,
    tempC: 11,
    summary: "Rain and gusts on exposed ground",
    source: "simulated",
    label: "Exercise weather model",
  }
}

export function defaultComms(): Record<string, CommsState> {
  return { davis: "up", ridge: "up", harbor: "up", north: "up" }
}

export function defaultRouteStatus(): Record<string, RouteStatus> {
  return {
    "msr-north": "open",
    "alt-ridge": "open",
    "corridor-red": "open",
    "msr-coast": "open",
    "spur-north": "open",
  }
}

export function defaultRoe(): Roe {
  return {
    maxRisk: 40,
    minConfidenceAuto: 0.85,
    autonomy: "execute-within-bounds",
    weatherAbortWindKt: 40,
    weatherAdvisoryWindKt: 22,
    weatherAbortPrecipMm: 12,
    weatherAdvisoryPrecipMm: 4,
    noGoRouteIds: ["corridor-red"],
    commsLossPolicy: "hold",
    allowClassVOnCivilian: false,
  }
}

export function createNominalWorld(): World {
  return {
    exerciseMinute: 12,
    nodes: structuredClone(nodes),
    routes: structuredClone(routes),
    routeStatus: defaultRouteStatus(),
    inventory: structuredClone(inventory),
    demands: structuredClone(demands),
    convoys: structuredClone(convoys),
    weather: nominalWeather(),
    comms: defaultComms(),
  }
}

export function siteName(world: World, id: string): string {
  return world.nodes.find((node) => node.id === id)?.short ?? id
}

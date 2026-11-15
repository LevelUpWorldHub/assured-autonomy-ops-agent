import { weatherBand } from "@/lib/risk"
import { activePlan, type AppState } from "@/lib/scenario"
import type { RouteLeg } from "@/lib/types"

export function TheaterMap({ state }: { state: AppState }) {
  const moving = activePlan(state)
  const active = new Set(moving?.movements.map((movement) => movement.routeId) ?? [])
  const markers = convoyMarkers(state)

  return (
    <div className="flex flex-col gap-3">
      <svg viewBox="0 0 800 480" role="img" aria-label="Simulated schematic of AO Copper routes and nodes" className="h-auto w-full rounded-xl bg-background ring-1 ring-foreground/10">
        <title>AO Copper schematic</title>
        {Array.from({ length: 8 }, (_, index) => (
          <line key={`v${index}`} x1={index * 100} y1={0} x2={index * 100} y2={480} className="stroke-border" />
        ))}
        {Array.from({ length: 5 }, (_, index) => (
          <line key={`h${index}`} x1={0} y1={index * 96} x2={800} y2={index * 96} className="stroke-border" />
        ))}
        {state.world.routes.map((route) => (
          <RouteGlyph key={route.id} route={route} state={state} active={active.has(route.id)} />
        ))}
        {state.world.nodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={16} className="fill-card stroke-primary" strokeWidth={2} />
            <text x={node.x} y={node.y + 4} textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
              {node.short.slice(0, 1)}
            </text>
            <text x={node.x} y={node.y + 34} textAnchor="middle" className="fill-foreground text-[12px] font-medium">
              {node.short}
            </text>
          </g>
        ))}
        {markers.map((marker) => (
          <g key={marker.id}>
            <circle cx={marker.x} cy={marker.y} r={11} className="fill-chart-3 stroke-background" strokeWidth={2} />
            <text x={marker.x} y={marker.y + 4} textAnchor="middle" className="fill-background text-[11px] font-semibold">
              {marker.label}
            </text>
          </g>
        ))}
        <RouteLabel x={250} y={150} text="MSR North" />
        <RouteLabel x={300} y={330} text="Alt Ridge" />
        <RouteLabel x={250} y={196} text="Corridor Red · no-go" />
        <RouteLabel x={230} y={390} text="MSR Coast" />
        <RouteLabel x={560} y={64} text="Spur North" />
      </svg>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li>Green open</li>
        <li>Amber advisory</li>
        <li>Blue moving</li>
        <li>Red closed or no-go</li>
        <li>A and B are packages</li>
      </ul>
    </div>
  )
}

function RouteGlyph({ route, state, active }: { route: RouteLeg; state: AppState; active: boolean }) {
  const status = state.world.routeStatus[route.id] ?? "open"
  const band = weatherBand(route, state.world.weather, state.roe)
  const closed = status === "closed"
  const noGo = route.noGo || state.roe.noGoRouteIds.includes(route.id)
  const tone = noGo || closed ? "stroke-destructive" : active ? "stroke-chart-3" : band === "advisory" ? "stroke-chart-4" : "stroke-chart-2"
  const label = noGo ? "no-go" : closed ? "closed" : active ? "moving" : band === "advisory" ? "advisory" : "open"
  return (
    <path
      d={route.path}
      className={`${tone} fill-none ${active ? "route-march" : ""}`}
      strokeWidth={active ? 5 : 3}
      strokeDasharray={noGo ? "2 7" : undefined}
    >
      <title>{`${route.name}, ${label}`}</title>
    </path>
  )
}

function RouteLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y} className="fill-muted-foreground text-[11px]">
      {text}
    </text>
  )
}

function convoyMarkers(state: AppState): { id: string; label: string; x: number; y: number }[] {
  const plan = activePlan(state)
  if (!plan) {
    return [
      { id: "alpha", label: "A", x: 86, y: 228 },
      { id: "bravo", label: "B", x: 86, y: 270 },
    ]
  }
  const routes = new Set(plan.movements.map((movement) => movement.routeId))
  return [
    {
      id: "alpha",
      label: "A",
      x: routes.has("alt-ridge") ? 300 : routes.has("corridor-red") ? 280 : 250,
      y: routes.has("alt-ridge") ? 246 : routes.has("corridor-red") ? 180 : 158,
    },
    { id: "bravo", label: "B", x: 290, y: 360 },
  ]
}

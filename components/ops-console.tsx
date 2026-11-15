"use client"

import { useEffect, useReducer, useState } from "react"
import { CloudSunIcon, PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react"
import { toast } from "sonner"
import { AuditPanel } from "@/components/audit-panel"
import { DecisionPanel } from "@/components/decision-panel"
import { TheaterMap } from "@/components/theater-map"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cargoShort, formatClock, formatExerciseMinute } from "@/lib/format"
import {
  BEATS,
  SCENARIO_MS,
  SCRIPT_JUSTIFICATION,
  createInitialState,
  reducer,
  type AppState,
} from "@/lib/scenario"
import { EXERCISE } from "@/lib/theater"
import type { Plan, WeatherState } from "@/lib/types"

interface ServiceHealth {
  grokConfigured: boolean
  model: string
}

interface LiveWeather extends WeatherState {
  notice?: string
}

export function OpsConsole() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState(true))
  const [justification, setJustification] = useState(SCRIPT_JUSTIFICATION)
  const [panel, setPanel] = useState("scenario")
  const [planning, setPlanning] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [service, setService] = useState<ServiceHealth | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null)
  const [weatherState, setWeatherState] = useState<"idle" | "loading" | "error">("idle")

  useEffect(() => {
    if (!state.scenario.playing) return
    let last = performance.now()
    let frame = 0
    const loop = (now: number) => {
      const delta = Math.min(250, now - last)
      last = now
      dispatch({ type: "tick", deltaMs: delta })
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [state.scenario.playing])

  useEffect(() => {
    let cancelled = false
    void fetch("/api/health")
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed")
        return response.json() as Promise<ServiceHealth>
      })
      .then((body) => {
        if (!cancelled) setService(body)
      })
      .catch(() => {
        if (!cancelled) setServiceError("The local health check did not answer.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (state.scenario.beat === "blocked") toast.error("Validator blocked Corridor Red. Override is refused.")
    if (state.scenario.beat === "fallback") toast.message("Model path timed out. Deterministic planner is up.")
    if (state.execution === "overridden" && state.scenario.beat === "decision") toast.success("Override written to the audit chain.")
  }, [state.scenario.beat, state.execution])

  async function refreshWeather() {
    setWeatherState("loading")
    try {
      const response = await fetch("/api/weather")
      if (!response.ok) throw new Error("weather")
      const body = (await response.json()) as LiveWeather
      setLiveWeather(body)
      setWeatherState("idle")
    } catch {
      setWeatherState("error")
    }
  }

  async function askGrok() {
    setPlanning(true)
    setPlanError(null)
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ world: state.world, roe: state.roe }),
      })
      const body = (await response.json()) as {
        error?: string
        plan?: Plan
        attempts?: number
        fallbackReason?: string | null
        errors?: string[]
        model?: string
      }
      if (!response.ok || !body.plan) {
        setPlanError(body.error ?? "The planner did not return a plan. Use the deterministic replan.")
        return
      }
      dispatch({
        type: "proposal-result",
        plan: body.plan,
        attempts: body.attempts ?? 0,
        fallbackReason: body.fallbackReason ?? undefined,
        errors: body.errors ?? [],
        model: body.model ?? service?.model ?? "grok-4.7",
      })
      if (body.fallbackReason) toast.message(body.fallbackReason)
    } catch {
      setPlanError("The planner request failed. The local deterministic planner is still available.")
    } finally {
      setPlanning(false)
    }
  }

  const beatIndex = state.scenario.beat === "ready" ? -1 : BEATS.findIndex((beat) => beat.id === state.scenario.beat)
  const progress = Math.min(100, (state.scenario.elapsedMs / SCENARIO_MS) * 100)
  const locked = state.scenario.playing

  return (
    <div className="flex min-h-dvh flex-col">
      <p className="bg-primary px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-primary-foreground">
        {EXERCISE.classification} — {EXERCISE.caveat}
      </p>
      <header className="flex flex-col gap-4 border-b px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {EXERCISE.company} · {EXERCISE.owner}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{EXERCISE.product}</h1>
            <p className="text-sm text-muted-foreground">
              Exercise {EXERCISE.name} · {EXERCISE.ao} · xTech|Live at CES 2027 · Scaling Assured Autonomy
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => dispatch({ type: state.scenario.playing ? "pause" : "play" })}>
              {state.scenario.playing ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {state.scenario.playing ? "Pause" : "Play 3-minute scenario"}
            </Button>
            <Button variant="outline" onClick={() => dispatch({ type: "step" })} disabled={state.scenario.playing}>
              <SkipForwardIcon data-icon="inline-start" />
              Step
            </Button>
            <Button variant="outline" onClick={() => dispatch({ type: "reset" })}>
              <RotateCcwIcon data-icon="inline-start" />
              Reset
            </Button>
            <Button
              variant={state.scenario.autoDecide ? "secondary" : "outline"}
              aria-pressed={state.scenario.autoDecide}
              onClick={() => dispatch({ type: "set-auto-decide", value: !state.scenario.autoDecide })}
            >
              Auto-decide {state.scenario.autoDecide ? "on" : "off"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-mono tabular-nums">
              {formatClock(state.scenario.elapsedMs)} / {formatClock(SCENARIO_MS)} · Exercise {formatExerciseMinute(state.world.exerciseMinute)}
            </p>
            <p>{state.scenario.beat === "ready" ? "Ready" : BEATS[beatIndex]?.label}</p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <ol className="hidden gap-2 text-[11px] text-muted-foreground md:flex md:flex-wrap">
            {BEATS.map((beat) => (
              <li key={beat.id} className={beat.id === state.scenario.beat ? "font-medium text-foreground" : undefined}>
                {beat.label}
              </li>
            ))}
          </ol>
        </div>
      </header>
      <div className="flex flex-wrap gap-2 border-b px-4 py-3 lg:px-6">
        <StatusBadge label="Planner" value={plannerLabel(state)} />
        <StatusBadge label="Validator" value="Ready" />
        <StatusBadge label="Audit" value={state.health.audit === "intact" ? "Intact" : "Broken"} />
        <StatusBadge label="Weather" value={state.world.weather.source} />
        <StatusBadge label="Comms" value={state.health.commsFeed} />
        <StatusBadge label="Autonomy" value={state.roe.autonomy === "execute-within-bounds" ? "Execute in bounds" : "Propose only"} />
        <StatusBadge
          label="Grok key"
          value={
            service
              ? service.grokConfigured
                ? `Set · ${service.model}`
                : `Missing · fallback ${service.model}`
              : serviceError
                ? "Health check failed"
                : "Checking"
          }
        />
      </div>
      <main className="grid flex-1 gap-4 px-4 py-4 lg:grid-cols-12 lg:px-6">
        <section className="flex flex-col gap-4 lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>AO Copper</CardTitle>
              <CardDescription>Schematic only. Distances are exercise values, not a navigational chart.</CardDescription>
            </CardHeader>
            <CardContent>
              <TheaterMap state={state} />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <FeedCard state={state} liveWeather={liveWeather} weatherState={weatherState} locked={locked} onRefresh={() => void refreshWeather()} onApply={() => {
              if (!liveWeather) return
              dispatch({
                type: "set-weather",
                weather: {
                  windKt: liveWeather.windKt,
                  precipMm: liveWeather.precipMm,
                  tempC: liveWeather.tempC,
                  summary: liveWeather.summary,
                  source: liveWeather.source === "open-meteo" ? "open-meteo" : "fallback",
                  label: liveWeather.label,
                },
              })
            }} />
            <RoeCard state={state} locked={locked} dispatch={dispatch} />
          </div>
        </section>
        <section className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle>What the commander should hear</CardTitle>
              <CardDescription>
                {state.scenario.playing ? "Scenario running." : "Paused. Step through it, or play the full three minutes."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-relaxed">{state.narration}</p>
            </CardContent>
          </Card>
          <Tabs value={panel} onValueChange={(value) => setPanel(value ?? "scenario")}>
            <TabsList>
              <TabsTrigger value="scenario">Scenario</TabsTrigger>
              <TabsTrigger value="monitor">Monitor</TabsTrigger>
            </TabsList>
            <TabsContent value="scenario" className="pt-3">
              <Alert>
                <AlertTitle>Scripted link loss</AlertTitle>
                <AlertDescription>
                  The three-minute pass does not call Grok or Open-Meteo. The fallback, the block, and the override are deterministic.
                  Use Monitor to hit the live model and the weather feed.
                </AlertDescription>
              </Alert>
            </TabsContent>
            <TabsContent value="monitor" className="pt-3">
              <div className="flex flex-col gap-3">
                {serviceError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Health check</AlertTitle>
                    <AlertDescription>{serviceError}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={locked} onClick={() => dispatch({ type: "inject", kind: "close-north" })}>
                    Close MSR North
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => dispatch({ type: "inject", kind: "degrade-ridge" })}>
                    Degrade Ridge
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => dispatch({ type: "inject", kind: "lose-comms" })}>
                    Lose Ridge comms
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => dispatch({ type: "inject", kind: "spike-weather" })}>
                    Spike weather
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => dispatch({ type: "inject", kind: "restore" })}>
                    Restore feeds
                  </Button>
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={locked || planning} onClick={() => dispatch({ type: "propose-deterministic" })}>
                    Deterministic replan
                  </Button>
                  <Button variant="secondary" disabled={locked || planning} onClick={() => void askGrok()}>
                    Ask Grok
                  </Button>
                  <Button variant="outline" disabled={locked || planning} onClick={() => dispatch({ type: "propose-shortcut" })}>
                    Propose blocked shortcut
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {service?.grokConfigured
                    ? `Ask Grok uses ${service.model}. The validator still checks the answer before anything can move.`
                    : "No XAI_API_KEY on the server. Ask Grok returns the deterministic plan and says why."}
                </p>
              </div>
            </TabsContent>
          </Tabs>
          <DecisionPanel
            state={state}
            justification={justification}
            planning={planning}
            planError={planError}
            onJustification={setJustification}
            onCommand={(action) => dispatch({ type: "commander", action, justification })}
          />
        </section>
        <div className="lg:col-span-12">
          <AuditPanel state={state} />
        </div>
      </main>
    </div>
  )
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  return (
    <Badge variant="outline">
      {label}: {value}
    </Badge>
  )
}

function plannerLabel(state: AppState): string {
  const name =
    state.health.planner === "grok"
      ? "Grok"
      : state.health.planner === "deterministic"
        ? "Deterministic"
        : state.health.planner === "scripted"
          ? "Scripted candidate"
          : "Standby"
  const status = state.health.plannerStatus === "retrying" ? "retrying" : state.health.plannerStatus
  return state.health.fallbackReason && state.health.planner === "deterministic" ? `${name} fallback · ${status}` : `${name} · ${status}`
}

function FeedCard({
  state,
  liveWeather,
  weatherState,
  locked,
  onRefresh,
  onApply,
}: {
  state: AppState
  liveWeather: LiveWeather | null
  weatherState: "idle" | "loading" | "error"
  locked: boolean
  onRefresh: () => void
  onApply: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Feeds</CardTitle>
        <CardDescription>Route, inventory, and communications are simulated. Weather can be live.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          Exercise weather: {state.world.weather.summary}. {state.world.weather.windKt} kt, {state.world.weather.precipMm} mm, {state.world.weather.tempC}°C. Source {state.world.weather.source}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={weatherState === "loading"}>
            <CloudSunIcon data-icon="inline-start" />
            {weatherState === "loading" ? "Reading Open-Meteo" : "Read Open-Meteo"}
          </Button>
          <Button variant="secondary" size="sm" disabled={!liveWeather || locked} onClick={onApply}>
            Apply to exercise
          </Button>
        </div>
        {weatherState === "error" ? <p className="text-sm text-destructive">Open-Meteo did not answer. The exercise weather is unchanged.</p> : null}
        {liveWeather ? (
          <p className="text-sm text-muted-foreground">
            {liveWeather.label}: {liveWeather.summary}, {liveWeather.windKt} kt, {liveWeather.precipMm} mm ({liveWeather.source}). {liveWeather.notice ?? ""}
          </p>
        ) : null}
        <ul className="flex flex-col gap-1 text-sm">
          {state.world.routes.map((route) => (
            <li key={route.id}>
              {route.name}: {route.noGo || state.roe.noGoRouteIds.includes(route.id) ? "no-go" : state.world.routeStatus[route.id]}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1 text-sm">
          {state.world.nodes.map((node) => (
            <li key={node.id}>
              {node.short} comms {state.world.comms[node.id]}
            </li>
          ))}
        </ul>
        <ul className="flex flex-col gap-1 text-sm">
          {state.world.inventory
            .filter((lot) => lot.nodeId === "davis")
            .map((lot) => (
              <li key={lot.cargo}>
                Davis {cargoShort(lot.cargo)} {lot.onHand} on hand, reserve {lot.reserve}
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RoeCard({
  state,
  locked,
  dispatch,
}: {
  state: AppState
  locked: boolean
  dispatch: (action: Parameters<typeof reducer>[1]) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Rules of engagement</CardTitle>
        <CardDescription>{locked ? "Locked while the scenario plays." : "Commander settings. The validator reads these, the model does not get a veto."}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="max-risk">Max risk</FieldLabel>
            <Input
              id="max-risk"
              type="number"
              min={10}
              max={90}
              value={state.roe.maxRisk}
              disabled={locked}
              onChange={(event) => dispatch({ type: "set-max-risk", value: Number(event.target.value) })}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="confidence-floor">Auto confidence</FieldLabel>
            <Input
              id="confidence-floor"
              type="number"
              min={0.5}
              max={0.99}
              step={0.01}
              value={state.roe.minConfidenceAuto}
              disabled={locked}
              onChange={(event) => dispatch({ type: "set-confidence-floor", value: Number(event.target.value) })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={state.roe.autonomy === "execute-within-bounds" ? "secondary" : "outline"}
              disabled={locked}
              onClick={() => dispatch({ type: "set-autonomy", value: "execute-within-bounds" })}
            >
              Execute in bounds
            </Button>
            <Button
              size="sm"
              variant={state.roe.autonomy === "propose-only" ? "secondary" : "outline"}
              disabled={locked}
              onClick={() => dispatch({ type: "set-autonomy", value: "propose-only" })}
            >
              Propose only
            </Button>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            <li>Weather advisory {state.roe.weatherAdvisoryWindKt} kt / {state.roe.weatherAdvisoryPrecipMm} mm. Abort {state.roe.weatherAbortWindKt} kt / {state.roe.weatherAbortPrecipMm} mm.</li>
            <li>No-go: {state.roe.noGoRouteIds.join(", ")}. Class V stays off civilian roads.</li>
            <li>Communications policy: {state.roe.commsLossPolicy}.</li>
          </ul>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

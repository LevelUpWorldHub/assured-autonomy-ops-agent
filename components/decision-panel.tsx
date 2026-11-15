"use client"

import { CheckIcon, ShieldAlertIcon, ShieldXIcon } from "lucide-react"
import { dispositionLabel, formatExerciseMinute, sourceLabel } from "@/lib/format"
import { siteName } from "@/lib/theater"
import { DECISION_WINDOW_MS, MIN_JUSTIFICATION, SCRIPT_JUSTIFICATION, beatById, type AppState } from "@/lib/scenario"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

export function DecisionPanel({
  state,
  justification,
  planning,
  planError,
  onJustification,
  onCommand,
}: {
  state: AppState
  justification: string
  planning: boolean
  planError: string | null
  onJustification: (value: string) => void
  onCommand: (action: "approve" | "deny" | "override") => void
}) {
  const pending = state.proposed
  const report = pending?.report
  const canApprove = report?.disposition === "cleared"
  const canOverride = report?.disposition === "waivable" && justification.trim().length >= MIN_JUSTIFICATION
  const canDeny = Boolean(pending)
  const attention =
    state.scenario.beat === "decision" && !state.lastDecision && report?.disposition === "waivable"
  const decisionStart = beatById("decision").startMs
  const remaining = Math.max(0, decisionStart + DECISION_WINDOW_MS - state.scenario.elapsedMs)
  const showCountdown = attention && state.scenario.autoDecide && state.scenario.playing

  return (
    <div className="flex flex-col gap-3">
      {state.baselineReport.disposition !== "cleared" ? (
        <Alert variant="destructive">
          <AlertTitle>Approved plan invalidated</AlertTitle>
          <AlertDescription>
            The baseline no longer clears. Packages hold at Davis until a new plan is accepted.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.blocked && state.proposed?.plan.id !== state.blocked.plan.id ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Blocked shortcut stays rejected</CardTitle>
            <CardDescription>{state.blocked.plan.rationale}</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="destructive">Blocked · override refused</Badge>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{pending ? sourceLabel(pending.plan.source) : "No plan waiting"}</CardTitle>
          <CardDescription>
            {pending
              ? `Exercise ${formatExerciseMinute(state.world.exerciseMinute)} · ${dispositionLabel(pending.report.disposition)}`
              : "The approved baseline is the plan in force."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {planning ? <Skeleton className="h-24 w-full" /> : null}
          {planError ? (
            <Alert variant="destructive">
              <AlertTitle>Planner request failed</AlertTitle>
              <AlertDescription>{planError}</AlertDescription>
            </Alert>
          ) : null}
          {state.notice ? (
            <Alert>
              <AlertTitle>Decision not applied</AlertTitle>
              <AlertDescription>{state.notice}</AlertDescription>
            </Alert>
          ) : null}
          {pending && report ? (
            <>
              <p>{pending.plan.rationale}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant={report.disposition === "blocked" ? "destructive" : report.disposition === "waivable" ? "outline" : "secondary"}>
                  {dispositionLabel(report.disposition)}
                </Badge>
                <Badge variant="outline">Reported {report.reportedConfidence.toFixed(2)}</Badge>
                <Badge variant="outline">Assessed {report.assessedConfidence.toFixed(2)}</Badge>
                <Badge variant="outline">Gate {report.gatedConfidence.toFixed(2)}</Badge>
              </div>
              <div
                role="meter"
                aria-label="Gated confidence"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={report.gatedConfidence}
                aria-valuetext={`${report.gatedConfidence.toFixed(2)} of 1`}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full bg-primary" style={{ width: `${Math.round(report.gatedConfidence * 100)}%` }} />
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {pending.plan.movements.map((movement) => (
                  <li key={movement.id}>
                    {movement.convoyId} · {movement.cargo} · {siteName(state.world, movement.from)} to {siteName(state.world, movement.to)} via{" "}
                    {state.world.routes.find((route) => route.id === movement.routeId)?.name ?? movement.routeId} · T+{movement.departMinute}–{movement.arriveMinute}
                  </li>
                ))}
              </ul>
              <ul className="flex flex-col gap-1">
                {report.checks
                  .filter((check) => check.status !== "pass")
                  .map((check) => (
                    <li key={check.code} className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-2 py-1.5">
                      <span className="font-medium">
                        {check.title} · {check.status === "waivable" ? "Waivable" : "Hard block"}
                      </span>
                      <span className="text-muted-foreground">{check.detail}</span>
                    </li>
                  ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                {report.checks.filter((check) => check.status === "pass").length} checks passed:{" "}
                {report.checks
                  .filter((check) => check.status === "pass")
                  .map((check) => check.title)
                  .join(", ")}
                .
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Baseline {state.baseline.id} is {state.baselineReport.disposition}. Use the scenario, or ask the deterministic planner or Grok for a new plan.
            </p>
          )}
          <FieldGroup>
            <Field data-invalid={Boolean(pending) && report?.disposition === "waivable" && justification.trim().length < MIN_JUSTIFICATION}>
              <FieldLabel htmlFor="override-justification">Override justification</FieldLabel>
              <Textarea
                id="override-justification"
                value={justification}
                onChange={(event) => onJustification(event.target.value)}
                aria-invalid={Boolean(pending) && report?.disposition === "waivable" && justification.trim().length < MIN_JUSTIFICATION}
              />
              <FieldDescription>
                One tap uses this text. Hard blocks stay refused. At least {MIN_JUSTIFICATION} characters.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {showCountdown ? (
            <p className="text-sm text-muted-foreground">
              Auto-override logs the scripted justification in {Math.ceil(remaining / 1000)}s if you do not tap first.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <span className={attention ? "rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background" : undefined}>
            <Button onClick={() => onCommand("override")} disabled={!canOverride}>
              <ShieldAlertIcon data-icon="inline-start" />
              Override
            </Button>
          </span>
          <Button variant="secondary" onClick={() => onCommand("approve")} disabled={!canApprove}>
            <CheckIcon data-icon="inline-start" />
            Approve
          </Button>
          <Button variant="outline" onClick={() => onCommand("deny")} disabled={!canDeny}>
            <ShieldXIcon data-icon="inline-start" />
            Deny
          </Button>
          <Button variant="ghost" onClick={() => onJustification(SCRIPT_JUSTIFICATION)}>
            Use scripted reason
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

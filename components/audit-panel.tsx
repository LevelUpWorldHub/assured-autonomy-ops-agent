"use client"

import { useState } from "react"
import { tamperCopy, verifyLog } from "@/lib/audit"
import { shortHash } from "@/lib/format"
import type { AppState } from "@/lib/scenario"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export function AuditPanel({ state }: { state: AppState }) {
  const [tamper, setTamper] = useState<{ length: number; text: string } | null>(null)
  const live = verifyLog(state.audit)
  const tamperText = tamper && tamper.length === state.audit.events.length ? tamper.text : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tamper-evident audit</CardTitle>
        <CardDescription>Each entry is hashed with the hash of the entry before it.</CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={live.intact ? "secondary" : "destructive"}>{live.intact ? "Chain intact" : "Chain broken"}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const result = verifyLog(tamperCopy(state.audit))
              setTamper({
                length: state.audit.events.length,
                text: result.intact ? "The copy still verified, which should not happen." : `${result.detail} The live log was not changed.`,
              })
            }}
          >
            Check a tampered copy
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {tamperText ? (
          <Alert variant="destructive">
            <AlertTitle>Tamper detection</AlertTitle>
            <AlertDescription>{tamperText}</AlertDescription>
          </Alert>
        ) : null}
        <ScrollArea className="h-72 rounded-lg border">
          <ol className="flex flex-col gap-2 p-3">
            {state.audit.events.map((event) => (
              <li key={event.hash} className="grid gap-1 border-b border-border pb-2 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {event.index + 1}. {event.summary}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{shortHash(event.hash)}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {event.type} · {event.actor} · {event.ts}
                </p>
              </li>
            ))}
          </ol>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

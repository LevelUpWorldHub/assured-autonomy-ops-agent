"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <Alert variant="destructive">
        <AlertTitle>The console hit an unexpected error.</AlertTitle>
        <AlertDescription>{error.message || "Reload the exercise and try the scenario again."}</AlertDescription>
      </Alert>
      <Button onClick={reset}>Reload the exercise</Button>
    </main>
  )
}

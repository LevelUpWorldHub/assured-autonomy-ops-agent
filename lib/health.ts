export interface AttemptResult<T> {
  ok: boolean
  value?: T
  attempts: number
  errors: string[]
}

export async function withRetries<T>(task: () => Promise<T>, attempts: number): Promise<AttemptResult<T>> {
  const errors: string[] = []
  const total = Math.max(1, attempts)
  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      const value = await task()
      return { ok: true, value, attempts: attempt, errors }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown planner error")
    }
  }
  return { ok: false, attempts: total, errors }
}

export function scrubSecret(message: string, secret: string | undefined): string {
  if (!secret) return message
  return message.split(secret).join("[redacted]")
}

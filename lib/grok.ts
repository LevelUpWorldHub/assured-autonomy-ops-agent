import { stampConfidence } from "@/lib/confidence"
import { scrubSecret, withRetries } from "@/lib/health"
import type { CargoClass, Movement, Plan, Roe, World } from "@/lib/types"

export interface GrokConfig {
  apiKey?: string
  model: string
  baseUrl: string
  timeoutMs: number
}

export function grokConfigFromEnv(env: Record<string, string | undefined>): GrokConfig {
  const timeout = Number(env.XAI_TIMEOUT_MS ?? 20000)
  return {
    apiKey: env.XAI_API_KEY?.trim() || undefined,
    model: env.XAI_MODEL?.trim() || "grok-4.7",
    baseUrl: (env.XAI_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/$/, ""),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20000,
  }
}

const CARGO: CargoClass[] = ["I", "III", "V", "IX"]

export function extractOutputText(body: unknown): string {
  if (!body || typeof body !== "object") return ""
  const record = body as Record<string, unknown>
  if (typeof record.output_text === "string" && record.output_text.trim()) return record.output_text
  if (!Array.isArray(record.output)) return ""
  const chunks: string[] = []
  for (const item of record.output) {
    if (!item || typeof item !== "object") continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const row = part as { type?: unknown; text?: unknown }
      if (row.type === "output_text" && typeof row.text === "string") chunks.push(row.text)
    }
  }
  return chunks.join("")
}

export function parsePlanText(text: string, world: World): Plan | null {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const record = parsed as Record<string, unknown>
  if (!Array.isArray(record.movements)) return null
  const movements: Movement[] = []
  for (const item of record.movements) {
    const movement = parseMovement(item)
    if (!movement) return null
    movements.push(movement)
  }
  const reported = clamp01(typeof record.confidence === "number" ? record.confidence : 0.5)
  return {
    id: `plan-grok-t${world.exerciseMinute}`,
    source: "grok",
    reportedConfidence: reported,
    confidence: reported,
    rationale: typeof record.rationale === "string" && record.rationale.trim() ? record.rationale.trim() : "Grok returned a plan without a rationale.",
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [],
    movements,
  }
}

function parseMovement(item: unknown): Movement | null {
  if (!item || typeof item !== "object") return null
  const row = item as Record<string, unknown>
  const cargo = row.cargo
  if (typeof cargo !== "string" || !CARGO.includes(cargo as CargoClass)) return null
  const fields = ["id", "convoyId", "from", "to", "routeId"] as const
  const strings: Record<string, string> = {}
  for (const field of fields) {
    if (typeof row[field] !== "string" || !row[field]) return null
    strings[field] = row[field] as string
  }
  const qty = row.qty
  const departMinute = row.departMinute
  const arriveMinute = row.arriveMinute
  if (!isFiniteNumber(qty) || !isFiniteNumber(departMinute) || !isFiniteNumber(arriveMinute)) return null
  if (qty <= 0 || arriveMinute < departMinute) return null
  return {
    id: strings.id,
    convoyId: strings.convoyId,
    from: strings.from,
    to: strings.to,
    routeId: strings.routeId,
    cargo: cargo as CargoClass,
    qty,
    departMinute,
    arriveMinute,
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function buildPlannerPrompt(world: World, roe: Roe): { system: string; user: string } {
  const system = [
    "You are the planning model inside an unclassified, simulated logistics exercise.",
    "Return one JSON object and nothing else.",
    "The object must contain confidence (0 to 1), rationale (string), assumptions (array of strings), and movements.",
    "Each movement has id, convoyId, from, to, routeId, cargo (I, III, V, or IX), qty, departMinute, arriveMinute.",
    "Use only node and route ids from the world. Do not invent places.",
    "A separate deterministic validator will accept or reject the plan. Do not claim the plan is approved or executed.",
    "Prefer routes that satisfy the demands. You may still propose a route the rules will reject; the validator, not you, decides.",
  ].join(" ")
  const user = JSON.stringify({
    task: "Plan resupply movements for the current exercise minute.",
    world,
    roe,
  })
  return { system, user }
}

export async function requestGrokPlan(
  world: World,
  roe: Roe,
  config: GrokConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Plan> {
  if (!config.apiKey) throw new Error("XAI_API_KEY is not configured")
  const prompt = buildPlannerPrompt(world, roe)
  let response: Response
  try {
    response = await fetchImpl(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grok request failed"
    throw new Error(scrubSecret(message, config.apiKey))
  }
  if (!response.ok) {
    throw new Error(`Grok returned HTTP ${response.status}`)
  }
  const body: unknown = await response.json()
  const text = extractOutputText(body)
  const plan = parsePlanText(text, world)
  if (!plan) throw new Error("Grok response was not a usable plan")
  return stampConfidence({ ...plan, source: "grok" }, world, roe)
}

export async function requestGrokPlanWithRetries(
  world: World,
  roe: Roe,
  config: GrokConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ plan: Plan; attempts: number } | { plan?: undefined; attempts: number; errors: string[] }> {
  const result = await withRetries(() => requestGrokPlan(world, roe, config, fetchImpl), 2)
  if (result.ok && result.value) return { plan: result.value, attempts: result.attempts }
  return { attempts: result.attempts, errors: result.errors.map((error) => scrubSecret(error, config.apiKey)) }
}

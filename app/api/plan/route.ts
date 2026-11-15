import { grokConfigFromEnv } from "@/lib/grok"
import { proposePlan } from "@/lib/orchestrator"
import type { Roe, World } from "@/lib/types"

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 })
  }
  const world = readWorld(body)
  const roe = readRoe(body)
  if (!world || !roe) {
    return Response.json({ error: "A world state and rules of engagement are required." }, { status: 400 })
  }
  try {
    const proposal = await proposePlan({
      world,
      roe,
      config: grokConfigFromEnv(process.env),
    })
    return Response.json(
      {
        simulated: true,
        plan: proposal.plan,
        report: proposal.report,
        source: proposal.source,
        attempts: proposal.attempts,
        fallbackReason: proposal.fallbackReason ?? null,
        errors: proposal.errors,
        model: proposal.model,
      },
      { headers: { "cache-control": "no-store" } },
    )
  } catch {
    return Response.json({ error: "The planner failed before a plan could be checked." }, { status: 500 })
  }
}

function readWorld(body: unknown): World | null {
  if (!body || typeof body !== "object") return null
  const world = (body as { world?: unknown }).world
  if (!world || typeof world !== "object") return null
  const candidate = world as World
  if (!Array.isArray(candidate.nodes) || candidate.nodes.length === 0) return null
  if (!Array.isArray(candidate.routes) || !Array.isArray(candidate.demands) || !Array.isArray(candidate.convoys)) return null
  if (!Array.isArray(candidate.inventory) || typeof candidate.exerciseMinute !== "number") return null
  if (!candidate.weather || !candidate.routeStatus || !candidate.comms) return null
  return candidate
}

function readRoe(body: unknown): Roe | null {
  if (!body || typeof body !== "object") return null
  const roe = (body as { roe?: unknown }).roe
  if (!roe || typeof roe !== "object") return null
  const candidate = roe as Roe
  if (typeof candidate.maxRisk !== "number" || typeof candidate.minConfidenceAuto !== "number") return null
  if (!Array.isArray(candidate.noGoRouteIds)) return null
  if (candidate.autonomy !== "propose-only" && candidate.autonomy !== "execute-within-bounds") return null
  return candidate
}

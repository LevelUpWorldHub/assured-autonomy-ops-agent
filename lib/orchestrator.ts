import { stampConfidence } from "@/lib/confidence"
import { requestGrokPlanWithRetries, type GrokConfig } from "@/lib/grok"
import { deterministicPlan } from "@/lib/planner"
import type { Plan, Roe, ValidationReport, World } from "@/lib/types"
import { validate } from "@/lib/validator"

export interface Proposal {
  plan: Plan
  report: ValidationReport
  source: "grok" | "deterministic"
  attempts: number
  fallbackReason?: string
  errors: string[]
  model: string
}

export async function proposePlan(input: {
  world: World
  roe: Roe
  config: GrokConfig
  useModel?: boolean
  fetchImpl?: typeof fetch
}): Promise<Proposal> {
  const useModel = input.useModel !== false && Boolean(input.config.apiKey)
  if (!useModel) {
    const plan = deterministicPlan(input.world, input.roe)
    return {
      plan,
      report: validate(plan, input.world, input.roe),
      source: "deterministic",
      attempts: 0,
      fallbackReason: input.config.apiKey ? "Model path turned off." : "XAI_API_KEY is not configured.",
      errors: [],
      model: input.config.model,
    }
  }

  const grok = await requestGrokPlanWithRetries(input.world, input.roe, input.config, input.fetchImpl)
  if (grok.plan) {
    const plan = stampConfidence(grok.plan, input.world, input.roe)
    return {
      plan,
      report: validate(plan, input.world, input.roe),
      source: "grok",
      attempts: grok.attempts,
      errors: [],
      model: input.config.model,
    }
  }

  const plan = deterministicPlan(input.world, input.roe)
  return {
    plan,
    report: validate(plan, input.world, input.roe),
    source: "deterministic",
    attempts: grok.attempts,
    fallbackReason: `Grok was unavailable after ${grok.attempts} attempts. Deterministic planner engaged.`,
    errors: grok.errors,
    model: input.config.model,
  }
}

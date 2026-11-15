import { describe, expect, it } from "vitest"
import { createNominalWorld, defaultRoe } from "@/lib/theater"
import { grokConfigFromEnv, extractOutputText, parsePlanText, requestGrokPlanWithRetries } from "@/lib/grok"
import { proposePlan } from "@/lib/orchestrator"
import { withRetries } from "@/lib/health"
import { fallbackWeather, mapOpenMeteo } from "@/lib/weather"

const planJson = JSON.stringify({
  confidence: 0.88,
  rationale: "Use the coast for fuel and the north road for rations.",
  assumptions: ["Status feed is current."],
  movements: [
    {
      id: "g1",
      convoyId: "bravo",
      from: "davis",
      to: "harbor",
      routeId: "msr-coast",
      cargo: "III",
      qty: 6,
      departMinute: 20,
      arriveMinute: 70,
    },
  ],
})

describe("grok adapter", () => {
  it("reads the model from the environment and defaults to grok-4.7", () => {
    expect(grokConfigFromEnv({}).model).toBe("grok-4.7")
    expect(grokConfigFromEnv({ XAI_MODEL: "grok-4.7-fast" }).model).toBe("grok-4.7-fast")
    expect(grokConfigFromEnv({}).apiKey).toBeUndefined()
  })

  it("extracts responses API text and parses a plan", () => {
    const world = createNominalWorld()
    expect(extractOutputText({ output_text: planJson })).toContain("msr-coast")
    const nested = extractOutputText({
      output: [{ type: "message", content: [{ type: "output_text", text: planJson }] }],
    })
    const plan = parsePlanText(nested, world)
    expect(plan?.source).toBe("grok")
    expect(plan?.movements[0]?.routeId).toBe("msr-coast")
    expect(parsePlanText("not json", world)).toBeNull()
  })

  it("calls the responses API with store false and the configured model, then falls back without leaking the key", async () => {
    const world = createNominalWorld()
    const roe = defaultRoe()
    const config = grokConfigFromEnv({ XAI_API_KEY: "secret-key", XAI_MODEL: "grok-4.7" })
    let calls = 0
    const fetchImpl: typeof fetch = async (input, init) => {
      calls += 1
      const body = JSON.parse(String(init?.body))
      expect(String(input)).toBe("https://api.x.ai/v1/responses")
      expect(body.model).toBe("grok-4.7")
      expect(body.store).toBe(false)
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret-key")
      if (calls === 1) throw new Error("socket closed for secret-key")
      return new Response(JSON.stringify({ output_text: planJson }), { status: 200 })
    }
    const result = await requestGrokPlanWithRetries(world, roe, config, fetchImpl)
    expect(result.plan?.source).toBe("grok")
    expect(calls).toBe(2)
    expect(JSON.stringify(result)).not.toContain("secret-key")
  })

  it("uses the deterministic planner when the model keeps failing", async () => {
    const world = createNominalWorld()
    world.routeStatus["msr-north"] = "closed"
    const fetchImpl: typeof fetch = async () => new Response("no", { status: 503 })
    const proposal = await proposePlan({
      world,
      roe: defaultRoe(),
      config: grokConfigFromEnv({ XAI_API_KEY: "secret-key", XAI_MODEL: "grok-4.7" }),
      fetchImpl,
    })
    expect(proposal.source).toBe("deterministic")
    expect(proposal.fallbackReason).toMatch(/Deterministic planner/)
    expect(proposal.plan.movements.some((movement) => movement.routeId === "msr-north")).toBe(false)
    expect(proposal.plan.movements.some((movement) => movement.routeId === "corridor-red")).toBe(false)
    expect(proposal.errors.every((error) => !error.includes("secret-key"))).toBe(true)
  })

  it("still blocks a model plan that uses the no-go route", async () => {
    const world = createNominalWorld()
    const illegal = planJson.replace("msr-coast", "corridor-red").replace("harbor", "ridge").replace("III", "I")
    const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ output_text: illegal }), { status: 200 })
    const proposal = await proposePlan({
      world,
      roe: defaultRoe(),
      config: grokConfigFromEnv({ XAI_API_KEY: "secret-key" }),
      fetchImpl,
    })
    expect(proposal.source).toBe("grok")
    expect(proposal.report.disposition).toBe("blocked")
    expect(proposal.report.checks.some((check) => check.code === "NO_GO" && check.status === "hard")).toBe(true)
  })
})

describe("self-healing helpers", () => {
  it("retries then returns the failure", async () => {
    let tries = 0
    const result = await withRetries(async () => {
      tries += 1
      throw new Error(`down ${tries}`)
    }, 2)
    expect(result.ok).toBe(false)
    expect(result.attempts).toBe(2)
    expect(tries).toBe(2)
  })

  it("maps an Open-Meteo payload and falls back cleanly", () => {
    const mapped = mapOpenMeteo(
      { current: { temperature_2m: 18.2, precipitation: 0.4, wind_speed_10m: 11.2, weather_code: 61 } },
      "Las Vegas stand-in",
      "2026-11-13T00:00:00Z",
    )
    expect(mapped?.source).toBe("open-meteo")
    expect(mapped?.windKt).toBe(11.2)
    expect(mapped?.summary).toBe("Light rain")
    expect(mapOpenMeteo({ nope: true }, "x", "t")).toBeNull()
    expect(fallbackWeather("Exercise", "t").source).toBe("fallback")
  })
})

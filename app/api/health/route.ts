import { connection } from "next/server"
import { grokConfigFromEnv } from "@/lib/grok"
import { EXERCISE } from "@/lib/theater"

export async function GET() {
  await connection()
  const config = grokConfigFromEnv(process.env)
  return Response.json(
    {
      ok: true,
      service: "assured-autonomy-ops-agent",
      classification: EXERCISE.classification,
      grokConfigured: Boolean(config.apiKey),
      model: config.model,
      time: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  )
}

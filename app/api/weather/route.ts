import { connection } from "next/server"
import { fallbackWeather, mapOpenMeteo, openMeteoUrl } from "@/lib/weather"

export async function GET() {
  await connection()
  const latitude = numberFromEnv(process.env.WEATHER_LAT, 36.17)
  const longitude = numberFromEnv(process.env.WEATHER_LON, -115.14)
  const label = process.env.WEATHER_LABEL?.trim() || "Las Vegas stand-in (not the simulated area of operations)"
  const observedAt = new Date().toISOString()
  try {
    const response = await fetch(openMeteoUrl(latitude, longitude), {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
    const mapped = mapOpenMeteo(await response.json(), label, observedAt)
    if (!mapped) throw new Error("Open-Meteo payload was not usable")
    return Response.json(mapped, { headers: { "cache-control": "no-store" } })
  } catch {
    return Response.json(
      {
        ...fallbackWeather(label, observedAt),
        notice: "Open-Meteo was unreachable. Showing the fallback snapshot.",
      },
      { headers: { "cache-control": "no-store" } },
    )
  }
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

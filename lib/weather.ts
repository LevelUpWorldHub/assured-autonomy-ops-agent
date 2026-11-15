export interface WeatherSnapshot {
  windKt: number
  precipMm: number
  tempC: number
  summary: string
  source: "open-meteo" | "fallback"
  label: string
  observedAt: string
}

const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Freezing fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  95: "Thunderstorm",
}

export function mapOpenMeteo(payload: unknown, label: string, observedAt: string): WeatherSnapshot | null {
  if (!payload || typeof payload !== "object") return null
  const current = (payload as { current?: unknown }).current
  if (!current || typeof current !== "object") return null
  const row = current as Record<string, unknown>
  const wind = numberOrNull(row.wind_speed_10m)
  const precip = numberOrNull(row.precipitation)
  const temp = numberOrNull(row.temperature_2m)
  const code = numberOrNull(row.weather_code)
  if (wind === null || precip === null || temp === null) return null
  const summary = code === null ? "Observed weather" : WMO[code] ?? `Weather code ${code}`
  return {
    windKt: round1(wind),
    precipMm: round1(precip),
    tempC: round1(temp),
    summary,
    source: "open-meteo",
    label,
    observedAt,
  }
}

export function fallbackWeather(label: string, observedAt: string): WeatherSnapshot {
  return {
    windKt: 8,
    precipMm: 0,
    tempC: 16,
    summary: "Feed unavailable. Showing the last exercise default.",
    source: "fallback",
    label,
    observedAt,
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

export function openMeteoUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,precipitation,wind_speed_10m,weather_code",
    wind_speed_unit: "kn",
    precipitation_unit: "mm",
  })
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

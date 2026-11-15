import type { CargoClass, Disposition, PlanSource } from "@/lib/types"

export function formatExerciseMinute(minute: number): string {
  const whole = Math.max(0, Math.round(minute))
  const hours = Math.floor(whole / 60)
  const mins = whole % 60
  return `T+${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}

export function formatClock(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(clamped / 60)
  const secs = clamped % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

export function cargoLabel(cargo: CargoClass): string {
  switch (cargo) {
    case "I":
      return "Class I rations and water"
    case "III":
      return "Class III fuel"
    case "V":
      return "Class V ammunition"
    case "IX":
      return "Class IX repair parts"
  }
}

export function cargoShort(cargo: CargoClass): string {
  return `CL ${cargo}`
}

export function sourceLabel(source: PlanSource): string {
  switch (source) {
    case "grok":
      return "Grok"
    case "deterministic":
      return "Deterministic planner"
    case "scripted":
      return "Unconstrained candidate"
    case "baseline":
      return "Approved baseline"
  }
}

export function dispositionLabel(disposition: Disposition): string {
  switch (disposition) {
    case "cleared":
      return "Cleared"
    case "waivable":
      return "Hold for commander"
    case "blocked":
      return "Blocked"
  }
}

export function shortHash(hash: string): string {
  if (hash.length < 16) return hash
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export function exerciseStamp(minute: number): string {
  return `exercise:${formatExerciseMinute(minute)}`
}

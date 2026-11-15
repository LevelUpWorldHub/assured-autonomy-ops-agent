import { canonicalJson } from "@/lib/canonical"
import { sha256Hex } from "@/lib/sha256"
import type { AuditEvent, AuditLog } from "@/lib/types"

export const GENESIS = "0".repeat(64)

export interface AuditDraft {
  ts: string
  type: string
  actor: string
  summary: string
  payload?: unknown
}

export function emptyLog(): AuditLog {
  return { events: [] }
}

export function appendEvent(log: AuditLog, draft: AuditDraft): AuditLog {
  const prevHash = log.events.at(-1)?.hash ?? GENESIS
  const index = log.events.length
  const body = {
    index,
    ts: draft.ts,
    type: draft.type,
    actor: draft.actor,
    summary: draft.summary,
    payload: draft.payload ?? null,
  }
  const hash = sha256Hex(`${prevHash}|${canonicalJson(body)}`)
  const event: AuditEvent = { ...body, prevHash, hash }
  return { events: [...log.events, event] }
}

export function verifyLog(log: AuditLog): { intact: boolean; failedIndex: number | null; detail: string } {
  let prev = GENESIS
  for (let index = 0; index < log.events.length; index += 1) {
    const event = log.events[index]
    if (event.index !== index) {
      return { intact: false, failedIndex: index, detail: `Event ${index} has stored index ${event.index}.` }
    }
    if (event.prevHash !== prev) {
      return { intact: false, failedIndex: index, detail: `Event ${index} does not point at the previous hash.` }
    }
    const body = {
      index: event.index,
      ts: event.ts,
      type: event.type,
      actor: event.actor,
      summary: event.summary,
      payload: event.payload ?? null,
    }
    const hash = sha256Hex(`${prev}|${canonicalJson(body)}`)
    if (hash !== event.hash) {
      return { intact: false, failedIndex: index, detail: `Event ${index} hash does not match its contents.` }
    }
    prev = event.hash
  }
  return { intact: true, failedIndex: null, detail: "Hash chain intact." }
}

/** Returns a copy with one summary changed and the hash left stale. The live log is not modified. */
export function tamperCopy(log: AuditLog): AuditLog {
  const copy = structuredClone(log)
  const target = copy.events[Math.min(1, copy.events.length - 1)]
  if (!target) return copy
  target.summary = `${target.summary} (tampered)`
  return copy
}

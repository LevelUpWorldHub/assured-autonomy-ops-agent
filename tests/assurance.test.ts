import { describe, expect, it } from "vitest"
import { sha256Hex } from "@/lib/sha256"
import { canonicalJson } from "@/lib/canonical"
import { appendEvent, emptyLog, tamperCopy, verifyLog } from "@/lib/audit"

describe("sha256", () => {
  it("matches known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    )
  })
})

describe("canonical json", () => {
  it("sorts keys and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, 1] } })).toBe('{"a":{"c":[3,1],"d":2},"b":1}')
  })
})

describe("audit chain", () => {
  it("verifies a chain and detects a tampered copy", () => {
    let log = emptyLog()
    log = appendEvent(log, { ts: "t1", type: "open", actor: "control", summary: "Opened", payload: { n: 1 } })
    log = appendEvent(log, { ts: "t2", type: "plan", actor: "agent", summary: "Proposed", payload: { route: "alt" } })
    log = appendEvent(log, { ts: "t3", type: "decision", actor: "commander", summary: "Override", payload: { ok: true } })
    expect(verifyLog(log)).toMatchObject({ intact: true, failedIndex: null })
    const tampered = tamperCopy(log)
    const failed = verifyLog(tampered)
    expect(failed.intact).toBe(false)
    expect(failed.failedIndex).toBe(1)
    expect(verifyLog(log).intact).toBe(true)
  })
})

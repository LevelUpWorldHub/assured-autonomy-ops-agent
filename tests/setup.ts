import { beforeEach } from "vitest"

beforeEach(() => {
  globalThis.fetch = (() => {
    throw new Error("network disabled in tests")
  }) as typeof fetch
})

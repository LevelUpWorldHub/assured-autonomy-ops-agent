# Quad chart — Assured Autonomy Ops Agent

Paste into `Template_xTech_Live_CES_Quad_Chart.pptx` on Valid Eval. The RFI will not review any other format. Due **5:00 PM ET / 2:00 PM PT, November 24, 2026**. One submission. Pre-registration and on-site registration are mutually exclusive.

Company: Level Up Inc, U.S. small business. Principal: Mark Yukhimets. Add address, phone, and email on the form. CAGE is not required to register.

Topic: (1) Scaling Assured Autonomy for Operational Use. Supporting: (2) AI/ML.  
TRL: 4, simulated software prototype. Not TRL 6. Complete subsystem for plan, check, override, and audit. Feeds are adapters.

Scoring this page is built for: CONOPS 25, topic alignment 20, interoperability 20, Army benefits 25, submission quality 10.

## 1. Operational need

Contested sustainment replans when a route closes, weather turns, or the radio drops. A model can propose the new schedule faster than a staff. The failure is a confident proposal that uses a road the commander closed, or a stall when the model or the link is gone.

How the Army would use it: a sustainment cell runs the agent beside its logistics picture. The commander sets rules before release. Cleared replans inside those rules can execute. Waivable holds wait for one tap. No-go routes, closed routes, and reserve floors cannot be tapped through. The soldier keeps the hard constraints.

CONOPS in one line: detect the disruption, propose, validate, fallback if the model is down, log the human decision, move only what the rules allow.

## 2. Technical approach

```text
  feeds (weather, routes, stock, comms)
           |
           v
     world state -----> Grok proposer -----> assessed confidence
           |                 |                      |
           |                 +-- timeout/retry --> deterministic proposer
           v                                        |
     commander ROE --------------------------> validator
                                                     |
                     cleared (in bounds) ---- auto-execute
                     waivable -------------- commander override
                     hard block ------------ no movement
                                                     |
                                                     v
                                            hash-chained audit
```

Grok is one proposer behind a JSON plan contract (`POST /v1/responses`, model from the environment, `store: false`). The validator is a pure function. A third party can replace the model and keep the ROE, the report, and the audit format. Prototype is MIT licensed. Production rights would be negotiated. This is the opposite of a planner that hides the go/no-go decision inside a prompt.

## 3. Key benefits

All figures are from the simulated prototype and its tests. Not a field trial.

- 100% of execute paths pass the deterministic validator. There is no model-only dispatch.
- Hard-constraint overrides succeed 0 times. The shortcut in the demo stays blocked.
- With the primary route closed, the fallback planner uses the alternate and does not use the no-go corridor.
- Audit tamper on a copy is detected. The live chain still verifies.
- The 3-minute demonstration completes with the network unavailable.
- A live model answer that names the no-go route is still blocked.

Why it matters: autonomy scales only if a bad proposal and a dead link have the same safe outcome. Cost claim versus an exquisite autonomy stack: this is a software subsystem on commodity hosting, not a new vehicle or radio. No dollar comparison is asserted.

## 4. Schedule, cost, transition, company

| When | What |
| --- | --- |
| Nov 24, 2026, 5:00 PM ET | Quad chart due |
| Dec 22, 2026 | Pre-registration notice |
| Jan 6–8, 2027 | Live pitches, booth 60508. Jan 8, 1:45 PM PT winners |
| After CES | Unclassified staff-exercise integration of the feed adapters. Validator and audit unchanged. Path toward a relevant-environment demo (TRL 6) |
| Later | Unit logistics rehearsal, human still on the loop for waivable rules |

Cost: company-funded prototype to date. A 90-day staff-exercise pilot is a planning range of about $180–250k. **Not a bid. Replace with the company's number before upload.**

Transition: prize authority is 10 U.S.C. § 4025 and does not promise a contract. Follow-on paths named in the RFI include §§ 4114, 4022, 4023, 4001, 4021, 3458, and 15 U.S.C. §§ 3703 and 638. Dual use is the same agent with a commercial rule pack for disaster and depot logistics.

Company: Level Up Inc. U.S. small business. Principal Mark Yukhimets. CAGE to be obtained for payment, not required at registration.

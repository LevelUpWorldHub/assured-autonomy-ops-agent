# Pitch — Assured Autonomy Ops Agent

Level Up Inc · Mark Yukhimets · U.S. small business  
xTech|Live at CES 2027 · Booth 60508, Eureka Park  
Primary topic: Scaling Assured Autonomy for Operational Use  
Supporting topic: Artificial Intelligence and Machine Learning

Official live pitch is five minutes plus five minutes of questions, in public, at the Army FUZE xTech booth. The RFI says presentation software and applications may not be used in that pitch. Confirm with the program office before putting this console on the table. The words below stand alone. The console is the prototype for a side conversation or a recording. Quad charts are due **5:00 PM ET / 2:00 PM PT, November 24, 2026**, on the Valid Eval template only. Selectees are notified by December 22, 2026. Pitches run January 6–8, 2027. Winners are announced January 8, 2027, at 1:45 PM PT. Up to five awards of $100,000. A prize is not a follow-on contract.

## Problem

A sustainment staff in a contested fight replans convoys when a route closes, the weather turns, or the radio to the support area drops. The planner who can see all of that fastest is increasingly a model. The failure mode that matters is not a slow answer. It is a confident answer that sends a package down a road the commander already closed, or a silent failure when the model or the link is gone and the trucks sit.

The Army's own topic statement asks for assured command and control of autonomous and semi-autonomous systems, for human-machine teaming under changing supervision and communications, and for verification that lets autonomy scale past a demo. A logistics agent that cannot show why it was allowed to move is not that.

## Solution

Assured Autonomy Ops Agent is a mission-support agent for resupply routes and schedules. It watches weather, route status, inventory, and communications. On a disruption it proposes a new schedule. Inside the commander's rules, a fully cleared plan can execute. Anything that only bends a waivable rule waits for one tap: approve, deny, or override. A hard rule, such as a no-go route or a reserve floor, cannot be tapped through.

The same loop is the commercial product. Swap the rule pack and the nodes and it schedules disaster commodities, port clearance, or depot replenishment. It does not practice medicine and it does not sit in the Army medical research portfolio. Class I and Class III in the exercise are rations, water, and fuel.

## Assurance approach

Permission is not inside the model.

1. Grok proposes a plan as JSON. The call uses the xAI Responses API, `store: false`, the model name from the environment, and a short timeout. Two failures and the call stops.
2. A deterministic function recomputes confidence from coverage, risk margin, weather, and communications. The number the model reports is displayed and is not the gate.
3. A deterministic validator scores every plan, including the fallback and the baseline, against the commander's ROE. Disposition is cleared, waivable, or blocked.
4. Cleared plans auto-execute only in "execute within bounds" mode. Propose-only mode always waits.
5. Override requires a written justification and is refused when any check is hard.
6. Every one of those events is appended to a hash chain. The console can tamper a copy and show the break without touching the live log.
7. If the model or the link drops, the deterministic planner produces a feasible schedule under the same validator. The status strip shows retry, then fallback.

The design trade is deliberate. We gave up the option for the model to dispatch a truck itself. We kept the model's ability to propose, including a proposal we expect to reject. Assurance and availability stay up when the proposal is bad or missing.

## Dual-use value

Defense: distribution and contested logistics at brigade and below, as a decision-support subsystem a sustainment cell can run beside a common operating picture. The soldier still owns hard constraints.

Commercial: the same planner, validator, ROE document, and audit format schedule relief supplies when roads close and radios are spotty. A civilian rule pack swaps no-go corridors for hazmat limits and closed highways. One product, two rule packs, no separate assurance stack.

Army value we will actually claim from this build, all of it simulated and tested:

- Every execute path goes through the validator. There is no side door.
- Override of a hard constraint succeeds zero times in the test suite.
- The deterministic planner does not select a closed route or Corridor Red when MSR North is down.
- A tampered audit copy fails verification. The live chain does not.
- The three-minute scenario completes with the network stubbed out.
- A model response that names the no-go route is blocked even when the HTTP call succeeds.

We will not claim a percentage improvement in convoy throughput. We have not measured one.

## Transition path

Current state is about TRL 4: a software prototype demonstrated in a simulated relevant scenario. The RFI's expectation is about TRL 6. We will say 4.

Next step after CES, if the Army wants it: connect the feed adapters to an unclassified sustainment picture in a staff exercise, with the validator and audit unchanged. That is the relevant-environment demonstration. A unit logistics rehearsal comes after that, still with a human on the loop for waivable rules.

Interfaces a third party can implement without our engineers in the room: world JSON, plan JSON, ROE JSON, validation report, audit event. Replacing Grok is a planner function. The prototype is MIT licensed so the government can read, run, and modify this code. Production rights, including any right to repair beyond the prototype, would be negotiated. We are not offering a lock-in around the validator.

Authorities the RFI itself lists for a later conversation, none of them promised by the prize: 10 U.S.C. §§ 4114, 4022, 4023, 4001, 4021, 3458, and 15 U.S.C. §§ 3703 and 638. The company can obtain a CAGE code for payment. It is not required to register.

Interoperability is the largest live-pitch weight in the RFI (35 percent), ahead of Army value and the trade study (25) and technical maturity (20). The pitch should spend its time on the contract between proposer and validator, not on a tour of the map.

## Three-minute demo script

Say this while the console plays. Auto-decide is on, so the beat lands even if a tap is missed. Tap Override during the decision beat if you want the log to name the commander instead of the timer.

| Clock | Say |
| --- | --- |
| 0:00 | This is an unclassified exercise. Two packages are already on an approved plan. The chain is open. |
| 0:30 | MSR North closes before they leave the hub. Weather is on the advisory. Ridge is hard to reach. |
| 1:05 | The first replan wants Corridor Red. The model is confident. Confidence is not permission. |
| 1:25 | The validator blocks it. No-go, and the risk is past the hard ceiling. I cannot override that. |
| 1:45 | The model path times out. The deterministic planner picks up the same rules. |
| 2:05 | Alt Ridge is legal but the weather and the degraded radio are waivable. It will not move itself. |
| 2:20 | I override, with a reason, and only for those holds. The shortcut stays dead. |
| 2:50 | The chain verifies. Change one line in a copy and it breaks. |

If the laptop stays in the bag, tell the same story in order: disruption, blocked shortcut, fallback, override, hash. Offer to show the tests that lock those outcomes.

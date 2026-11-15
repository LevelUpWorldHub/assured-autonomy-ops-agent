# Assured Autonomy Ops Agent

Unclassified simulated mission-support console for contested logistics. A planner (Grok, when configured, or a deterministic fallback) proposes resupply routes and schedules. A deterministic validator checks every plan against commander rules before anything can move. Waivable holds can be overridden in one tap. Hard blocks cannot. Every proposal, rejection, fallback, and decision is written to a hash-chained audit log.

Built by Level Up Inc (Mark Yukhimets, U.S. small business) as a working demo for Army xTech|Live at CES 2027, topics Scaling Assured Autonomy for Operational Use and Artificial Intelligence and Machine Learning.

This is notional training data for Exercise Steadfast Haul in fictional AO Copper. It is not a real operation and not for operational use.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional; the scenario runs with no key
npm run dev
```

Open [http://127.0.0.1:3847](http://127.0.0.1:3847).

- **Play 3-minute scenario** runs the pitch script with no network: a route closes, an unconstrained shortcut is blocked, the model path times out, the deterministic planner offers an alternate, and the commander override is logged. With auto-decide on, the override is applied if nobody taps it.
- **Step** walks the same beats.
- **Monitor** injects disruptions, asks Grok, refreshes Open-Meteo, and proposes the blocked shortcut on demand.

```bash
npm test          # vitest, no network
npm run lint
npm run build
npm start         # production, port 3847
```

## Deploy

The app is a Next.js project and deploys on Vercel with no database. Set `XAI_API_KEY` and, if you want a model other than the default, `XAI_MODEL` in the Vercel project environment. Leave the key unset and Ask Grok still returns a validated deterministic plan.

## What a person still has to do

The software does not submit the quad chart, register the company, or book CES.

- Paste `docs/QUAD_CHART.md` into the official `Template_xTech_Live_CES_Quad_Chart.pptx` on Valid Eval. Other formats are not reviewed. Deadline on the RFI is **5:00 PM ET / 2:00 PM PT on November 24, 2026**.
- Complete the Valid Eval registration. A CAGE code is not required at registration. It is required later to process a payment. Add the company address, phone, and email. This repo does not invent those.
- The published RFI says live pitches may not use presentation software or applications. Confirm with the xTech program office before planning to drive this console during the five-minute pitch. The script in `docs/PITCH.md` can be delivered verbally. The console is the prototype for side discussions and for a recording.
- Bring a printed quad chart. Pitches are public. Keep the demo on the simulated data in this app.
- Obtain a CAGE code before any prize payment. Travel and CES registration are not funded by xTech.
- Replace the notional cost range in the quad chart with a company estimate before submission. It is not a bid.
- Do not claim TRL 6. This build is a simulated software prototype, about TRL 4.

Competition page: https://xtech.army.mil/competition/xtechlive-at-ces-2027/

RFI: https://xtech.army.mil/wp-content/uploads/2026/11/FINAL_xTechLive_at_CES_2027_RFI.pdf

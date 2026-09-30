# Adding more controller brands

**Research only — no adapters were built, deliberately.** Findings as of
September 2026.

---

## Bottom line

**Two of the three most-installed commercial brands cannot be integrated
at all**, and the third requires a paid subscription and a customer
willing to authorise us. Writing adapters against any of them today
would mean shipping payment-grade code that has never once been run.

The honest answer for Rain Bird ESP, Hunter ICC and Toro boxes on a wall
is the **manual controller** support added alongside this research: the
person tells Driplin what the timer is set to, and Driplin does
everything else — rules, instructions, vendor routing, proof, reports.

---

## Rain Bird

### LNK WiFi module (residential) — ✗ cannot be done

Rain Bird publishes no official API. Community libraries exist
(`pyrainbird`, `node-rainbird`) built by reverse engineering, and Home
Assistant ships an integration on top of them.

**The blocker is architectural, not legal.** That API is
**local-network only** — it talks directly to the module's IP address on
the customer's LAN and has no cloud endpoint at all. Driplin is a cloud
service. There is no route from our servers to a module sitting behind
an HOA's router, and no amount of implementation work creates one.

Also worth knowing: the module accepts **one request at a time**, so
polling it would fight with whoever is using the Rain Bird app.

### IQ4 (commercial central control) — ⚠️ possible, with conditions

This is the real candidate, and it is squarely in Driplin's market:
large HOAs and commercial sites already running IQ-compatible
controllers.

- A genuine cloud API: JSON over HTTPS, `iq4server.rainbird.com`
- Rain Bird markets it explicitly for third-party and building-management
  integration
- Documented operations lean **read**: flow data, alarms, schedule
  monitoring

**Three conditions before anything can be built:**

1. An **API subscription must be purchased**
2. The API user must hold the **Owner** role on the account
3. The **company must authorise third-party API access**

> ⚠️ **The unanswered question that decides its value:** Rain Bird's own
> material describes retrieving data — flow, alarms, program visibility.
> It does not clearly state that a third party can **write** a schedule.
> If IQ4's API is read-only, Driplin gets monitoring but not automatic
> correction, which is the same position as Hydrawise. Worth asking
> before paying for a subscription.

## Toro — ✗ no public API

- **Evolution** connects through a proprietary *SMRT Logic* gateway to
  Toro's own cloud. No published API, no developer portal.
- **Tempus / Tempus Pro** have WiFi and a mobile app. No public API.

Community attempts exist in the Home Assistant forums; none produced a
working integration.

## Hunter

Already supported via **Hydrawise**, read-only — their public API cannot
write schedules, so every Hunter correction routes to a person. Hunter's
commercial platform (**Centralus**) was not investigated and is the
obvious next thing to look at, since it sits in the same commercial tier
as Rain Bird IQ4.

---

## What this means for the product

**The manual-controller path is not a stopgap. For Rain Bird ESP, Hunter
ICC and Toro, it is the only thing that can ever work**, because those
controllers have no network at all. That reframes it from a lesser
feature into the primary one for a large share of the market.

It also sharpens the pitch. Driplin's claim is not "we control your
sprinklers" — for much of the market it cannot be. It is: *we know the
rules, we tell you exactly what to change, we route it to whoever does
the work, and we keep the proof.* Automatic correction is the bonus
where the hardware allows it.

## Recommended order

1. **Ask the first ten prospects what hardware is on their common
   areas.** This research narrows the question but cannot answer it. If
   most say ESP or ICC, the manual path is the product and no adapter is
   worth building.
2. **If IQ4 comes up repeatedly**, ask Rain Bird the write question
   above before buying a subscription.
3. **Look at Hunter Centralus** if Hunter commercial hardware is common.
4. **Build nothing speculatively.** Every one of these requires a
   customer account to test against; an adapter written without one is
   untested code in the part of the system that changes a customer's
   irrigation.

---

## Sources

- [pyrainbird](https://github.com/allenporter/pyrainbird) · [node-rainbird](https://github.com/bbreukelen/node-rainbird) · [Home Assistant Rain Bird integration](https://www.home-assistant.io/integrations/rainbird/) (local-only, reverse engineered)
- [Rain Bird LNK WiFi module](https://ww3.rainbird.com/products/lnk-wifi-module)
- [Rain Bird IQ4 BMS / API integration](https://www.rainbird.com/professionals/iq4-product-development-update-new-bms-Integration) · [IQ4 API brochure](https://www.rainbird.com/sites/default/files/media/documents/2023-10/iq4_api_brochure.pdf)
- [Toro Tempus](https://sites.toro.com/tempus/) · [Toro Evolution / SMRT Logic discussion](https://community.home-assistant.io/t/toro-evolution-irrigation-controller-via-smrt-logic-gateway/356387)

Retrieved September 2026. Vendor APIs and partner terms change;
re-verify before committing engineering time.

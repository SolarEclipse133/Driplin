# Integrating with HOA / property-management platforms

**Research only — nothing here has been built.** Findings as of
September 2026. Every claim is sourced; where a number could not be
confirmed from the vendor itself, it says so.

---

## Bottom line

**AppFolio first, and not through the marketplace.** AppFolio has a
free, unapproved integration path that needs no partnership, no
application, and no fee — only a customer willing to click a few
buttons. That makes it the only one of the three a small team can
prove out without a sales cycle.

**Vantaca second.** It has the best-documented API of the three and the
richest data for what Driplin does (work orders, violations, vendors),
but access is granted per customer by a human at Vantaca, and its IP
whitelisting requires an architecture change on our side (see
[Static IPs](#static-ips-the-one-real-blocker)).

**CINC Systems third, and only with a customer already in hand.** Over
125 REST APIs exist, but there is no public documentation, no published
access process, and no pricing. The Swagger definition lives *inside a
customer's own instance* — meaning you cannot evaluate the API until a
customer shows it to you.

None of the three is a weekend's work. The honest range is **2–4 weeks
of engineering per platform** once access exists, and **access is the
long pole, not code.**

---

## What Driplin actually needs

Grounding the estimates. From a PMS, Driplin needs:

| Need | Why | Priority |
|---|---|---|
| Association / property list with **street addresses** | The street number determines the watering day in every Central Texas jurisdiction. This is the whole ballgame. | Required |
| Unit counts | Water-savings estimates and reporting | Required |
| Board / manager contacts | Who receives the board report | Nice to have |
| Vendor list | Pre-populating landscapers for work orders | Nice to have |
| **Write back** a violation or work order | Puts Driplin's findings into the workflow the manager already lives in. This is the feature that makes Driplin sticky. | High value |

Note the asymmetry: reading is easy and cheap everywhere. **Writing is
what is gated**, on every platform, in every pricing tier. Plan the
product around that.

---

## AppFolio

### Two completely different doors

This is the single most useful finding of this research, and it is not
obvious from AppFolio's own marketing.

**1. The Stack Marketplace (the front door).** A formal partnership:
application, security compliance questionnaire, compliance review,
integration testing, then a marketplace listing. AppFolio's own page
confirms the process and the security questionnaire but publishes no
fees or timeline.

> ⚠️ A third-party integration vendor (Propexo) states this path costs
> **$25,000–$50,000 annually**, may carry revenue share, and takes
> **3+ months** from initiation to signed contract. **This figure is
> not confirmed by AppFolio** and comes from a company that sells an
> alternative to doing it yourself. Treat it as a rough order of
> magnitude to verify, not a quote.

**2. The Database API (the side door).** Direct API access with **no
partnership approval and no marketplace listing required**. The
customer creates a user with the *Developer Admin* role in their
AppFolio Developer Space and hands over three credentials — Developer
ID, Client ID, Client Secret. That's it.

The catch is tier-gating:

| AppFolio tier | API access |
|---|---|
| Core | **None** |
| Plus | Read-only |
| Max | Read **and** write |

**This is the key risk.** Published community-association rates are
Core at ~$0.80/unit/month and Plus at ~$0.85/unit/month — and **no Max
rate is published for community associations at all.** If HOA
customers are typically on Core, Driplin gets nothing; if they are on
Plus, Driplin can read but cannot write violations back. *Whether Max
is even offered for community associations is an open question and the
first thing to ask AppFolio.*

### Data available

The Stack API spans 40+ endpoints, and the community-association
coverage is genuinely good: **Community Associations, CA Units, CA
Board Members, CA Homeowners, CA Violations, CA Rules**, plus
**Work Orders** and **Vendors**. Work Orders and Vendors support
create/update; most other endpoints are read.

> A competitor's blog (Rentvine) claims AppFolio's API is "one-way data
> export only" and blocks rent payments, tenant screening, and renters
> insurance. The write-capable endpoints listed on AppFolio's own
> partner API page contradict the blanket "one-way" claim. The
> category blocks are plausible and self-serving on AppFolio's part,
> but none of them touch irrigation compliance. **Verify directly;
> don't plan around a competitor's characterization.**

### Webhooks

Yes — and properly done. AppFolio signs webhooks with **JWS
(RSASSA_PSS_SHA_256)**, with public keys at
`https://api.appfolio.com/.well-known/jwks.json`. A `work_order_updates`
topic is documented by example. AppFolio publishes signature-verification
examples in Node, Go, Ruby and Python. A sandbox with synthetic events
(valid, malformed, duplicate, delayed) is available to partners.

Note the example repo is **archived**, and full webhook docs are
partner-internal — so webhooks likely belong to the *marketplace* path,
not the free Database API path. Worth confirming.

### Effort

**~2 weeks** for read-only sync against the Database API, assuming a
cooperative customer on Plus. Add **1–2 weeks** for write-back and
webhook verification, which probably also means the paid path.

---

## Vantaca

### Access

There is a real, documented, public API surface: base URL
`https://api.vantaca.net`, an **OpenAPI 3.0 spec (v3.8.0) published on
SwaggerHub**, and **75 operations** grouped into `/read/`, `/write/`
and `/AP/`.

Authentication is **HTTP Basic plus three required parameters on every
endpoint — `company`, `login`, `pwd`.** That is dated design (a
password in every request), but it is at least simple and documented.

Access is **per customer, by a human**: a Vantaca customer authorizes a
vendor to reach *their* dataset, and Vantaca provisions scoped
credentials. Vendors email **`vendorsupport@vantaca.com`** to have an
API user created. There is **no self-serve provisioning**, and no
published API pricing — it is sold as a platform capability to
management companies.

### Data available

The best fit of the three for Driplin's actual job: **associations,
homeowner accounts, accounting/ledgers, work orders, violations,
architectural requests (ARC), and vendor management** — with genuine
`/write/` endpoints, not just reads.

A compliance violation and a landscaper work order are *native
concepts* here. Driplin's output would land in the manager's existing
workflow rather than beside it.

### Webhooks

**None documented.** No event-driven or push mechanism appears in the
public profile or Vantaca's own materials — request/response REST over
HTTPS only. **Assume polling**, which means a scheduled sync job (we
already run one nightly for the water-supply indicators, so this fits
the existing shape).

### Effort

**~2–3 weeks**, plus the IP work below. The documented OpenAPI spec is
worth a lot — it is the only one of the three we could generate a
client from before talking to anybody.

---

## CINC Systems

### First: there are two companies called CINC

**This will waste your time if nobody warns you.**

- **CINC Systems** — `cincsystems.com` — HOA / community association
  management. **This is the relevant one.**
- **CINC (CINC Pro)** — `public.cincapi.com`, `integrations@cincpro.com`
  — a **real-estate agent CRM**. Its public API exposes leads, agents,
  deals and listings. **Nothing to do with HOAs.**

Search results conflate them constantly, and the *publicly documented*
API — the one that looks so promising — is the wrong company's. I
verified both directly.

### Access

CINC Systems describes itself as "the only open platform serving
community association management companies" and has released **125+
RESTful APIs** covering collections, payments, vendor management,
ticketing, resale documents and reserve studies. It serves 20,000+
associations and 2 million homes.

But: **no public documentation, no published access process, no
pricing.** Their own announcement gives none of it. The route is
"contact the partnerships team."

One concrete and telling detail: the Swagger definition is reportedly
served from inside a customer's own instance, at
`https://<customer>.cincsys.com/api/swagger`. **You cannot evaluate this
API without a customer who already has CINC.** That single fact sets
the order of operations — sign the customer first, then integrate.

### Webhooks

Unknown. Not mentioned anywhere public.

### Effort

**Unestimable until access exists.** Once documented: assume **2–4
weeks**, with wide error bars.

---

## Cross-cutting engineering findings

### Static IPs: the one real blocker

**Vantaca requires one or more whitelisted IP addresses per credential
set.** Driplin runs on Vercel serverless functions, which have **no
stable egress IP**. This is not a detail to discover during
implementation — it is an architecture decision:

1. **Vercel dedicated egress IPs** — available on higher plans; cleanest
   but costs money and locks us further into Vercel.
2. **Route PMS calls through a small fixed-IP proxy** — a cheap VPS or a
   managed static-IP proxy service. Adds a hop and a thing to operate,
   but is cheap and portable.
3. **Move the sync job off Vercel** — a small always-on worker that owns
   all PMS traffic. The nightly indicator job could live there too.

Option 3 is probably where this ends up if more than one integration
ships, but option 2 is the cheapest way to prove Vantaca works.

### Per-customer credentials, not one API key

All three platforms grant access **per customer**, not per vendor.
Driplin would hold a distinct credential set for every management
company it integrates with — the same shape as the existing
`vendor_credentials` table (one row per org per vendor), which extends
naturally.

### ⚠️ Secrets handling — this raises the stakes

Flagging this against our standing rule that nothing is ever committed
in plaintext. Nothing here changes that rule, and no research in this
document requires a new secret. But it does change the risk if we
build:

Today `vendor_credentials.api_key` is stored **as plaintext in a
row-level-secured column**, relying on RLS and Supabase's
encryption at rest, with column-level encryption noted in migration
0003 as something to add later. That is a defensible MVP position for a
**sprinkler timer API key** — the worst case is someone reschedules a
lawn.

A Vantaca or AppFolio credential is a different category of secret. It
reaches an HOA's **homeowner ledgers, accounts payable, and board
records**. The blast radius of a leak is a management company's entire
book of business, not a lawn.

**Recommendation: column-level encryption stops being "later" and
becomes a prerequisite for the first PMS integration that ships.** It
should be done before the first credential is stored, not after —
retrofitting encryption onto live credentials means a migration plus a
forced re-entry by every customer.

Also note Vantaca's Basic-auth scheme sends `pwd` on **every single
request**, so those credentials must never reach a log, an error
message, or a Sentry breadcrumb.

### Unified APIs don't help here

Aggregators like Propexo offer one endpoint across many property
systems and would, in principle, remove per-platform work. But their
coverage is **multifamily rental** — AppFolio, Yardi, RealPage,
Entrata, Buildium, ResMan, Rent Manager. **Neither Vantaca nor CINC
Systems appears in their coverage**, and those two are the HOA-native
platforms Driplin's customers actually use. An aggregator would buy
AppFolio access we can already get free, and not the two that are hard.

---

## Recommended order

1. **Ask AppFolio one question before anything else:** *is the Max tier
   (read/write API) offered for community associations, and what do
   real HOA customers run?* The answer determines whether the free path
   is a real product or a read-only demo.
2. **Build nothing until a customer asks.** All three platforms grant
   access per customer. A signed HOA management company is the key that
   opens every one of these doors; without one there is nothing to
   integrate against — and for CINC, literally nothing to read.
3. **Prove the pattern once, on AppFolio's free Database API**, read-only,
   with one cooperative customer. Cheapest possible test of whether
   PMS-sourced property data is even worth the trouble.
4. **Do the static-IP work only when Vantaca is real**, and prefer the
   cheap proxy first.
5. **Do the credential-encryption work before step 3 ships.**

---

## What I could not verify

Stated plainly so nobody treats this document as more settled than it is:

- AppFolio Stack marketplace **fees and timeline** — third-party figure
  only, unconfirmed by AppFolio.
- Whether **AppFolio Max exists for community associations**.
- Whether **AppFolio webhooks are available on the free Database API
  path** or marketplace-only.
- **Vantaca API pricing**, rate limits, and whether webhooks exist at all.
- **Everything about CINC Systems' commercial terms** — cost, approval
  criteria, timeline, and whether an independent developer can get
  documentation without a customer.

Each of these is a question for a sales or partnerships conversation,
not something more searching will resolve.

---

## Sources

- AppFolio — [Become a Partner](https://www.appfolio.com/stack/become-a-partner) · [Stack APIs](https://www.appfolio.com/stack/partners/api) · [Stack marketplace](https://www.appfolio.com/services/stack) · [webhook JWS examples](https://github.com/appfolio/stack-webhook-jws-examples)
- [Propexo — AppFolio integration & partnership](https://docs.propexo.com/pms-guidance/appfolio/integration-and-partnership) (third-party; source of the fee and timeline figures) · [Propexo unified API coverage](https://propexo.com/unified-api/)
- [Rentvine — "Is AppFolio's API actually open?"](https://www.rentvine.com/blog/appfolio-api-restrictions) (competitor; treat with care)
- Vantaca — [API surface profile, API Evangelist](https://github.com/api-evangelist/vantaca) · [Partner ecosystem](https://www.vantaca.com/partners) · [Why API capabilities matter](https://www.vantaca.com/vantaca-faq/why-do-api-capabilities-matter)
- CINC Systems — [Software partners](https://cincsystems.com/cinc-software-partners) · [Open platform / new APIs announcement](https://cincsystems.com/news/openplatform)
- CINC Pro (**the other CINC**) — [public API docs](https://public.cincapi.com/v2/docs/)
- AppFolio tier/API gating and community-association rates — [AppFolio pricing 2026](https://costbench.com/software/property-management/appfolio/) · [AppFolio pricing per unit](https://appfoliopricing.com/)

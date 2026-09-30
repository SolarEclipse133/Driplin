<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tests

`npm test` runs the suite (vitest). Run it before committing; CI runs it
on every push.

The watering-day tables in `lib/jurisdictions/` are the most
safety-critical code in this repository. A wrong table does not merely
fail to help — Driplin rewrites a customer's controller onto a day their
city prohibits and reports success. That has happened: Austin and
Leander both shipped tables that looked entirely plausible and were
wrong for commercial accounts.

Every expectation in `lib/jurisdictions/watering-days.test.ts` is a
quotation from a utility, cited in the test. **If one fails, do not
adjust the test to match the code.** Re-read the city's published
schedule and work out which side is wrong.

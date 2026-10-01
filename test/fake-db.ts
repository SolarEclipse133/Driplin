/**
 * An in-memory stand-in for Supabase, good enough to run the real
 * nightly pipeline.
 *
 * WHY THIS EXISTS: every bug found in this codebase by hand lived in the
 * WIRING -- a shared function whose two callers wanted opposite things, a
 * variance honoured in the sweep but not in the single check, a cached
 * schedule judged long after it could be trusted. Unit tests on pure
 * modules cannot see any of that, because none of it is in a pure module.
 *
 * WHAT IT DOES NOT DO, and must not be trusted for:
 *   - row-level security. Every read and write here succeeds.
 *   - CHECK constraints, foreign keys, NOT NULL, or column types. A row
 *     the real database would reject is accepted silently.
 *   - SQL semantics beyond the handful of operators below.
 *
 * So a green run here means "the parts fit together", not "this works
 * against Postgres". Constraints and policies are verified by running the
 * real thing against a real database, which is a separate exercise.
 */

export interface Row {
  [column: string]: unknown;
}

/** How an embedded select like `properties(name)` is resolved. */
interface Relation {
  table: string;
  /** Column on THIS table holding the other table's id. */
  localKey?: string;
  /** Column on the OTHER table holding this table's id. */
  foreignKey?: string;
  many: boolean;
}

const RELATIONS: Record<string, Record<string, Relation>> = {
  controllers: {
    properties: { table: "properties", localKey: "property_id", many: false },
    cached_schedules: {
      table: "cached_schedules",
      foreignKey: "controller_id",
      many: false,
    },
  },
  properties: {
    controllers: { table: "controllers", foreignKey: "property_id", many: true },
    organizations: { table: "organizations", localKey: "org_id", many: false },
  },
  work_orders: {
    properties: { table: "properties", localKey: "property_id", many: false },
    vendors: { table: "vendors", localKey: "vendor_id", many: false },
    controllers: { table: "controllers", localKey: "controller_id", many: false },
  },
};

/** Split "a, b, rel(x, y), c" into top-level parts. */
function splitColumns(spec: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of spec) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

let idCounter = 0;
const newId = () => `fake-${++idCounter}`;

export interface FakeDb {
  tables: Record<string, Row[]>;
  /** Every write, in order, for asserting on what the code did. */
  log: { table: string; op: "insert" | "update" | "upsert" | "delete"; row: Row }[];
  from(table: string): Builder;
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  /** Rows of one table, for convenience in assertions. */
  rows(table: string): Row[];
}

interface Filter {
  op: "eq" | "is" | "not" | "in" | "gte" | "lte";
  column: string;
  value: unknown;
}

// Deliberately loose: this mimics a fluent client whose builder is both
// thenable and chainable, which no clean type captures.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Builder = any;

export function fakeDb(
  seed: Record<string, Row[]> = {},
  userId: string | null = "user-1"
): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }
  const log: FakeDb["log"] = [];

  const db: FakeDb = {
    tables,
    log,
    rows: (table) => tables[table] ?? [],
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
    },
    from(table: string) {
      tables[table] ??= [];
      const filters: Filter[] = [];
      let selectSpec = "*";
      let limitCount: number | null = null;
      let orderBy: { column: string; ascending: boolean } | null = null;
      let pending:
        | { op: "insert"; rows: Row[] }
        | { op: "update"; patch: Row }
        | { op: "upsert"; rows: Row[] }
        | { op: "delete" }
        | null = null;

      const passes = (row: Row) =>
        filters.every((f) => {
          const actual = row[f.column];
          switch (f.op) {
            case "eq":
              return actual === f.value;
            case "is":
              return f.value === null
                ? actual === null || actual === undefined
                : actual === f.value;
            case "not":
              // Only `.not(col, "is", null)` is used.
              return actual !== null && actual !== undefined;
            case "in":
              return (f.value as unknown[]).includes(actual);
            case "gte":
              return String(actual) >= String(f.value);
            case "lte":
              return String(actual) <= String(f.value);
          }
        });

      /** Attach embedded relations named in the select spec. */
      const project = (row: Row): Row => {
        if (selectSpec === "*" || !selectSpec.includes("(")) return { ...row };
        const out: Row = { ...row };
        for (const part of splitColumns(selectSpec)) {
          const match = /^(\w+)\s*\(([\s\S]*)\)$/.exec(part);
          if (!match) continue;
          const [, relName] = match;
          const rel = RELATIONS[table]?.[relName];
          if (!rel) continue;

          const other = tables[rel.table] ?? [];
          const linked = rel.localKey
            ? other.filter((o) => o.id === row[rel.localKey!])
            : other.filter((o) => o[rel.foreignKey!] === row.id);
          out[relName] = rel.many
            ? linked.map((l) => ({ ...l }))
            : (linked[0] ? { ...linked[0] } : null);
        }
        return out;
      };

      const selected = () => {
        let rows = tables[table].filter(passes);
        if (orderBy) {
          const { column, ascending } = orderBy;
          rows = [...rows].sort((a, b) => {
            const av = String(a[column] ?? "");
            const bv = String(b[column] ?? "");
            return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (limitCount !== null) rows = rows.slice(0, limitCount);
        return rows.map(project);
      };

      /** Run whatever mutation is pending and return the rows it touched. */
      const commit = (): Row[] => {
        if (!pending) return selected();

        if (pending.op === "insert") {
          const created = pending.rows.map((r) => ({ id: newId(), ...r }));
          tables[table].push(...created);
          for (const r of created) log.push({ table, op: "insert", row: r });
          return created.map((r) => ({ ...r }));
        }

        if (pending.op === "upsert") {
          const touched: Row[] = [];
          for (const r of pending.rows) {
            // Conflict on controller_id where present (cached_schedules),
            // otherwise on id.
            const key = "controller_id" in r ? "controller_id" : "id";
            const existing = tables[table].find((e) => e[key] === r[key]);
            if (existing) {
              Object.assign(existing, r);
              touched.push(existing);
              log.push({ table, op: "upsert", row: { ...existing } });
            } else {
              const created = { id: newId(), ...r };
              tables[table].push(created);
              touched.push(created);
              log.push({ table, op: "upsert", row: { ...created } });
            }
          }
          return touched.map((r) => ({ ...r }));
        }

        if (pending.op === "update") {
          const hits = tables[table].filter(passes);
          for (const h of hits) {
            Object.assign(h, (pending as { patch: Row }).patch);
            log.push({ table, op: "update", row: { ...h } });
          }
          return hits.map((r) => ({ ...r }));
        }

        // delete
        const hits = tables[table].filter(passes);
        tables[table] = tables[table].filter((r) => !passes(r));
        for (const h of hits) log.push({ table, op: "delete", row: { ...h } });
        return hits;
      };

      const builder: Builder = {
        select(spec = "*") {
          selectSpec = spec;
          return builder;
        },
        insert(rows: Row | Row[]) {
          pending = { op: "insert", rows: Array.isArray(rows) ? rows : [rows] };
          return builder;
        },
        upsert(rows: Row | Row[]) {
          pending = { op: "upsert", rows: Array.isArray(rows) ? rows : [rows] };
          return builder;
        },
        update(patch: Row) {
          pending = { op: "update", patch };
          return builder;
        },
        delete() {
          pending = { op: "delete" };
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push({ op: "eq", column, value });
          return builder;
        },
        is(column: string, value: unknown) {
          filters.push({ op: "is", column, value });
          return builder;
        },
        not(column: string, _op: string, value: unknown) {
          filters.push({ op: "not", column, value });
          return builder;
        },
        in(column: string, value: unknown[]) {
          filters.push({ op: "in", column, value });
          return builder;
        },
        gte(column: string, value: unknown) {
          filters.push({ op: "gte", column, value });
          return builder;
        },
        lte(column: string, value: unknown) {
          filters.push({ op: "lte", column, value });
          return builder;
        },
        order(column: string, opts?: { ascending?: boolean }) {
          orderBy = { column, ascending: opts?.ascending !== false };
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        async single() {
          const rows = commit();
          return rows.length > 0
            ? { data: rows[0], error: null }
            : { data: null, error: { message: "No rows found" } };
        },
        async maybeSingle() {
          const rows = commit();
          return { data: rows[0] ?? null, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          const rows = commit();
          return Promise.resolve({
            data: rows,
            error: null,
            count: rows.length,
          }).then(resolve);
        },
      };

      return builder;
    },
  };

  return db;
}

/**
 * A minimal stand-in for the Supabase client.
 *
 * Only enough of the query builder to exercise the modules under test.
 * The point is to test OUR logic — what gets encrypted, what gets
 * upgraded, what never gets written — without a network or a database.
 */
export interface FakeRow {
  [column: string]: unknown;
}

export function fakeSupabase(tables: Record<string, FakeRow[]> = {}) {
  const writes: { table: string; op: string; row: FakeRow }[] = [];

  const client = {
    tables,
    writes,
    from(table: string) {
      tables[table] ??= [];
      const filters: [string, unknown][] = [];
      const matches = (row: FakeRow) =>
        filters.every(([col, val]) => row[col] === val);

      const builder: Record<string, unknown> = {
        select() {
          const rows = () => tables[table].filter(matches);
          const result = Promise.resolve({ data: tables[table], error: null });
          return Object.assign(result, builder, {
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            single: async () => ({ data: rows()[0] ?? null, error: null }),
          });
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        gte() {
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return builder;
        },
        async upsert(row: FakeRow) {
          const existing = tables[table].find(
            (r) => r.org_id === row.org_id && r.vendor === row.vendor
          );
          if (existing) Object.assign(existing, row);
          else tables[table].push({ ...row });
          writes.push({ table, op: "upsert", row });
          return { error: null };
        },
        update(patch: FakeRow) {
          const apply = () => {
            for (const row of tables[table].filter(matches)) {
              Object.assign(row, patch);
              writes.push({ table, op: "update", row: patch });
            }
            return { error: null };
          };
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return Object.assign(Promise.resolve(apply()), chain);
            },
          };
          return chain;
        },
        maybeSingle: async () => ({ data: tables[table].filter(matches)[0] ?? null, error: null }),
        single: async () => ({ data: tables[table].filter(matches)[0] ?? null, error: null }),
      };
      return builder;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any;
}

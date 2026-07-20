// A minimal chainable stub of the supabase-js query builder for the queries SupabaseGrantsDb
// and the sources loader use: from(t).select(c).eq(k,v)[.maybeSingle()] and
// from(t).insert(row) / .update(row).eq(k,v). Records calls per table for assertions.
export interface StubResult {
  data?: unknown;
  error?: { message: string } | null;
}

export interface QueryRecord {
  table: string;
  select?: string;
  insert?: unknown;
  update?: unknown;
  eq: [string, unknown][];
  or: string[];
  maybeSingle?: boolean;
}

class QueryStub implements PromiseLike<StubResult> {
  constructor(
    private readonly result: StubResult,
    private readonly rec: QueryRecord,
  ) {}
  select(cols: string): this {
    this.rec.select = cols;
    return this;
  }
  insert(row: unknown): this {
    this.rec.insert = row;
    return this;
  }
  update(row: unknown): this {
    this.rec.update = row;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.rec.eq.push([col, val]);
    return this;
  }
  neq(_col: string, _val: unknown): this { return this; }
  or(filter: string): this {
    this.rec.or.push(filter);
    return this;
  }
  limit(_n: number): this { return this; }
  order(_col: string, _opts?: Record<string, unknown>): this { return this; }
  maybeSingle(): Promise<StubResult> {
    this.rec.maybeSingle = true;
    return this.settle();
  }
  then<TResult1 = StubResult, TResult2 = never>(
    onfulfilled?: ((value: StubResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.settle().then(onfulfilled, onrejected);
  }
  private settle(): Promise<StubResult> {
    return Promise.resolve({ data: this.result.data ?? null, error: this.result.error ?? null });
  }
}

export class StubSupabaseClient {
  readonly records: Record<string, QueryRecord> = {};
  constructor(private readonly results: Record<string, StubResult> = {}) {}
  from(table: string): QueryStub {
    const rec: QueryRecord = { table, eq: [], or: [] };
    this.records[table] = rec;
    return new QueryStub(this.results[table] ?? {}, rec);
  }
}

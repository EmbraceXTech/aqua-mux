import { BenchmarkStore } from "@/lib/server/benchmark/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  let store: BenchmarkStore | undefined;
  try {
    store = new BenchmarkStore();
    return Response.json(store.read(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Benchmark history is temporarily unavailable." },
      { status: 503 },
    );
  } finally {
    store?.close();
  }
}

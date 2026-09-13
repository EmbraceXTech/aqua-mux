import type { Metadata } from "next";
import { BenchmarkView } from "@/components/benchmark/benchmark-view";
export const metadata: Metadata = {
  title: "Benchmark | AquaMux",
  description:
    "Compare verified LP fee collections by wallet, with transparent DEX and chain coverage.",
};
export default function BenchmarkPage() {
  return <BenchmarkView />;
}

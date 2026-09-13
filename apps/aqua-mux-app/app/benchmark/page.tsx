import type { Metadata } from "next";
import { BenchmarkView } from "@/components/benchmark/benchmark-view";
export const metadata: Metadata = {
  title: "Market scanner | AquaMux",
  description:
    "Compare live AMM pool market conditions across DEXes and chains with transparent source coverage.",
};
export default function BenchmarkPage() {
  return <BenchmarkView />;
}

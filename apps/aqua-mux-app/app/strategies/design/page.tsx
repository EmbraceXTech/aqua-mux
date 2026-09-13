import type { Metadata } from "next";
import { StrategyDesign } from "@/components/strategy-design/StrategyDesign";

export const metadata: Metadata = {
  title: "Strategy design preview | AquaMux",
  description:
    "An interactive strategy prototype with sample data and no wallet integrations.",
  robots: { index: false, follow: false },
};

export default function StrategyDesignPage() {
  return <StrategyDesign />;
}

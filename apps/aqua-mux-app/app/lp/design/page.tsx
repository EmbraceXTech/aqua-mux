import type { Metadata } from "next";
import { LPDesign } from "@/components/lp-design/LPDesign";

export const metadata: Metadata = {
  title: "Multi-LP design preview | AquaMux",
  description: "Interactive liquidity provision prototype. Sample data only.",
  robots: { index: false, follow: false },
};

export default function LPDesignPage() {
  return <LPDesign />;
}

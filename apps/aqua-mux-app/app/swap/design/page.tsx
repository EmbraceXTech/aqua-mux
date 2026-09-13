import type { Metadata } from "next";
import { SwapView } from "@/components/views/SwapView";

export const metadata: Metadata = {
  title: "Multi-swap design preview | AquaMux",
  description:
    "Interactive multi-in and multi-out swap prototype. Sample data only.",
  robots: { index: false, follow: false },
};

export default function SwapDesignPage() {
  return <SwapView />;
}

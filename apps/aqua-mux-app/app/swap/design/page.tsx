import type { Metadata } from "next";
import { SwapView } from "@/components/views/SwapView";

export const metadata: Metadata = {
  title: "1inch swap preview | AquaMux",
  description: "Interactive 1inch Classic Swap on Arbitrum.",
  robots: { index: false, follow: false },
};

export default function SwapDesignPage() {
  return <SwapView />;
}

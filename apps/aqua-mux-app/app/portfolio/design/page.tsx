import type { Metadata } from "next";
import { PortfolioDesign } from "./portfolio-design";

export const metadata: Metadata = {
  title: "Portfolio preview | AquaMux",
  description: "AquaMux portfolio design with interactive sample data.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PortfolioDesign />;
}

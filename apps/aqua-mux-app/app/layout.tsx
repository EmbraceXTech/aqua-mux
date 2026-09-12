import type { Metadata } from "next";
import "@fontsource-variable/geist";
import "./globals.css";
export const metadata: Metadata = {
  title: "AquaMux | One token. Many possibilities.",
  description:
    "Split one swap across a basket of tokens, or share liquidity across multiple 1inch Aqua strategies.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

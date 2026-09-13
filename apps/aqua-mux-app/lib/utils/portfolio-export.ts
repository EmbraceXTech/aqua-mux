import { network } from "@/lib/config";
import { positionStateLabel } from "./portfolio";
import type { PortfolioAsset, RecordedPosition } from "@/types/portfolio";

export function portfolioCsv(
  assets: PortfolioAsset[],
  positions: RecordedPosition[],
) {
  // Quote every cell and neutralize spreadsheet formulas in token metadata.
  const cell = (value: string) =>
    `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  const rows = [
    ["Record", "Asset", "Network", "Balance", "Status", "Range", "Fee percent"],
    ...assets.map((asset) => [
      "Wallet asset",
      asset.symbol,
      network(asset.chainId).name,
      asset.balance,
      "",
      "",
      "",
    ]),
    ...positions.map((position) => [
      "LP position",
      position.tokens.map((token) => token.symbol).join(" / "),
      network(position.chainId).name,
      "",
      positionStateLabel(position.state),
      position.range,
      position.feeBps === null ? "" : String(position.feeBps / 100),
    ]),
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export function downloadPortfolio(
  assets: PortfolioAsset[],
  positions: RecordedPosition[],
) {
  const url = URL.createObjectURL(
    new Blob([portfolioCsv(assets, positions)], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aquamux-portfolio.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

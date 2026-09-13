// Deliberately local fixtures. This prototype never requests a quote or a wallet.
export const demoTokens = [
  {
    symbol: "USDC",
    name: "USD Coin",
    mark: "$",
    color: "#2775ca",
    price: 1,
    balance: 8420.5,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    mark: "♦",
    color: "#687ce2",
    price: 2500,
    balance: 2.45,
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    mark: "₿",
    color: "#ed982c",
    price: 100000,
    balance: 0.085,
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    mark: "A",
    color: "#299bd5",
    price: 0.5,
    balance: 2400,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    mark: "⬡",
    color: "#305bd3",
    price: 15,
    balance: 85,
  },
  {
    symbol: "DAI",
    name: "Dai",
    mark: "◈",
    color: "#e9b33b",
    price: 1,
    balance: 1800,
  },
] as const;
export type Symbol = (typeof demoTokens)[number]["symbol"];
export type Mode = "multi-out" | "multi-in";
export type Side = "input" | "output";
export type Row = {
  symbol: Symbol;
  amount: string;
  fee: string;
  weight: string;
};
export type Draft = { input: Row[]; output: Row[]; exact: Side };
export const getToken = (symbol: Symbol) =>
  demoTokens.find((token) => token.symbol === symbol)!;
export const row = (symbol: Symbol, amount: string, weight = "50"): Row => ({
  symbol,
  amount,
  weight,
  fee: "0.05",
});
export function initialDrafts(): Record<Mode, Draft> {
  return {
    "multi-out": {
      input: [row("USDC", "2500", "100")],
      output: [row("ETH", "0.5997", "60"), row("WBTC", "0.009995", "40")],
      exact: "input",
    },
    "multi-in": {
      input: [row("ETH", "0.6", "60"), row("WBTC", "0.01", "40")],
      output: [row("USDC", "2498.75", "100")],
      exact: "input",
    },
  };
}
export const numeric = (value: string) =>
  /^\d*(\.\d*)?$/.test(value) &&
  value !== "" &&
  value !== "." &&
  Number.isFinite(Number(value))
    ? Number(value)
    : NaN;
export const formatAmount = (value: number) =>
  Number.isFinite(value) ? String(Number(value.toFixed(8))) : "";
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0,
  );

export function estimate(draft: Draft, mode: Mode, slippage: string) {
  const multi: Side = mode === "multi-in" ? "input" : "output";
  const estimated: Side = draft.exact === "input" ? "output" : "input";
  const errors: string[] = [];
  const slip = numeric(slippage);
  if (!(slip >= 0.01 && slip <= 5))
    errors.push("Set global slippage between 0.01% and 5%.");
  for (const side of ["input", "output"] as const) {
    if (draft[side].length === 0)
      errors.push(`Add at least one ${side} token.`);
    if (side !== multi && draft[side].length > 1)
      errors.push(`Keep one ${side} token in this mode.`);
  }
  if (
    new Set([...draft.input, ...draft.output].map((item) => item.symbol))
      .size !==
    draft.input.length + draft.output.length
  )
    errors.push("Choose a different token for each row.");
  for (const item of draft[multi]) {
    if (!(numeric(item.fee) >= 0 && numeric(item.fee) <= 3))
      errors.push(`Set the ${item.symbol} fee between 0% and 3%.`);
  }
  for (const item of draft[draft.exact]) {
    if (!(numeric(item.amount) > 0))
      errors.push(`Enter an amount greater than zero for ${item.symbol}.`);
  }
  const weights = draft[estimated].map((item) =>
    draft[estimated].length === 1 ? 1 : numeric(item.weight) / 100,
  );
  if (
    weights.some((weight) => !(weight > 0)) ||
    Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 0.000001
  )
    errors.push("Estimated-side allocations must be positive and total 100%.");
  const fee = (item: Row) => (numeric(item.fee) || 0) / 100;
  const value = (item: Row) =>
    (numeric(item.amount) || 0) * getToken(item.symbol).price;
  let amounts: Record<Side, number[]>;
  if (draft.exact === "input") {
    const available = draft.input.reduce(
      (sum, item) =>
        sum + value(item) * (multi === "input" ? 1 - fee(item) : 1),
      0,
    );
    amounts = {
      input: draft.input.map((item) => numeric(item.amount) || 0),
      output: draft.output.map(
        (item, i) =>
          (available * weights[i] * (multi === "output" ? 1 - fee(item) : 1)) /
          getToken(item.symbol).price,
      ),
    };
  } else {
    const required = draft.output.reduce(
      (sum, item) =>
        sum + value(item) / (multi === "output" ? 1 - fee(item) : 1),
      0,
    );
    amounts = {
      input: draft.input.map(
        (item, i) =>
          (required * weights[i]) /
          (multi === "input" ? 1 - fee(item) : 1) /
          getToken(item.symbol).price,
      ),
      output: draft.output.map((item) => numeric(item.amount) || 0),
    };
  }
  const total = (side: Side) =>
    draft[side].reduce(
      (sum, item, i) => sum + amounts[side][i] * getToken(item.symbol).price,
      0,
    );
  const inputTotal = total("input");
  const outputTotal = total("output");
  draft.input.forEach((item, i) => {
    const required =
      amounts.input[i] * (draft.exact === "output" ? 1 + (slip || 0) / 100 : 1);
    if (required > getToken(item.symbol).balance)
      errors.push(
        `Not enough demo ${item.symbol} balance${draft.exact === "output" ? " including slippage" : ""}.`,
      );
  });
  return {
    amounts,
    inputTotal,
    outputTotal,
    fees: inputTotal - outputTotal,
    errors,
    valid: errors.length === 0,
  };
}

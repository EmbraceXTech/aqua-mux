import {
  initialDrafts,
  liveTokens,
  row,
  type Draft,
  type LiveQuote,
  type Mode,
  type Row,
  type Side,
  type Symbol,
} from "./live-swap";

export type SwapDraftState = {
  mode: Mode;
  drafts: Record<Mode, Draft>;
  slippage: string;
};
export type TokenPickerTarget = { side: Side; index?: number };
export type SwapDraftAction =
  | { type: "mode"; mode: Mode }
  | { type: "slippage"; value: string }
  | { type: "exact"; side: Side; amounts?: LiveQuote["amounts"] }
  | {
      type: "patch";
      side: Side;
      index: number;
      values: Partial<Pick<Row, "amount" | "weight" | "fee">>;
    }
  | { type: "remove"; side: Side; index: number }
  | { type: "token"; target: TokenPickerTarget; symbol: Symbol };

export function createSwapDraftState(): SwapDraftState {
  return { mode: "multi-out", drafts: initialDrafts(), slippage: "0.5" };
}
export function isValidSlippage(value: string) {
  return (
    /^\d+(\.\d{1,2})?$/.test(value) &&
    Number(value) >= 0.01 &&
    Number(value) <= 5
  );
}
function rebalance(items: Row[]) {
  const share = Math.floor(100 / items.length);
  return items.map((item, i) => ({
    ...item,
    weight: String(i === items.length - 1 ? 100 - share * i : share),
  }));
}
export function swapDraftReducer(
  state: SwapDraftState,
  action: SwapDraftAction,
): SwapDraftState {
  if (action.type === "mode") return { ...state, mode: action.mode };
  if (action.type === "slippage") return { ...state, slippage: action.value };
  const draft = state.drafts[state.mode];
  const multi = state.mode === "multi-in" ? "input" : "output";
  let next: Draft;
  switch (action.type) {
    case "exact":
      if (action.side === draft.exact) return state;
      next = {
        ...draft,
        exact: action.side,
        [action.side]: draft[action.side].map((item, i) => ({
          ...item,
          amount: action.amounts?.[action.side][i] ?? "",
        })),
      };
      break;
    case "patch":
      next = {
        ...draft,
        [action.side]: draft[action.side].map((item, i) =>
          i === action.index ? { ...item, ...action.values } : item,
        ),
      };
      break;
    case "remove":
      if (
        action.side !== multi ||
        draft[action.side].length <= 1 ||
        !draft[action.side][action.index]
      )
        return state;
      next = {
        ...draft,
        [action.side]: rebalance(
          draft[action.side].filter((_, i) => i !== action.index),
        ),
      };
      break;
    case "token": {
      if (
        [...draft.input, ...draft.output].some(
          (item) => item.symbol === action.symbol,
        )
      )
        return state;
      const { side, index } = action.target;
      if (index === undefined) {
        if (
          side !== multi ||
          draft.input.length + draft.output.length >= liveTokens.length
        )
          return state;
        next = {
          ...draft,
          [side]: rebalance([...draft[side], row(action.symbol)]),
        };
      } else {
        if (!draft[side][index]) return state;
        next = {
          ...draft,
          [side]: draft[side].map((item, i) =>
            i === index ? { ...item, symbol: action.symbol, amount: "" } : item,
          ),
        };
      }
      break;
    }
  }
  return { ...state, drafts: { ...state.drafts, [state.mode]: next } };
}

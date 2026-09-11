import { instructions } from "@1inch/swap-vm-sdk";
import type { LPPair } from "../managed/config";
import { rawPriceRatio, type DenominatedPrice } from "../managed/primitives";
import { uint } from "./arithmetic";

const ONE = 10n ** 18n;
const sqrt = instructions.concentrate.bigintSqrt;
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Encode the final square-root bounds directly, rounding inward in either token order. */
export function encodePriceBounds(pair: LPPair) {
  if (pair.range.kind === "full") return undefined;
  const sorted = pair.baseToken.address < pair.quoteToken.address;
  const encode = (price: DenominatedPrice, up: boolean) => {
    const ratio = rawPriceRatio(price, pair.baseToken, pair.quoteToken);
    const n = (sorted ? ratio.numerator : ratio.denominator) * ONE * ONE;
    const d = sorted ? ratio.denominator : ratio.numerator;
    let root = sqrt(n / d);
    if (up && root * root * d < n) root++;
    return root;
  };
  const sqrtPriceMin = encode(
    sorted ? pair.range.lower : pair.range.upper,
    true,
  );
  const sqrtPriceMax = encode(
    sorted ? pair.range.upper : pair.range.lower,
    false,
  );
  if (
    sqrtPriceMin <= 0n ||
    sqrtPriceMin >= sqrtPriceMax ||
    sqrtPriceMax >= 2n ** 256n
  )
    throw new Error("Range cannot be represented by the deployed LP encoding.");
  return { sqrtPriceMin, sqrtPriceMax };
}

/** Spot before fee and finite-trade price impact, from the encoded virtual offsets. */
export function describeLPPrice(pair: LPPair): DenominatedPrice {
  const sorted = pair.baseToken.address < pair.quoteToken.address;
  const base = uint(pair.baseAmount, 248),
    quote = uint(pair.quoteAmount, 248);
  if (!base || !quote) throw new Error("LP reserves must be positive.");
  const bounds = encodePriceBounds(pair);
  let virtualBase = base,
    virtualQuote = quote;
  if (bounds) {
    const lt = sorted ? base : quote,
      gt = sorted ? quote : base;
    const { liquidity } = instructions.concentrate.computeLiquidityAndPrice(
      lt,
      gt,
      bounds.sqrtPriceMin,
      bounds.sqrtPriceMax,
    );
    const virtualLt = lt + (liquidity * ONE) / bounds.sqrtPriceMax;
    const virtualGt = gt + (liquidity * bounds.sqrtPriceMin) / ONE;
    virtualBase = sorted ? virtualLt : virtualGt;
    virtualQuote = sorted ? virtualGt : virtualLt;
  }
  const numerator = virtualQuote * 10n ** BigInt(pair.baseToken.decimals);
  const denominator = virtualBase * 10n ** BigInt(pair.quoteToken.decimals);
  const divisor = gcd(numerator, denominator);
  return {
    baseToken: pair.baseToken.address,
    quoteToken: pair.quoteToken.address,
    numerator: String(numerator / divisor),
    denominator: String(denominator / divisor),
  };
}

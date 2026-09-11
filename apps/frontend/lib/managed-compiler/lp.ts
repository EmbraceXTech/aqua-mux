import { Address as SdkAddress } from "@1inch/sdk-core";
import {
  AquaProgramBuilder,
  AquaXYCAmmStrategy,
  MakerTraits,
  Order,
} from "@1inch/swap-vm-sdk";
import { AquaProtocolContract } from "@1inch/aqua-sdk";
import { keccak256, toHex, type Hex } from "viem";
import { AQUA, KYC, NATIVE, SWAP_VM } from "../config";
import { strategyConfigSchema, type StrategyConfig } from "../managed/config";
import type { Call } from "../model";
import { uint } from "./arithmetic";
import { describeLPPrice, encodePriceBounds } from "./pricing";
export { describeLPPrice } from "./pricing";

export function compileLP(input: StrategyConfig, nonce: Hex, now: number) {
  const config = strategyConfigSchema.parse(input);
  if (config.family !== "lp")
    throw new Error(
      "MM is unavailable: no verified deployed directional encoding.",
    );
  if (!/^0x[0-9a-fA-F]{64}$/.test(nonce))
    throw new Error("A fresh 32-byte plan nonce is required.");
  return config.pairs.map((pair, index) => {
    for (const t of [pair.baseToken, pair.quoteToken]) {
      if (t.address === NATIVE)
        throw new Error(
          "LP registration requires wrapped native or ERC20 tokens.",
        );
    }
    const base = uint(pair.baseAmount, 248),
      quote = uint(pair.quoteAmount, 248);
    const actual = describeLPPrice(pair);
    if (
      BigInt(actual.numerator) * BigInt(pair.openingPrice.denominator) !==
      BigInt(pair.openingPrice.numerator) * BigInt(actual.denominator)
    )
      throw new Error(
        "Opening price does not match the encoded virtual reserves; refresh the reviewed configuration.",
      );
    const sorted = pair.baseToken.address < pair.quoteToken.address;
    const range = encodePriceBounds(pair);
    const curve = range
      ? AquaXYCAmmStrategy.newConcentrate(range)
      : AquaXYCAmmStrategy.new();
    const salt =
      BigInt(keccak256(toHex(`${nonce}:${index}`))) & ((1n << 64n) - 1n);
    const strategy = curve
      .withFeeTokenIn(pair.feeBps)
      .withTxOriginAccessToken(new SdkAddress(KYC))
      .withSalt(salt)
      .build();
    const builder = new AquaProgramBuilder();
    if (pair.programExpiresAt !== undefined) {
      if (pair.programExpiresAt % 1000 || pair.programExpiresAt <= now)
        throw new Error(
          "Maker expiry must be a future whole second in milliseconds.",
        );
      const deadline = BigInt(pair.programExpiresAt / 1000);
      if (deadline >= 2n ** 40n)
        throw new Error("Maker deadline exceeds the deployed instruction.");
      builder.deadline({ deadline });
    }
    for (const instruction of AquaProgramBuilder.decode(
      strategy,
    ).getInstructions())
      builder.add(instruction);
    const program = builder.build();
    const order = Order.new({
      maker: new SdkAddress(config.maker),
      traits: MakerTraits.default().with({ useAquaInsteadOfSignature: true }),
      program,
    });
    const tokens = sorted
      ? [pair.baseToken.address, pair.quoteToken.address]
      : [pair.quoteToken.address, pair.baseToken.address];
    const amounts = sorted ? [base, quote] : [quote, base];
    const data = AquaProtocolContract.encodeShipCallData({
      app: new SdkAddress(SWAP_VM),
      strategy: order.encode(),
      amountsAndTokens: tokens.map((t, i) => ({
        token: new SdkAddress(t),
        amount: amounts[i],
      })),
    }).toString() as Hex;
    return {
      hash: order.hash().toString() as Hex,
      app: SWAP_VM,
      tokens,
      amounts: amounts.map(String),
      program: program.toString() as Hex,
      strategy: order.encode().toString() as Hex,
      pair,
      encodedBounds: range
        ? {
            sqrtPriceMin: range.sqrtPriceMin.toString(),
            sqrtPriceMax: range.sqrtPriceMax.toString(),
          }
        : null,
      call: {
        to: AQUA,
        data,
        value: "0x0",
        label: `Register ${pair.baseToken.symbol} / ${pair.quoteToken.symbol}`,
      } as Call,
    };
  });
}

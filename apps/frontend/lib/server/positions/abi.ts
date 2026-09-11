import { parseAbi } from "viem";

// Matches vendored IAqua.sol and SwapVM.sol and installed SDKs 0.3.1/0.4.1.
// These event arguments are deliberately NOT indexed.
export const aquaObservationAbi = parseAbi([
  "event Shipped(address maker,address app,bytes32 strategyHash,bytes strategy)",
  "event Docked(address maker,address app,bytes32 strategyHash)",
  "event Pulled(address maker,address app,bytes32 strategyHash,address token,uint256 amount)",
  "event Pushed(address maker,address app,bytes32 strategyHash,address token,uint256 amount)",
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248 balance,uint8 tokensCount)",
]);
export const swapObservationAbi = parseAbi([
  "event Swapped(bytes32 orderHash,address maker,address taker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)",
]);

import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../lib/errors";
test("wallet errors exclude RPC credentials and serialized transactions", () => {
  const message =
    "Transaction creation failed.\n\nURL: https://rpc.example/private-credential\nRequest body: 0x" +
    "1".repeat(128);
  assert.equal(
    errorMessage(new Error(message)),
    "Transaction creation failed.",
  );
  assert.equal(
    errorMessage({ code: 4001, message: "Reject" }),
    "You declined the wallet request.",
  );
  assert.ok(
    !errorMessage(
      new Error("Failed at https://rpc.example/private-credential"),
    ).includes("private-credential"),
  );
  assert.ok(
    !errorMessage(new Error("Request body: 0x" + "1".repeat(128))).includes(
      "111111",
    ),
  );
});

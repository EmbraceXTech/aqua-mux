import { acquireReviewSandbox } from "../src/service/resources";
import { ReviewStore } from "../src/service/store";
import { requestFixture } from "./service-fixtures";
import { fingerprint } from "../src/service/contract";

// Controlled acquisition double pauses after durable registration and before returning.
const store = new ReviewStore(process.argv[2]);
const request = requestFixture("acquisition-crash");
store.insert(request.requestId, fingerprint(request), request);
await acquireReviewSandbox(
  request.requestId,
  new AbortController().signal,
  store,
  async (options) => {
    const identity = {
      id: "aquamux-runtime-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      owner: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      imageId: `sha256:${"a".repeat(64)}`,
    };
    options.onAcquiring(identity);
    process.send?.("registered-before-create");
    setInterval(() => {}, 1000);
    await new Promise(() => {});
    return { id: identity.id, identity };
  },
);

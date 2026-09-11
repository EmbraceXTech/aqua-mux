import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReviewStore } from "../src/service/store";
import {
  acquireReviewSandbox,
  recoverResources,
} from "../src/service/resources";
import { Reviews } from "../src/service/reviews";
import { requestFixture, stubReview } from "./service-fixtures";

const identity = {
  id: "aquamux-runtime-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  owner: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  imageId: `sha256:${"a".repeat(64)}`,
};

test("SIGKILL during acquisition leaves durable ownership for restart recovery", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "review-acquisition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "review.sqlite");
  const child = fork(
    new URL("./service-acquisition-child.ts", import.meta.url),
    [path],
    {
      execArgv: ["--import", "tsx"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  });
  const [message] = await once(child, "message", {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(message, "registered-before-create");
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  const store = new ReviewStore(path);
  assert.equal(store.get("acquisition-crash")?.error_code, "runner_restarted");
  assert.deepEqual(store.resources(), [identity.id]);
  const commands: string[][] = [];
  await recoverResources(store, async (args) => {
    commands.push(args);
    return Buffer.from("");
  });
  assert.deepEqual(commands, [["ps", "-a", "--format", "{{.Names}}"]]);
  assert.deepEqual(store.resources(), []);
  store.close();
});

test("acquisition receives cancellation signal and preserves ownership on uncertain cleanup", async () => {
  const store = new ReviewStore(":memory:");
  const controller = new AbortController();
  await assert.rejects(
    acquireReviewSandbox(
      "cancel-acquire",
      controller.signal,
      store,
      async (options) => {
        assert.equal(options.abortSignal, controller.signal);
        options.onAcquiring(identity);
        assert.deepEqual(store.resourceIdentity(identity.id), identity);
        controller.abort();
        options.abortSignal.throwIfAborted();
        return { id: identity.id, identity };
      },
    ),
  );
  const reviews = new Reviews(store, async () => stubReview());
  await assert.rejects(
    reviews.submit(requestFixture()),
    /resource_cleanup_required/,
  );
  await reviews.close();
});

test("restart cleanup verifies immutable ownership and retains failed cleanup records", async () => {
  const store = new ReviewStore(":memory:");
  store.registerResource(identity, "review");
  const actual = {
    Id: "c".repeat(64),
    Name: `/${identity.id}`,
    Image: identity.imageId,
    Config: {
      Labels: {
        "aquamux.runtime-owner": "wrong",
        "aquamux.runtime-spike": "true",
      },
    },
  };
  const commands: string[][] = [];
  const execute = async (args: string[]) => {
    commands.push(args);
    return Buffer.from(
      args[0] === "ps" ? identity.id : JSON.stringify([actual]),
    );
  };
  await assert.rejects(recoverResources(store, execute), /ownership mismatch/);
  assert.equal(
    commands.some((args) => args[0] === "rm"),
    false,
  );
  assert.deepEqual(store.resources(), [identity.id]);
  actual.Config.Labels["aquamux.runtime-owner"] = identity.owner;
  await recoverResources(store, execute);
  assert.deepEqual(commands.at(-1), ["rm", "-f", actual.Id]);
  assert.deepEqual(store.resources(), []);
  store.close();
});

import { expect, test } from "bun:test";
import { type ActiveDocumentResult, PluginWiringDriver } from "../src/active-document";
import { deferred } from "./fixtures/assistant-service";
import { FakeSession, runtimeStatusSource } from "./fixtures/plugin-wiring";

for (const action of ["cancel", "close", "unload"] as const) {
  test(`${action} during document snapshot cannot start a late request`, async () => {
    const snapshot = deferred<ActiveDocumentResult>();
    const started = deferred<void>();
    const session = new FakeSession();
    session.currentDocument = () => {
      started.resolve();
      return snapshot.promise;
    };
    let calls = 0;
    session.answer = async () => {
      calls += 1;
    };
    const driver = new PluginWiringDriver(session, runtimeStatusSource());
    const pending = driver.submit("question");
    await started.promise;
    driver[action]();
    await pending;
    snapshot.resolve({ ok: true, document: { path: "A.md", content: "A" } });
    expect(calls).toBe(0);
  }, 1_000);
}

test("rapid duplicate submits share the pending snapshot and active operation", async () => {
  const snapshot = deferred<ActiveDocumentResult>();
  const session = new FakeSession();
  let snapshots = 0;
  let calls = 0;
  session.currentDocument = () => {
    snapshots += 1;
    return snapshot.promise;
  };
  session.answer = async () => {
    calls += 1;
  };
  const driver = new PluginWiringDriver(session, runtimeStatusSource());
  const first = driver.submit("question");
  const duplicate = driver.submit("question");
  snapshot.resolve({ ok: true, document: { path: "A.md", content: "A" } });
  await Promise.all([first, duplicate]);
  expect(snapshots).toBe(1);
  expect(calls).toBe(1);
});

test("closing while history restores does not install a late status listener", async () => {
  const restored = deferred<void>();
  const session = new FakeSession();
  session.restoreHistory = () => restored.promise;
  const source = runtimeStatusSource();
  const driver = new PluginWiringDriver(session, source);
  const pending = driver.open();
  driver.close();
  restored.resolve();
  await pending;
  expect(source.listenerCount()).toBe(0);
});

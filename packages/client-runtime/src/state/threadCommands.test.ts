import { EnvironmentId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Layer from "effect/Layer";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import { createRuntimeCommand } from "./runtime.ts";
import { interruptTurnConcurrency } from "./threadCommands.ts";

describe("thread command scheduling", () => {
  it("shares repeated same-turn interrupts without blocking another turn lane", async () => {
    const firstTurnLatch = Latch.makeUnsafe();
    const executions: string[] = [];
    const runtime = Atom.runtime(Layer.empty);
    const command = createRuntimeCommand(runtime, {
      label: "test.thread-interrupt-single-flight",
      concurrency: interruptTurnConcurrency,
      execute: ({ input }) =>
        Effect.sync(() => executions.push(input.turnId ?? "legacy")).pipe(
          Effect.andThen(
            input.turnId === TurnId.make("turn-1") ? firstTurnLatch.await : Effect.void,
          ),
          Effect.as("done"),
        ),
    });
    const registry = AtomRegistry.make();
    const firstInput = {
      environmentId: EnvironmentId.make("environment-1"),
      input: {
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
      },
    };

    const first = command.run(registry, firstInput);
    const repeated = command.run(registry, firstInput);
    const unrelated = command.run(registry, {
      environmentId: EnvironmentId.make("environment-1"),
      input: {
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-2"),
      },
    });

    await unrelated;
    expect(executions).toEqual(["turn-1", "turn-2"]);
    firstTurnLatch.openUnsafe();
    await Promise.all([first, repeated]);
    expect(executions).toEqual(["turn-1", "turn-2"]);

    await command.run(registry, firstInput);
    await command.run(registry, {
      environmentId: EnvironmentId.make("environment-1"),
      input: {
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-2"),
      },
    });
    expect(executions).toEqual(["turn-1", "turn-2", "turn-1", "turn-2"]);
    registry.dispose();
  });
});

import {
  CommandId,
  EnvironmentId,
  ORCHESTRATION_WS_METHODS,
  ProjectId,
  ThreadId,
  TurnId,
  type ClientOrchestrationCommand,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { RpcClientError } from "effect/unstable/rpc";
import * as HttpClientError from "effect/unstable/http/HttpClientError";
import * as Socket from "effect/unstable/socket/Socket";
import * as WorkerError from "effect/unstable/workers/WorkerError";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as RpcSession from "../rpc/session.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import {
  archiveThread,
  createProject,
  interruptThreadTurn,
  stopThreadSession,
} from "./commands.ts";

const TEST_CRYPTO_LAYER = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => Effect.succeed(data),
  }),
);

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

const RECONNECTING_CONNECTION_STATE: SupervisorConnectionState = {
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "connecting",
  stage: "opening",
};

const CONNECTED_CONNECTION_STATE: SupervisorConnectionState = {
  ...RECONNECTING_CONNECTION_STATE,
  phase: "connected",
  stage: null,
};

function rpcSession(client: WsRpcProtocolClient): RpcSession.RpcSession {
  return {
    client,
    initialConfig: Effect.never,
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeSupervisorHarness = Effect.fn("TestEnvironmentCommands.makeSupervisorHarness")(function* (
  initialSession: Option.Option<RpcSession.RpcSession>,
  initialState: SupervisorConnectionState = AVAILABLE_CONNECTION_STATE,
) {
  const activeSession = yield* SubscriptionRef.make(initialSession);
  const state = yield* SubscriptionRef.make(initialState);
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state,
    session: activeSession,
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  return { activeSession, state, supervisor };
});

const makeSupervisor = Effect.fn("TestEnvironmentCommands.makeSupervisor")(function* (
  dispatched: ClientOrchestrationCommand[],
) {
  const client = {
    [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
      Effect.sync(() => {
        dispatched.push(command);
        return { sequence: dispatched.length };
      }),
  } as unknown as WsRpcProtocolClient;
  return (yield* makeSupervisorHarness(Option.some(rpcSession(client)))).supervisor;
});

describe("environment commands", () => {
  it.effect("adds generated command metadata", () =>
    Effect.gen(function* () {
      const dispatched: ClientOrchestrationCommand[] = [];
      const supervisor = yield* makeSupervisor(dispatched);

      const result = yield* createProject({
        projectId: ProjectId.make("project-1"),
        title: "Project",
        workspaceRoot: "/workspace/project",
        createdAt: "2026-06-06T00:00:00.000Z",
      }).pipe(Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor));

      expect(result).toEqual({ sequence: 1 });
      expect(dispatched).toEqual([
        {
          type: "project.create",
          commandId: "00000000-0000-4000-8000-000000000000",
          projectId: "project-1",
          title: "Project",
          workspaceRoot: "/workspace/project",
          createdAt: "2026-06-06T00:00:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("preserves caller metadata for idempotent queued commands", () =>
    Effect.gen(function* () {
      const dispatched: ClientOrchestrationCommand[] = [];
      const supervisor = yield* makeSupervisor(dispatched);

      yield* stopThreadSession({
        commandId: CommandId.make("queued-command"),
        threadId: ThreadId.make("thread-1"),
        createdAt: "2026-06-06T00:01:00.000Z",
      }).pipe(Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor));

      expect(dispatched).toEqual([
        {
          type: "thread.session.stop",
          commandId: "queued-command",
          threadId: "thread-1",
          createdAt: "2026-06-06T00:01:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("waits for reconnect before dispatching an exact-turn interrupt", () =>
    Effect.gen(function* () {
      const dispatched: ClientOrchestrationCommand[] = [];
      const client = {
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: 1 };
          }),
      } as unknown as WsRpcProtocolClient;
      const { activeSession, supervisor } = yield* makeSupervisorHarness(
        Option.none(),
        RECONNECTING_CONNECTION_STATE,
      );

      const resultFiber = yield* interruptThreadTurn({
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
        createdAt: "2026-06-06T00:02:00.000Z",
      }).pipe(
        Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      expect(dispatched).toEqual([]);

      yield* SubscriptionRef.set(activeSession, Option.some(rpcSession(client)));
      expect(yield* Fiber.join(resultFiber)).toEqual({ sequence: 1 });
      expect(dispatched).toEqual([
        {
          type: "thread.turn.interrupt",
          commandId: "00000000-0000-4000-8000-000000000000",
          threadId: "thread-1",
          turnId: "turn-1",
          createdAt: "2026-06-06T00:02:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("reuses exact-turn interrupt metadata after a transport reconnect", () =>
    Effect.gen(function* () {
      const attempts: ClientOrchestrationCommand[] = [];
      const firstClient = {
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
          Effect.sync(() => {
            attempts.push(command);
          }).pipe(
            Effect.andThen(
              Effect.fail(
                new RpcClientError.RpcClientError({
                  reason: new Socket.SocketCloseError({
                    code: 1006,
                    closeReason: "socket closed",
                  }),
                }),
              ),
            ),
          ),
      } as unknown as WsRpcProtocolClient;
      const secondClient = {
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
          Effect.sync(() => {
            attempts.push(command);
            return { sequence: 2 };
          }),
      } as unknown as WsRpcProtocolClient;
      const { activeSession, supervisor } = yield* makeSupervisorHarness(
        Option.some(rpcSession(firstClient)),
        CONNECTED_CONNECTION_STATE,
      );

      const resultFiber = yield* interruptThreadTurn({
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
        createdAt: "2026-06-06T00:03:00.000Z",
      }).pipe(
        Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Effect.forkChild,
      );
      for (let attempt = 0; attempt < 100 && attempts.length === 0; attempt += 1) {
        yield* Effect.yieldNow;
      }
      expect(attempts).toHaveLength(1);

      yield* SubscriptionRef.set(activeSession, Option.none());
      yield* SubscriptionRef.set(activeSession, Option.some(rpcSession(secondClient)));
      expect(yield* Fiber.join(resultFiber)).toEqual({ sequence: 2 });
      expect(attempts).toEqual([
        {
          type: "thread.turn.interrupt",
          commandId: "00000000-0000-4000-8000-000000000000",
          threadId: "thread-1",
          turnId: "turn-1",
          createdAt: "2026-06-06T00:03:00.000Z",
        },
        {
          type: "thread.turn.interrupt",
          commandId: "00000000-0000-4000-8000-000000000000",
          threadId: "thread-1",
          turnId: "turn-1",
          createdAt: "2026-06-06T00:03:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("surfaces non-transport RPC client failures without waiting for reconnect", () =>
    Effect.gen(function* () {
      const reasons = [
        ...(
          [
            "StatusCodeError",
            "DecodeError",
            "EmptyBodyError",
            "EncodeError",
            "InvalidUrlError",
            "TransportError",
          ] as const
        ).map(
          (kind) =>
            new HttpClientError.HttpClientErrorSchema({
              kind,
              cause: new Error(kind),
            }),
        ),
        new RpcClientError.RpcClientDefect({
          message: "protocol mismatch",
          cause: new Error("protocol mismatch"),
        }),
        new WorkerError.WorkerSpawnError({ message: "worker spawn failed" }),
        new WorkerError.WorkerSendError({ message: "worker send failed" }),
        new WorkerError.WorkerReceiveError({ message: "worker receive failed" }),
        new WorkerError.WorkerUnknownError({ message: "worker failed" }),
      ];

      for (const reason of reasons) {
        let attempts = 0;
        const failure = new RpcClientError.RpcClientError({ reason });
        const client = {
          [ORCHESTRATION_WS_METHODS.dispatchCommand]: () =>
            Effect.sync(() => {
              attempts += 1;
            }).pipe(Effect.andThen(Effect.fail(failure))),
        } as unknown as WsRpcProtocolClient;
        const { supervisor } = yield* makeSupervisorHarness(
          Option.some(rpcSession(client)),
          CONNECTED_CONNECTION_STATE,
        );
        const fiber = yield* interruptThreadTurn({
          threadId: ThreadId.make("thread-1"),
          turnId: TurnId.make("turn-1"),
          createdAt: "2026-06-06T00:04:00.000Z",
        }).pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
          Effect.forkChild,
        );

        let completed = fiber.pollUnsafe();
        for (let attempt = 0; attempt < 100 && completed === undefined; attempt += 1) {
          yield* Effect.yieldNow;
          completed = fiber.pollUnsafe();
        }
        expect(completed, reason._tag).toBeDefined();
        if (completed === undefined) {
          return yield* Effect.die(new Error(`${reason._tag} entered the reconnect wait`));
        }
        expect(yield* Fiber.join(fiber).pipe(Effect.flip)).toBe(failure);
        expect(attempts).toBe(1);
      }
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("stops waiting when reconnect is permanently disconnected or blocked", () =>
    Effect.gen(function* () {
      const terminalStates: ReadonlyArray<SupervisorConnectionState> = [
        AVAILABLE_CONNECTION_STATE,
        {
          ...RECONNECTING_CONNECTION_STATE,
          phase: "blocked",
          stage: null,
        },
      ];

      for (const terminalState of terminalStates) {
        const dispatched: ClientOrchestrationCommand[] = [];
        const { state, supervisor } = yield* makeSupervisorHarness(
          Option.none(),
          RECONNECTING_CONNECTION_STATE,
        );
        const fiber = yield* interruptThreadTurn({
          threadId: ThreadId.make("thread-1"),
          turnId: TurnId.make("turn-1"),
          createdAt: "2026-06-06T00:05:00.000Z",
        }).pipe(
          Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        yield* SubscriptionRef.set(state, terminalState);

        expect(yield* Fiber.join(fiber).pipe(Effect.flip)).toMatchObject({
          _tag: "EnvironmentRpcUnavailableError",
        });
        expect(dispatched).toEqual([]);
      }
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("cancels the reconnect wait without leaving a stale dispatch subscription", () =>
    Effect.gen(function* () {
      const dispatched: ClientOrchestrationCommand[] = [];
      const client = {
        [ORCHESTRATION_WS_METHODS.dispatchCommand]: (command: ClientOrchestrationCommand) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      } as unknown as WsRpcProtocolClient;
      const { activeSession, supervisor } = yield* makeSupervisorHarness(
        Option.none(),
        RECONNECTING_CONNECTION_STATE,
      );
      const interrupted = yield* interruptThreadTurn({
        threadId: ThreadId.make("thread-1"),
        turnId: TurnId.make("turn-1"),
        createdAt: "2026-06-06T00:06:00.000Z",
      }).pipe(
        Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
        Effect.forkChild,
      );
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(interrupted);
      yield* SubscriptionRef.set(activeSession, Option.some(rpcSession(client)));
      yield* Effect.yieldNow;
      expect(dispatched).toEqual([]);

      expect(
        yield* interruptThreadTurn({
          threadId: ThreadId.make("thread-1"),
          turnId: TurnId.make("turn-1"),
          createdAt: "2026-06-06T00:06:00.000Z",
        }).pipe(Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor)),
      ).toEqual({ sequence: 1 });
      expect(dispatched).toHaveLength(1);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );

  it.effect("does not add timestamps to commands without createdAt", () =>
    Effect.gen(function* () {
      const dispatched: ClientOrchestrationCommand[] = [];
      const supervisor = yield* makeSupervisor(dispatched);

      yield* archiveThread({
        commandId: CommandId.make("archive-command"),
        threadId: ThreadId.make("thread-1"),
      }).pipe(Effect.provideService(EnvironmentSupervisor.EnvironmentSupervisor, supervisor));

      expect(dispatched).toEqual([
        {
          type: "thread.archive",
          commandId: "archive-command",
          threadId: "thread-1",
        },
      ]);
    }).pipe(Effect.provide(TEST_CRYPTO_LAYER)),
  );
});

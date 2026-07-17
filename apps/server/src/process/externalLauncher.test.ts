import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import type { EditorId } from "@t3tools/contracts";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { TestClock } from "effect/testing";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import * as ExternalLauncher from "./externalLauncher.ts";

function makeMockDetachedHandle(onUnref: () => void = () => undefined) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
    isRunning: Effect.succeed(true),
    kill: () => Effect.void,
    unref: Effect.sync(() => {
      onUnref();
      return Effect.void;
    }),
    stdin: Sink.drain,
    stdout: Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const testLayer = (input: {
  readonly platform: NodeJS.Platform;
  readonly env?: Record<string, string>;
  readonly resolveExecutable?: (command: string) => string | undefined;
  readonly onSpawn?: (command: ChildProcess.StandardCommand) => void;
  readonly onUnref?: () => void;
}) => {
  const spawnerLayer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.sync(() => {
        assert.equal(ChildProcess.isStandardCommand(command), true);
        if (!ChildProcess.isStandardCommand(command)) {
          throw new Error("Expected a standard command");
        }
        input.onSpawn?.(command);
        return makeMockDetachedHandle(input.onUnref);
      }),
    ),
  );

  return Layer.mergeAll(
    ExternalLauncher.layer.pipe(Layer.provide(Layer.merge(NodeServices.layer, spawnerLayer))),
    Layer.succeed(HostProcessPlatform, input.platform),
    Layer.succeed(
      SpawnExecutableResolution,
      (command) => input.resolveExecutable?.(command) ?? command,
    ),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: input.env ?? {} })),
  );
};

it.effect("launches the default browser through the platform command", () => {
  let spawned: ChildProcess.StandardCommand | undefined;
  let didUnref = false;
  return Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;

    yield* launcher.launchBrowser("https://example.com/some path");

    assert.ok(spawned);
    assert.equal(spawned.command, "xdg-open");
    assert.deepEqual(spawned.args, ["https://example.com/some path"]);
    assert.equal(spawned.options.detached, true);
    assert.equal(didUnref, true);
  }).pipe(
    Effect.provide(
      testLayer({
        platform: "linux",
        onSpawn: (command) => {
          spawned = command;
        },
        onUnref: () => {
          didUnref = true;
        },
      }),
    ),
  );
});

it.effect("launches an installed editor with platform-safe arguments", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-editors-" });
    yield* fileSystem.writeFileString(path.join(binDir, "code.CMD"), "@echo off\r\n");

    let spawned: ChildProcess.StandardCommand | undefined;
    yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      yield* launcher.launchEditor({
        editor: "vscode",
        cwd: "C:\\workspace with spaces\\src\\index.ts:12:4",
      });
    }).pipe(
      Effect.provide(
        testLayer({
          platform: "win32",
          env: { PATH: binDir, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
          resolveExecutable: (command) =>
            command === "code" ? "C:\\Program Files\\Microsoft VS Code\\bin\\code.CMD" : command,
          onSpawn: (command) => {
            spawned = command;
          },
        }),
      ),
    );

    assert.ok(spawned);
    assert.equal(spawned.command, '^"C:\\Program^ Files\\Microsoft^ VS^ Code\\bin\\code.CMD^"');
    assert.deepEqual(spawned.args, [
      '^"--goto^"',
      '^"C:\\workspace^ with^ spaces\\src\\index.ts:12:4^"',
    ]);
    assert.equal(spawned.options.shell, true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("discovers editors through the service API", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-editors-" });
    yield* fileSystem.writeFileString(path.join(binDir, "code.CMD"), "@echo off\r\n");
    yield* fileSystem.writeFileString(path.join(binDir, "explorer.CMD"), "@echo off\r\n");

    const editors = yield* Effect.gen(function* () {
      const launcher = yield* ExternalLauncher.ExternalLauncher;
      return yield* launcher.resolveAvailableEditors();
    }).pipe(
      Effect.provide(
        testLayer({
          platform: "win32",
          env: { PATH: binDir, PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        }),
      ),
    );

    assert.equal(editors.includes("vscode"), true);
    assert.equal(editors.includes("file-manager"), true);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("deduplicates slow discovery and bounds the initial config wait", () =>
  Effect.gen(function* () {
    const releaseDiscovery = yield* Deferred.make<ReadonlyArray<EditorId>>();
    const discoveryStarted = yield* Deferred.make<void>();
    let discoveryCount = 0;
    const resolve = yield* ExternalLauncher.makeAvailableEditorsResolver({
      initialWait: "50 millis",
      discover: Effect.sync(() => {
        discoveryCount += 1;
      }).pipe(
        Effect.andThen(Deferred.succeed(discoveryStarted, undefined)),
        Effect.andThen(Deferred.await(releaseDiscovery)),
      ),
    });

    const first = yield* resolve().pipe(Effect.forkScoped);
    yield* Deferred.await(discoveryStarted);
    const second = yield* resolve().pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    assert.equal(discoveryCount, 1);

    yield* TestClock.adjust("50 millis");
    assert.deepEqual(yield* Fiber.join(first), []);
    assert.deepEqual(yield* Fiber.join(second), []);
    assert.equal(discoveryCount, 1);

    yield* Deferred.succeed(releaseDiscovery, ["vscode"]);
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
    assert.deepEqual(yield* resolve(), ["vscode"]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("returns stale editors immediately while one background refresh updates the cache", () =>
  Effect.gen(function* () {
    const firstDiscovery = yield* Deferred.make<ReadonlyArray<EditorId>>();
    const secondDiscovery = yield* Deferred.make<ReadonlyArray<EditorId>>();
    let discoveryCount = 0;
    const resolve = yield* ExternalLauncher.makeAvailableEditorsResolver({
      cacheTtl: "100 millis",
      initialWait: "50 millis",
      discover: Effect.suspend(() => {
        discoveryCount += 1;
        return Deferred.await(discoveryCount === 1 ? firstDiscovery : secondDiscovery);
      }),
    });

    const initial = yield* resolve().pipe(Effect.forkScoped);
    yield* Effect.yieldNow;
    yield* Deferred.succeed(firstDiscovery, ["vscode"]);
    assert.deepEqual(yield* Fiber.join(initial), ["vscode"]);

    yield* TestClock.adjust("101 millis");
    assert.deepEqual(yield* resolve(), ["vscode"]);
    yield* Effect.yieldNow;
    assert.equal(discoveryCount, 2);
    assert.deepEqual(yield* resolve(), ["vscode"]);
    assert.equal(discoveryCount, 2);

    yield* Deferred.succeed(secondDiscovery, ["cursor"]);
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
    assert.deepEqual(yield* resolve(), ["cursor"]);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("retains stale editors and applies a cooldown after failed refreshes", () =>
  Effect.gen(function* () {
    let discoveryCount = 0;
    const resolve = yield* ExternalLauncher.makeAvailableEditorsResolver({
      cacheTtl: "100 millis",
      initialWait: "50 millis",
      discover: Effect.suspend(() => {
        discoveryCount += 1;
        return discoveryCount === 1
          ? Effect.succeed<ReadonlyArray<EditorId>>(["vscode"])
          : Effect.fail("discovery failed" as const);
      }),
    });

    assert.deepEqual(yield* resolve(), ["vscode"]);
    yield* TestClock.adjust("101 millis");

    assert.deepEqual(yield* resolve(), ["vscode"]);
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
    assert.equal(discoveryCount, 2);

    assert.deepEqual(yield* resolve(), ["vscode"]);
    assert.equal(discoveryCount, 2);

    yield* TestClock.adjust("101 millis");
    assert.deepEqual(yield* resolve(), ["vscode"]);
    yield* Effect.yieldNow;
    assert.equal(discoveryCount, 3);
  }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
);

it.effect("rejects unknown editors through the service API", () =>
  Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;
    const error = yield* launcher
      .launchEditor({ editor: "missing-editor" as never, cwd: "/tmp/workspace" })
      .pipe(Effect.flip);
    assert.instanceOf(error, ExternalLauncher.ExternalLauncherUnknownEditorError);
    assert.equal(error.editor, "missing-editor");
    assert.equal(error.message, "Unknown editor: missing-editor");
  }).pipe(Effect.provide(testLayer({ platform: "linux", env: { PATH: "" } }))),
);

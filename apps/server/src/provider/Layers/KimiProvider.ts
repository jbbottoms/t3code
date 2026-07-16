import {
  type KimiSettings,
  type ModelCapabilities,
  ProviderDriverKind,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { makeKimiAcpRuntime } from "../acp/KimiAcpSupport.ts";
import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

const PROVIDER = ProviderDriverKind.make("kimi");
const PRESENTATION = {
  displayName: "Kimi",
  badgeLabel: "Early Access",
  showInteractionModeToggle: true,
  requiresNewThreadForModelChange: false,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });
const VERSION_PROBE_TIMEOUT_MS = 4_000;
const ACP_DISCOVERY_TIMEOUT_MS = 15_000;
const ACP_SLASH_COMMAND_DISCOVERY_TIMEOUT_MS = 1_000;

export function isKimiThinkingAlwaysOn(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): boolean {
  const thinking = configOptions?.find((option) => {
    const id = option.id.trim().toLowerCase();
    const name = option.name.trim().toLowerCase();
    const category = option.category?.trim().toLowerCase();
    return category === "thought_level" && (id === "thinking" || name.includes("thinking"));
  });
  if (thinking?.type !== "select" || thinking.currentValue.trim().toLowerCase() !== "on") {
    return false;
  }
  const values = thinking.options.flatMap((entry) =>
    "options" in entry ? entry.options.map((option) => option.value) : [entry.value],
  );
  return values.length === 1 && values[0]?.trim().toLowerCase() === "on";
}

const BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "kimi-code/k3",
    name: "K3",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "kimi-code/kimi-for-coding",
    name: "Kimi for Coding",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
  {
    slug: "kimi-code/kimi-for-coding-highspeed",
    name: "Kimi for Coding High-Speed",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

function modelsFromSettings(
  customModels: ReadonlyArray<string>,
  builtInModels: ReadonlyArray<ServerProviderModel> = BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, PROVIDER, customModels, EMPTY_CAPABILITIES);
}

function modelsFromSessionState(
  state: EffectAcpSchema.SessionModelState | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  if (!state || state.availableModels.length === 0) return [];
  const seen = new Set<string>();
  return state.availableModels.flatMap((model) => {
    const slug = model.modelId.trim();
    if (!slug || seen.has(slug)) return [];
    seen.add(slug);
    return [
      {
        slug,
        name: model.name.trim() || slug,
        isCustom: false,
        capabilities: EMPTY_CAPABILITIES,
      } satisfies ServerProviderModel,
    ];
  });
}

export function buildInitialKimiProviderSnapshot(
  settings: KimiSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: settings.enabled,
      checkedAt,
      models: modelsFromSettings(settings.customModels),
      probe: settings.enabled
        ? {
            installed: true,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Checking Kimi Code CLI availability...",
          }
        : {
            installed: false,
            version: null,
            status: "warning",
            auth: { status: "unknown" },
            message: "Kimi is disabled in T3 Code settings.",
          },
    });
  });
}

const runVersionCommand = (settings: KimiSettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const spawnCommand = yield* resolveSpawnCommand(settings.binaryPath || "kimi", ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      settings.binaryPath || "kimi",
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

const discoverViaAcp = (settings: KimiSettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* makeKimiAcpRuntime({
      cursorSettings: settings,
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* runtime.start();
    yield* runtime.waitForSlashCommands(ACP_SLASH_COMMAND_DISCOVERY_TIMEOUT_MS);
    const configOptions = yield* runtime.getConfigOptions;
    return {
      models: modelsFromSessionState(started.sessionSetupResult.models),
      slashCommands: yield* runtime.getSlashCommands,
      thinkingAlwaysOn: isKimiThinkingAlwaysOn(configOptions),
    };
  }).pipe(Effect.scoped);

export const checkKimiProviderStatus = Effect.fn("checkKimiProviderStatus")(function* (
  settings: KimiSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = modelsFromSettings(settings.customModels);

  if (!settings.enabled) {
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Kimi is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runVersionCommand(settings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: true,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? `Kimi Code CLI command \`${settings.binaryPath || "kimi"}\` was not found.`
          : "Failed to execute the Kimi Code CLI health check.",
      },
    });
  }
  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: true,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Kimi Code CLI timed out while running `kimi --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: true,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Kimi Code CLI is installed but failed to run.",
      },
    });
  }

  const discoveryExit = yield* discoverViaAcp(settings, environment).pipe(
    Effect.timeoutOption(ACP_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit) || Option.isNone(discoveryExit.value)) {
    return buildServerProvider({
      presentation: PRESENTATION,
      enabled: true,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Kimi Code CLI is installed but ACP startup failed or timed out.",
      },
    });
  }

  const discovered = discoveryExit.value.value;
  return buildServerProvider({
    presentation: PRESENTATION,
    enabled: true,
    checkedAt,
    models: modelsFromSettings(
      settings.customModels,
      discovered.models.length > 0 ? discovered.models : BUILT_IN_MODELS,
    ),
    slashCommands: discovered.slashCommands,
    probe: {
      installed: true,
      version,
      status: "ready",
      // Kimi ACP 0.26.0 proves that the session can start but does not expose
      // an authenticated principal or subscription marker during discovery.
      // Real prompts are verified separately; keep snapshot auth honest.
      auth: { status: "unknown" },
      ...(discovered.thinkingAlwaysOn
        ? { message: "Kimi ACP reports thinking as always on." }
        : {}),
    },
  });
});

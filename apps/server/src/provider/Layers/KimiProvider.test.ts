import { describe, expect, it } from "@effect/vitest";
import { KimiSettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as EffectAcpSchema from "effect-acp/schema";

import { buildInitialKimiProviderSnapshot, isKimiThinkingAlwaysOn } from "./KimiProvider.ts";

const decodeKimiSettings = Schema.decodeSync(KimiSettings);

describe("buildInitialKimiProviderSnapshot", () => {
  it.effect("advertises K3 as the first built-in model", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(
        decodeKimiSettings({ enabled: true }),
      );

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.models.map((model) => model.slug)).toEqual([
        "kimi-code/k3",
        "kimi-code/kimi-for-coding",
        "kimi-code/kimi-for-coding-highspeed",
      ]);
      expect(snapshot.requiresNewThreadForModelChange).toBe(false);
      expect(snapshot.showInteractionModeToggle).toBe(true);
    }),
  );

  it.effect("defaults the legacy Kimi slot to disabled", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(decodeKimiSettings({}));

      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
    }),
  );

  it.effect("returns a disabled snapshot when the instance is disabled", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialKimiProviderSnapshot(
        decodeKimiSettings({ enabled: false }),
      );

      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it("recognizes Kimi ACP's fixed-on thinking state without fabricating a toggle", () => {
    const configOptions = [
      {
        type: "select",
        currentValue: "on",
        options: [{ name: "On", value: "on" }],
        category: "thought_level",
        id: "thinking",
        name: "Thinking",
      },
    ] satisfies ReadonlyArray<EffectAcpSchema.SessionConfigOption>;

    expect(isKimiThinkingAlwaysOn(configOptions)).toBe(true);
    expect(
      isKimiThinkingAlwaysOn([
        {
          type: "select",
          currentValue: "on",
          options: [
            { name: "On", value: "on" },
            { name: "Off", value: "off" },
          ],
          category: "thought_level",
          id: "thinking",
          name: "Thinking",
        },
      ]),
    ).toBe(false);
  });
});

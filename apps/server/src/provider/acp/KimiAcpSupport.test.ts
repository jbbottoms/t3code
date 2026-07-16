import { describe, expect, it } from "@effect/vitest";

import { buildKimiAcpSpawnInput } from "./KimiAcpSupport.ts";

describe("buildKimiAcpSpawnInput", () => {
  it("launches the configured Kimi binary in ACP mode with actor-bound environment", () => {
    const spawn = buildKimiAcpSpawnInput(
      { binaryPath: "C:\\Tools\\Kimi\\kimi.exe" },
      "C:\\work\\kai",
      { T3_FAMILY_ACTOR: "kai" },
    );

    expect(spawn).toEqual({
      command: "C:\\Tools\\Kimi\\kimi.exe",
      args: ["acp"],
      cwd: "C:\\work\\kai",
      env: { T3_FAMILY_ACTOR: "kai" },
    });
  });

  it("defaults to kimi on PATH", () => {
    expect(buildKimiAcpSpawnInput(undefined, "/project")).toEqual({
      command: "kimi",
      args: ["acp"],
      cwd: "/project",
    });
  });
});

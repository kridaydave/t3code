// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { hydratePosixHome } from "./os-jank.ts";
import { fixPath } from "./os-jank.ts";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";

it("hydrates HOME for minimal service environments from the user account", () => {
  const env: NodeJS.ProcessEnv = {};

  hydratePosixHome(env);

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("hydrates HOME independently of a blank process HOME", () => {
  const originalHome = process.env.HOME;
  const env: NodeJS.ProcessEnv = { HOME: " " };

  try {
    process.env.HOME = " ";
    hydratePosixHome(env);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }

  assert.equal(env.HOME, NodeOS.userInfo().homedir);
});

it("preserves an explicitly configured HOME", () => {
  const env: NodeJS.ProcessEnv = { HOME: "/custom/home" };

  hydratePosixHome(env, () => {
    throw new Error("HOME lookup should not run");
  });

  assert.equal(env.HOME, "/custom/home");
});

it.effect("fixPath skips hydratePosixPath when __T3CODE_SHELL_ENV_INSTALLED is 1", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = {
      __T3CODE_SHELL_ENV_INSTALLED: "1",
      HOME: "/home/user",
    };
    yield* fixPath().pipe(
      Effect.provideService(HostProcessPlatform, "linux"),
      Effect.provideService(HostProcessEnvironment, env),
      Effect.provide(NodeServices.layer),
    );
    assert.equal(env.PATH, undefined);
  }),
);

it.effect("fixPath hydrates PATH from the login shell when the marker is absent", () =>
  Effect.gen(function* () {
    if (process.platform === "win32") return;
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-os-jank-probe-"));
    try {
      const fakeShell = NodePath.join(dir, "fake-shell");
      NodeFS.writeFileSync(
        fakeShell,
        [
          "#!/bin/sh",
          "printf '%s\\n' '__T3CODE_ENV_PATH_START__'",
          "printf '%s\\n' '/sentinel/probe/bin'",
          "printf '%s\\n' '__T3CODE_ENV_PATH_END__'",
        ].join("\n"),
      );
      NodeFS.chmodSync(fakeShell, 0o755);
      const env: NodeJS.ProcessEnv = { SHELL: fakeShell, HOME: "/home/user", PATH: "/usr/bin" };
      yield* fixPath().pipe(
        Effect.provideService(HostProcessPlatform, "linux"),
        Effect.provideService(HostProcessEnvironment, env),
        Effect.provide(NodeServices.layer),
      );
      assert.equal(env.PATH, "/sentinel/probe/bin:/usr/bin");
    } finally {
      NodeFS.rmSync(dir, { recursive: true, force: true });
    }
  }),
);

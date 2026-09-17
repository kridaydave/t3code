import * as NodeOS from "node:os";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

it.effect("fixPath hydrates PATH when __T3CODE_SHELL_ENV_INSTALLED marker is absent", () =>
  Effect.gen(function* () {
    const env: NodeJS.ProcessEnv = { HOME: "/home/user" };
    yield* fixPath().pipe(
      Effect.provideService(HostProcessPlatform, "linux"),
      Effect.provideService(HostProcessEnvironment, env),
      Effect.provide(NodeServices.layer),
    );
  }),
);

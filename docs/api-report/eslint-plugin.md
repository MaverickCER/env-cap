# eslint-plugin

Lint rules that keep environment reads inside contracts (`@maverickcer/env-cap/eslint-plugin`).

`no-raw-process-env` flags direct `process.env` reads outside `env.schema.ts` files. `no-node-fs` flags
`node:fs` imports in library code, which should take its file system from the caller. The plugin runs
inside the project's own ESLint; CI runs the rules on ESLint 10 only.

## Variables

### default

```ts
const default: {
  rules: {
     "no-node-fs": RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
     "no-raw-process-env": RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener>;
  };
};
```

The ESLint plugin, as a flat-config plugin object (`{ rules }`). Register it under the `env-cap`
prefix:

```js
import envCapPlugin from "@maverickcer/env-cap/eslint-plugin"
export default [{ plugins: { "env-cap": envCapPlugin }, rules: { "env-cap/no-raw-process-env": "error" } }]
```

ADR 0017 explains why the rules ship as their own entry point.

#### Type Declaration

##### rules

```ts
rules: {
  "no-node-fs": RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
  "no-raw-process-env": RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener>;
};
```

Every rule this plugin ships, keyed by its flat-config rule name.

###### rules.no-node-fs

```ts
"no-node-fs": RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener> = noNodeFs;
```

See [noNodeFs](#nonodefs).

###### rules.no-raw-process-env

```ts
"no-raw-process-env": RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener> = noRawProcessEnv;
```

See [noRawProcessEnv](#norawprocessenv).

***

### noNodeFs

```ts
const noNodeFs: RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
```

Flags any `import`/`require`/dynamic `import()` of `node:fs` in library code, so a library surface acquires
its filesystem capability from the caller instead of reaching for `node:fs` itself.

#### Remarks

Nothing is exempt by default. A package's own config allows its CLI folder (for example `src/cli/**`),
which builds the `node:fs/promises` adapter, and a consuming project sets the `allow` option for its own CLI
or script entry points. The rule itself lives in `../_ipc/no-node-fs.ts`, a managed copy of
internal-package-contract's `runtime/no-node-fs.ts`; this supplies env-cap's documentation link and the decision
record the message cites.

***

### noRawProcessEnv

```ts
const noRawProcessEnv: RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener>;
```

Flags any direct `process.env.X`/`process.env["X"]` read in application code, so environment
access always goes through a capability's own `createEnv()` contract instead.

#### Remarks

`env.schema.ts`/`env.schema.tsx` files are always exempt (that's where `createEnv()` itself
reads `process.env`); the rule's `allow` option extends that exemption to a consuming
project's own trusted bootstrap code.

# eslint-plugin

## Variables

### default

```ts
const default: {
  rules: {
     no-node-fs: RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
     no-raw-process-env: RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener>;
  };
};
```

`env-cap/eslint-plugin` -- a flat-config-shaped plugin object
({ rules: { ... } }), consumed as:

  import envCapPlugin from "env-cap/eslint-plugin";
  export default [{ plugins: { "env-cap": envCapPlugin }, rules: { "env-cap/no-raw-process-env": "error" } }];

A 4th public entry point alongside `.`, `./build`, `./helpers` -- see ADR 0017.

#### Type Declaration

##### rules

```ts
rules: {
  no-node-fs: RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
  no-raw-process-env: RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener>;
};
```

Every rule this plugin ships, keyed by its flat-config rule name.

###### rules.no-node-fs

```ts
no-node-fs: RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener> = noNodeFs;
```

See [noNodeFs](#nonodefs).

###### rules.no-raw-process-env

```ts
no-raw-process-env: RuleModuleWithName<"noRawProcessEnv", [RuleOptions], unknown, RuleListener> = noRawProcessEnv;
```

See [noRawProcessEnv](#norawprocessenv).

***

### noNodeFs

```ts
const noNodeFs: RuleModuleWithName<"noNodeFs", [RuleOptions], unknown, RuleListener>;
```

Flags any `import`/`require`/dynamic `import()` of `node:fs` in library
code, so a library surface acquires its filesystem capability from the
caller instead of reaching for `node:fs` itself (the same discipline
`repo-contract`'s ADR-0011 established for `child_process`/`process.env`).
See ADR 0040.

#### Remarks

Nothing is exempt by default. env-cap's own config allows `src/cli/**`
(the executable capability boundary that builds the `node:fs/promises`
adapter); a consuming project sets its own `allow` for its own entry
points.

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

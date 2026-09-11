## AI-Assisted Integration

env-cap is designed to integrate with existing application architectures rather than replace them blindly.

If you use an AI coding assistant, provide it with the following prompt before asking it to modify your project. This helps the assistant understand both your application's architecture and env-cap's design principles before making changes.

Replace `<YOUR_PROJECT_CONTEXT>` with any additional context about your application before submitting the prompt.

```text
You are integrating env-cap into an existing production codebase.

Package source:
https://github.com/maverickcer/env-cap

Before making any changes, first study the env-cap repository above, including:

- README.md
- Architecture documentation
- ADRs (architectural decision records)
- Examples
- Migration guides
- Package exports and API design

Understand the package's intended architecture and constraints before proposing an implementation.

Your role is to act as a senior/staff-level engineer performing an infrastructure integration review.

Application context:
<YOUR_PROJECT_CONTEXT>

First, analyze this repository and understand:

1. Application architecture:
   - Framework and runtime(s)
   - Build system and bundler behavior
   - Monorepo/package boundaries (if applicable)
   - Server/client boundaries
   - Deployment environments
   - CI/CD environment configuration
   - Existing environment loading and validation flow

2. Current configuration system:
   - Where environment variables are defined
   - Where they are consumed
   - Existing validation logic
   - Existing documentation or generated configuration artifacts
   - Security-sensitive variables
   - Client-exposed variables

3. Integration approach:
   - Determine where env-cap contracts should live
   - Identify existing environment boundaries
   - Determine whether validation contexts are appropriate
   - Determine whether separate manifests/contracts are needed
   - Identify migration risks

Follow env-cap's architectural principles:

- Runtime validation and build-time analysis are separate concerns.
- Generated artifacts are derived outputs, not manually maintained files.
- Server-only secrets must remain outside client bundles.
- Validation contexts control validation participation only; they are not a security boundary.
- Application code determines active validation contexts explicitly.
- Do not add framework-specific behavior to env-cap usage.
- Avoid unnecessary wrappers or abstractions unless they solve a real application need.

Before changing code, provide:

1. Current environment configuration architecture summary.
2. Recommended env-cap integration strategy.
3. Proposed migration steps.
4. Files that should change.
5. Risks and mitigations.
6. Questions requiring developer decisions.

Do not implement changes until the plan has been reviewed and approved.

After approval:

- Implement changes incrementally.
- Preserve existing behavior where possible.
- Add or update tests.
- Verify generated documentation/artifacts.
- Verify type safety.
- Verify build output.
- Verify CI/CD compatibility.

For the best results, provide your AI assistant access to both your repository and the env-cap repository. The assistant should understand your application's architecture before recommending how env-cap fits into it.
```

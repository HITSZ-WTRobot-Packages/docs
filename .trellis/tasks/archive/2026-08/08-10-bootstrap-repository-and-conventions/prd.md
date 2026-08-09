# Bootstrap Repository and Conventions

## Goal

Establish the repository, contributor instructions, enforceable tool conventions, and Trellis specs
needed by every later child task.

## Requirements

- Initialize the local Git repository and configure the intended docs remote without pushing.
- Create the root README, AGENTS instructions, `.gitignore`, and structured `issues.md`.
- Specify Bun-only package management and reject npm, pnpm, and Yarn lockfiles or commands.
- Specify uv default behavior when Python is used, including an ignored project `.venv`.
- Specify library-first research, tracked source snapshots, dynamic site/base configuration, testing,
  and architecture-issue pause rules.
- Replace placeholder frontend/backend Trellis specs with project-specific executable conventions.
- Add a convention-check command design that later CI can enforce.

## Acceptance Criteria

- [ ] Future agents can identify all mandatory tools, directories, commands, and forbidden patterns.
- [ ] AGENTS and Trellis specs agree and contain no placeholder guidance.
- [ ] `issues.md` defines evidence, impact, workaround, owner, and close-condition fields.
- [ ] No application feature is implemented in this task.

## Dependencies

None. This is the first implementation task and incorporates the existing
`00-bootstrap-guidelines` task.


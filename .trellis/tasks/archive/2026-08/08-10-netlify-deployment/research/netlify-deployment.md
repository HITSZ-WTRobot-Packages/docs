# Netlify deployment research

## Sources

- Netlify build image software:
  <https://docs.netlify.com/build/configure-builds/available-software-at-build-time/>
- Netlify file-based configuration:
  <https://docs.netlify.com/build/configure-builds/file-based-configuration/>
- Netlify build environment variables:
  <https://docs.netlify.com/build/configure-builds/environment-variables/>
- Netlify deploy contexts:
  <https://docs.netlify.com/deploy/deploy-overview/>
- Netlify locked deploys and rollback:
  <https://docs.netlify.com/deploy/manage-deploys/manage-deploys-overview/>

## Findings

- The current Netlify build image lists Doxygen 1.9.8 and exposes no Doxygen version selector.
- `netlify.toml` can own `build.command`, `build.publish`, and build environment variables; committed
  file configuration takes precedence over conflicting UI build settings.
- `BUN_VERSION` selects the build-image Bun version and `BUN_FLAGS` is passed to dependency install.
- `CONTEXT` identifies production, deploy-preview, branch-deploy, or dev builds. `URL` is the main
  site URL, while `DEPLOY_PRIME_URL` identifies the address for the current preview/branch deploy.
- A deploy lock lets Netlify keep building production candidates without automatically replacing
  the published production deploy. Previous successful atomic deploys can be republished for rollback.

## Repository Mapping

- Install the pinned Doxygen release before invoking the existing offline Astro build.
- Use `URL` only for production canonical URLs and `DEPLOY_PRIME_URL` for non-production artifacts.
- Keep Netlify at root base `/`; GitHub Pages retains its independent `/docs/` contract.
- Keep external acquisition in an explicit toolchain setup command and forbid synchronization from
  the Netlify path.

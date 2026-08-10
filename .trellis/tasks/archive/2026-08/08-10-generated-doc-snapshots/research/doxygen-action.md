# GitHub Actions Doxygen Setup

## Findings

- GitHub does not publish an official `actions/setup-doxygen` Action.
- The GitHub-hosted Ubuntu 24.04 software manifest does not list Doxygen as preinstalled.
- `ssciwr/doxygen-install` is a focused community Action that installs a requested Doxygen version
  and handles platform-specific release packaging.
- The repository engineering contract requires every third-party Action reference to use a full
  commit SHA rather than a movable tag.
- The `v2` tag currently resolves to
  `b5b80f5a60852f72d3c33f47fee9ddfb84a25929`.
- The local environment reports Doxygen `1.16.1`, so configuring the Action with `version: "1.16.1"`
  aligns local and synchronization environments without maintaining download shell code here.

## Decision

Use the following only in the synchronization workflow:

```yaml
- uses: ssciwr/doxygen-install@b5b80f5a60852f72d3c33f47fee9ddfb84a25929
  with:
    version: "1.16.1"
```

Keep `.doxygen-version` as the shared local/CI expected version and accept the official optional
40-character commit suffix from `doxygen --version`. Do not serialize installer paths or host data
into artifacts. Validation and deployment builds must not install Doxygen.

## Sources

- https://github.com/ssciwr/doxygen-install
- https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md

# Render README Content

## Goal

Turn module/package README files and their relative-reference closure into safe, base-aware pages.

## Requirements

- Render module README as module overview and package README as package manual.
- Generate an explicit cpkg-derived fallback when a package README is absent.
- Render README-linked supplemental Markdown without independently discovering unrelated Markdown.
- Rewrite relative Markdown pages, headings, images, and attachments through the selected AST stack.
- Preserve external URLs and generate upstream GitHub links pinned to the synchronized commit.
- Resolve all site paths through the shared `SITE_URL`/`BASE_PATH` helper.
- Sanitize or reject unsafe HTML and invalid/escaping local paths using library-supported behavior.

## Acceptance Criteria

- [ ] Existing relative README-to-README links resolve inside the generated site.
- [ ] Images and attachments work under root and nested base paths.
- [ ] Missing README packages remain discoverable with clear fallback content.
- [ ] Broken or unsafe references produce actionable build diagnostics.

## Dependencies

Requires the typed cpkg catalog and committed snapshots.


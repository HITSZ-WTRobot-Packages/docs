import { describe, expect, test } from "bun:test";

import { discoverMarkdownReferences } from "../../src/lib/markdown/references";
import { resolveMarkdownReference } from "../../src/lib/sources/path-safety";

describe("Markdown reference discovery", () => {
  test("uses Markdown and HTML ASTs to discover local references", () => {
    const references = discoverMarkdownReferences(`
[Guide](./guide.md)
![Diagram](../assets/diagram.png)

[guide-ref]: ./reference.md
<img src="./raw.svg" alt="raw">
<a href="https://example.com">remote</a>
`);

    expect(references).toEqual([
      "../assets/diagram.png",
      "./guide.md",
      "./raw.svg",
      "./reference.md",
      "https://example.com",
    ]);
  });

  test("resolves contained parent references and preserves root containment", () => {
    expect(resolveMarkdownReference("docs/guide.md", "../assets/image.png#preview")).toBe(
      "assets/image.png",
    );
    expect(resolveMarkdownReference("README.md", "/assets/image.png")).toBe("assets/image.png");
    expect(resolveMarkdownReference("README.md", "https://example.com/image.png")).toBeNull();
    expect(resolveMarkdownReference("README.md", "#section")).toBeNull();
  });

  test("rejects references escaping the module", () => {
    expect(() => resolveMarkdownReference("README.md", "../secret.md")).toThrow(
      "escapes the module root",
    );
    expect(() => resolveMarkdownReference("docs/guide.md", "%2e%2e/%2e%2e/secret.md")).toThrow(
      "escapes the module root",
    );
  });
});

import starlight from "@astrojs/starlight";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { defineConfig } from "astro/config";
import { Command } from "commander";
import cytoscape from "cytoscape";
import { execa } from "execa";
import { XMLParser } from "fast-xml-parser";
import { check } from "linkinator";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { simpleGit } from "simple-git";
import { parse as parseToml } from "smol-toml";
import { glob } from "tinyglobby";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { z } from "zod";

const assertions: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
  assertions.push(message);
}

const manifestSchema = z.object({
  package: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
});
const manifest = manifestSchema.parse(
  parseToml('[package]\nname = "demo"\nversion = "1.0.0"\n'),
);
assert(manifest.package.name === "demo", "TOML + Zod boundary");

const markdown = unified()
  .use(remarkParse)
  .use(() => (tree) => {
    visit(tree, ["link", "image"], (node: { url?: string }) => {
      if (node.url?.startsWith("./")) {
        node.url = `/snapshot/${node.url.slice(2)}`;
      }
    });
  })
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSanitize)
  .use(rehypeStringify);
const html = String(await markdown.process("[Guide](./guide.md)\n\n<script>alert(1)</script>"));
assert(html.includes('/snapshot/guide.md'), "Markdown AST rewrite");
assert(!html.includes("<script"), "rehype sanitization");

const xml = new XMLParser({ ignoreAttributes: false }).parse(
  '<doxygen><compounddef id="demo"><compoundname>Demo</compoundname></compounddef></doxygen>',
) as { doxygen?: { compounddef?: { "@_id"?: string } } };
assert(xml.doxygen?.compounddef?.["@_id"] === "demo", "Doxygen XML parsing");

const gitVersion = await simpleGit().raw(["--version"]);
assert(gitVersion.includes("git version"), "simple-git execution");
const doxygenVersion = await execa("doxygen", ["--version"]);
assert(/^\d+\.\d+/.test(doxygenVersion.stdout), "Execa Doxygen execution");

const graph = cytoscape({
  headless: true,
  elements: [
    { data: { id: "core" } },
    { data: { id: "driver" } },
    { data: { id: "edge", source: "driver", target: "core" } },
  ],
});
graph.layout({ name: "breadthfirst", directed: true }).run();
assert(graph.nodes().every((node) => Number.isFinite(node.position().x)), "Cytoscape layout");
graph.destroy();

const command = new Command().exitOverride().option("--module <name>").option("--changed");
command.parse(["--module", "demo"], { from: "user" });
assert(command.opts<{ module?: string }>().module === "demo", "Commander option parsing");

const files = await glob("poc*.{ts,json}", { cwd: import.meta.dir });
assert(files.includes("poc.ts"), "tinyglobby discovery");

const astroConfig = defineConfig({ integrations: [starlight({ title: "PoC" })] });
assert(Array.isArray(astroConfig.integrations), "Astro + Starlight configuration");
assert(typeof check === "function", "Linkinator API import");
assert(typeof expect === "function", "Playwright API import");
assert(typeof AxeBuilder === "function", "axe Playwright API import");

console.log(JSON.stringify({ assertions, bun: Bun.version, doxygen: doxygenVersion.stdout }, null, 2));

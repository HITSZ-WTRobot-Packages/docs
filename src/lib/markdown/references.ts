import type { Element, Root as HastRoot } from "hast";
import type { Definition, Html, Image, Link, Root as MdastRoot } from "mdast";
import rehypeParse from "rehype-parse";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const markdownParser = unified().use(remarkParse);
const htmlParser = unified().use(rehypeParse, { fragment: true });

function addPropertyReference(references: Set<string>, value: Element["properties"][string]): void {
  if (typeof value === "string" && value.trim()) {
    references.add(value);
  }
}

function discoverHtmlReferences(html: string, references: Set<string>): void {
  const tree = htmlParser.parse(html) as HastRoot;
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "a") {
      addPropertyReference(references, node.properties.href);
    }
    if (["audio", "img", "source", "video"].includes(node.tagName)) {
      addPropertyReference(references, node.properties.src);
    }
    if (node.tagName === "video") {
      addPropertyReference(references, node.properties.poster);
    }
    if (node.tagName === "object") {
      addPropertyReference(references, node.properties.data);
    }
  });
}

export function discoverMarkdownReferences(markdown: string): string[] {
  const tree = markdownParser.parse(markdown) as MdastRoot;
  const references = new Set<string>();

  visit(tree, "link", (node: Link) => {
    references.add(node.url);
  });
  visit(tree, "image", (node: Image) => {
    references.add(node.url);
  });
  visit(tree, "definition", (node: Definition) => {
    references.add(node.url);
  });
  visit(tree, "html", (node: Html) => discoverHtmlReferences(node.value, references));

  return [...references].sort();
}

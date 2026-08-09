import type { APIRoute } from "astro";

import { readSiteConfig } from "../lib/paths/site-config";

export const prerender = true;

export const GET: APIRoute = () => {
  const config = readSiteConfig();
  const sitemap = new URL(`${config.basePath}sitemap-index.xml`, config.siteUrl);
  return new Response(
    [`User-agent: *`, `Allow: ${config.basePath}`, `Sitemap: ${sitemap.href}`, ""].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
};

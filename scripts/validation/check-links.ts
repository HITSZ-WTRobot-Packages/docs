import { createServer } from "node:net";

import { execa, type ResultPromise } from "execa";
import { check, LinkState } from "linkinator";

import { readSiteConfig } from "../../src/lib/paths/site-config";

async function availablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a link-check preview port."));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForPreview(url: URL, preview: ResultPromise): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (preview.nodeChildProcess.exitCode !== null) {
      throw new Error("Astro preview exited before link checking.");
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for Astro preview at ${url.href}.`);
}

async function stopPreview(preview: ResultPromise): Promise<void> {
  if (preview.nodeChildProcess.exitCode === null) preview.kill("SIGTERM");
  await preview.catch(() => undefined);
}

async function main(): Promise<void> {
  const config = readSiteConfig();
  const port = await availablePort();
  const previewOrigin = `http://127.0.0.1:${port}`;
  const target = new URL(config.basePath, previewOrigin);
  const preview = execa("bun", ["run", "preview", "--host", "127.0.0.1", "--port", String(port)], {
    env: {
      ...process.env,
      ASTRO_PREVIEW_BACKGROUND: "0",
      SITE_URL: config.siteUrl.origin,
      BASE_PATH: config.basePath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  try {
    await waitForPreview(target, preview);
    const result = await check({
      path: target.href,
      recurse: true,
      checkCss: true,
      checkFragments: true,
      concurrency: 30,
      timeout: 30_000,
      linksToSkip: async (link) => new URL(link).origin !== target.origin,
    });
    const broken = result.links.filter((link) => link.state === LinkState.BROKEN);
    const skipped = result.links.filter((link) => link.state === LinkState.SKIPPED);
    if (!result.passed || broken.length > 0) {
      for (const link of broken) {
        console.error(`Broken link: ${link.url} (from ${link.parent ?? "unknown"})`);
      }
      throw new Error(`Linkinator found ${broken.length} broken internal link(s).`);
    }
    console.log(
      `Link check passed for ${result.links.length - skipped.length} internal links; ` +
        `${skipped.length} external links were skipped.`,
    );
  } finally {
    await stopPreview(preview);
  }
}

await main();

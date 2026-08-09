import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import icon from "astro-icon";

import { readSiteConfig } from "./src/lib/paths/site-config";

const siteConfig = readSiteConfig();

export default defineConfig({
  site: siteConfig.siteUrl.href,
  base: siteConfig.basePath,
  output: "static",
  trailingSlash: "always",
  integrations: [
    icon({
      include: {
        lucide: [
          "book-open",
          "boxes",
          "check",
          "chevron-down",
          "circle-alert",
          "circle-check",
          "clipboard",
          "code-2",
          "external-link",
          "file-code-2",
          "git-branch",
          "info",
          "network",
          "package",
          "refresh-cw",
          "search",
          "terminal",
          "triangle-alert",
        ],
      },
    }),
    starlight({
      title: "HITSZ WTR Packages",
      description: "STM32 driver package reference for the HITSZ Wentian Robotics Team.",
      customCss: ["./src/styles/global.css"],
      pagefind: true,
      social: [
        {
          icon: "github",
          label: "HITSZ WTR Packages on GitHub",
          href: "https://github.com/HITSZ-WTRobot-Packages",
        },
      ],
      sidebar: [],
    }),
  ],
});

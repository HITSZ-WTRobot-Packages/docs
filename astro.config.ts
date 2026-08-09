import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

import { readSiteConfig } from "./src/lib/paths/site-config";

const siteConfig = readSiteConfig();

export default defineConfig({
  site: siteConfig.siteUrl.href,
  base: siteConfig.basePath,
  output: "static",
  trailingSlash: "always",
  integrations: [
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
      sidebar: [
        {
          label: "Documentation",
          items: [{ label: "Package catalog", link: "/" }],
        },
      ],
    }),
  ],
});

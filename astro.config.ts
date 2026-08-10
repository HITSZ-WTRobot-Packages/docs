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
      title: "HITSZ-WTRobot-Packages",
      description: "哈尔滨工业大学（深圳）南工问天（HITSZ WTRobot）维护的 STM32 驱动包参考文档。",
      customCss: ["./src/styles/global.css"],
      locales: {
        root: {
          label: "简体中文",
          lang: "zh-CN",
        },
      },
      pagefind: true,
      social: [
        {
          icon: "github",
          label: "HITSZ-WTRobot-Packages GitHub 组织",
          href: "https://github.com/HITSZ-WTRobot-Packages",
        },
      ],
      sidebar: [],
    }),
  ],
});

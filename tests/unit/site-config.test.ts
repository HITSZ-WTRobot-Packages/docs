import { describe, expect, test } from "bun:test";

import {
  DEFAULT_BASE_PATH,
  DEFAULT_SITE_URL,
  normalizeBasePath,
  readSiteConfig,
  sitePath,
  siteUrl,
} from "../../src/lib/paths/site-config";

describe("site configuration", () => {
  test("uses local root defaults", () => {
    const config = readSiteConfig({});

    expect(config.siteUrl.href).toBe(`${DEFAULT_SITE_URL}/`);
    expect(config.basePath).toBe(DEFAULT_BASE_PATH);
  });

  test("accepts an HTTP loopback origin for local and browser-test servers", () => {
    expect(readSiteConfig({ SITE_URL: "http://127.0.0.1:4321" }).siteUrl.href).toBe(
      "http://127.0.0.1:4321/",
    );
  });

  test.each([
    ["/", "/"],
    ["/docs", "/docs/"],
    ["/products/wtr/docs/", "/products/wtr/docs/"],
    ["//products///wtr/docs", "/products/wtr/docs/"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  test.each([
    "docs",
    "../docs",
    "/../docs",
    "/%2e%2e/docs",
    "/docs?mode=test",
    "/docs#top",
    "/docs\\api",
  ])("rejects unsafe base path %s", (input) => {
    expect(() => normalizeBasePath(input)).toThrow("BASE_PATH");
  });

  test.each([
    "not-a-url",
    "ftp://docs.example.org",
    "https://user:secret@docs.example.org",
    "https://docs.example.org/path",
    "https://docs.example.org?preview=1",
  ])("rejects invalid site origin %s", (input) => {
    expect(() => readSiteConfig({ SITE_URL: input })).toThrow("SITE_URL");
  });

  test("builds encoded paths and absolute URLs through one helper", () => {
    const config = readSiteConfig({
      SITE_URL: "https://docs.example.org",
      BASE_PATH: "/products/wtr/docs/",
    });

    expect(sitePath(config.basePath, "packages", "Motor Drivers")).toBe(
      "/products/wtr/docs/packages/Motor%20Drivers/",
    );
    expect(siteUrl(config, "packages", "Motor Drivers").href).toBe(
      "https://docs.example.org/products/wtr/docs/packages/Motor%20Drivers/",
    );
  });
});

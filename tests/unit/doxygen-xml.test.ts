import { describe, expect, test } from "bun:test";

import { parseDoxygenIndex } from "../../src/lib/doxygen/xml";

describe("Doxygen XML boundary", () => {
  test("accepts supported compounds with safe deterministic references", () => {
    const compounds = parseDoxygenIndex(`<?xml version="1.0"?>
      <doxygenindex>
        <compound refid="widget_8hpp" kind="file"><name>widget.hpp</name></compound>
        <compound refid="classfixture_1_1Widget" kind="class"><name>fixture::Widget</name></compound>
        <compound refid="dir_packages" kind="dir"><name>packages</name></compound>
      </doxygenindex>`);
    expect(compounds).toEqual([
      { refId: "classfixture_1_1Widget", kind: "class" },
      { refId: "widget_8hpp", kind: "file" },
    ]);
  });

  test("rejects malformed XML and path-like compound references", () => {
    expect(() => parseDoxygenIndex("<doxygenindex><compound></doxygenindex>")).toThrow();
    expect(() =>
      parseDoxygenIndex(
        '<doxygenindex><compound refid="../../outside" kind="file" /></doxygenindex>',
      ),
    ).toThrow();
  });
});

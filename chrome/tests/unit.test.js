import { test } from "node:test";
import assert from "node:assert/strict";
import { serialize } from "../extension/payload.js";
test("raw value is byte-preserved; rows are only joined on explicit addition", () => {
  assert.equal(
    serialize([{ name: "", value: " fake\nvalue " }]).text,
    " fake\nvalue ",
  );
  assert.deepEqual(
    serialize([
      { name: "", value: "a" },
      { name: "", value: "b" },
    ]),
    { text: "a\nb", filename: "api-key.txt" },
  );
});
test("JSON safely preserves values and prototype-like names", () => {
  const rows = [
    { name: "__proto__", value: 'demo"\\\n' },
    { name: "中文", value: "true" },
  ];
  assert.deepEqual(
    Object.entries(JSON.parse(serialize(rows, "json").text)),
    rows.map((row) => [row.name, row.value]),
  );
});
test("YAML strings and special linebreaks are quoted", () => {
  assert.equal(
    serialize([{ name: "a:b", value: "true\u0085\u2028\u2029" }]).text,
    '"a:b": "true\\u0085\\u2028\\u2029"',
  );
});
test("empty rows, mixed names and duplicates are blocked", () => {
  for (const rows of [
    [],
    [{ name: "", value: "" }],
    [
      { name: "x", value: "a" },
      { name: "", value: "b" },
    ],
    [
      { name: "x", value: "a" },
      { name: "x", value: "b" },
    ],
  ])
    assert.throws(() => serialize(rows));
});
test("explicit JSON/YAML without names are valid scalar or sequence, TXT never discards names", () => {
  assert.equal(
    JSON.parse(serialize([{ name: "", value: "FAKE" }], "json").text),
    "FAKE",
  );
  assert.deepEqual(
    JSON.parse(
      serialize(
        [
          { name: "", value: "a" },
          { name: "", value: "b" },
        ],
        "json",
      ).text,
    ),
    ["a", "b"],
  );
  assert.equal(
    serialize(
      [
        { name: "", value: "a" },
        { name: "", value: "b" },
      ],
      "yaml",
    ).text,
    '- "a"\n- "b"',
  );
  assert.throws(() => serialize([{ name: "KEY", value: "FAKE" }], "txt"));
  assert.throws(() => serialize([{ name: "", value: "FAKE" }], "html"));
});

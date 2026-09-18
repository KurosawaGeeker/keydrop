import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import "../extension/assets.js";

const master = await readFile(
  new URL("../../brand/keydrop-mark.svg", import.meta.url),
);
const asset = (name) => new URL(`../extension/assets/${name}`, import.meta.url);

test("toolbar icons are grayscale exports of the approved SVG", async () => {
  for (const size of [16, 32, 48, 128]) {
    const actual = await readFile(asset(`icon-${size}.png`));
    const expected = await sharp(master)
      .resize(size, size)
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    assert.deepEqual(actual, expected);
    const { data, info } = await sharp(actual)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    for (let i = 0; i < data.length; i += info.channels) {
      assert.equal(data[i], data[i + 1]);
      assert.equal(data[i + 1], data[i + 2]);
    }
  }
});

test("page badge and editor artwork derive from the same SVG", async () => {
  const bundled = globalThis.KeyDropAssets;
  const expected = await sharp(master)
    .resize(64, 64)
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(bundled.logoSize, 64);
  assert.deepEqual(Buffer.from(bundled.logoPixels, "base64"), expected);
  assert.deepEqual(await readFile(asset("mark.svg")), master);
  assert.deepEqual(
    await readFile(asset("mark.png")),
    await sharp(master).resize(256, 256).png().toBuffer(),
  );
});

test("icon attribution is bundled without remote SVG dependencies", async () => {
  assert.doesNotMatch(
    master.toString(),
    /<(?:script|image|foreignObject)\b|\b(?:href|src)=/i,
  );
  assert.deepEqual(
    await readFile(asset("LOBE-ICONS-LICENSE.txt")),
    await readFile(
      new URL("../../brand/LOBE-ICONS-LICENSE.txt", import.meta.url),
    ),
  );
});

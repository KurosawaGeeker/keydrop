import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

test("native protocol validates origin, frame length, operations and never echoes fake secrets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "keydrop-protocol-"));
  const origin = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/";
  try {
    await cp(
      "native/build/keydrop-bridge-test",
      path.join(directory, "bridge"),
    );
    await writeFile(
      path.join(directory, "bridge-config.json"),
      JSON.stringify({ allowedOrigins: [origin] }),
    );
    const run = (payload, caller = origin, fragmented = false) =>
      new Promise((resolve, reject) => {
        const child = spawn(path.join(directory, "bridge"), [caller], {
          env: {
            ...process.env,
            KEYDROP_TEST_ROOT: path.join(directory, "cache"),
            KEYDROP_TEST_PASTEBOARD:
              "KeyDropProtocol-" + path.basename(directory),
          },
        });
        const output = [];
        const errors = [];
        child.stdout.on("data", (chunk) => output.push(chunk));
        child.stderr.on("data", (chunk) => errors.push(chunk));
        child.once("error", reject);
        child.once("exit", () => {
          assert.equal(Buffer.concat(errors).length, 0);
          resolve(Buffer.concat(output));
        });
        if (fragmented) {
          child.stdin.write(payload.subarray(0, 2));
          setTimeout(() => child.stdin.end(payload.subarray(2)), 5);
        } else child.stdin.end(payload);
      });
    const frame = (message) => {
      const content = Buffer.from(JSON.stringify(message));
      const header = Buffer.alloc(4);
      header.writeUInt32LE(content.length);
      return Buffer.concat([header, content]);
    };
    const decode = (buffer) => {
      assert.equal(buffer.readUInt32LE(), buffer.length - 4);
      return JSON.parse(buffer.subarray(4));
    };
    const secret = "KEYDROP_FAKE_PROTOCOL_ONLY";
    const raw = await run(
      frame({ op: "create", text: secret, filename: "api-key.txt" }),
      origin,
      true,
    );
    assert.equal(raw.includes(secret), false);
    const created = decode(raw);
    assert.equal(created.ok, true);
    assert.equal(
      await readFile(
        path.join(directory, "cache", created.id, "api-key.txt"),
        "utf8",
      ),
      secret,
    );
    assert.equal(
      decode(
        await run(
          frame({ op: "copy", id: created.id, filename: "api-key.txt" }),
        ),
      ).ok,
      true,
    );
    assert.equal(
      (
        await run(
          frame({ op: "ping" }),
          "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/",
        )
      ).length,
      0,
    );
    for (const message of [
      { op: "unknown", text: secret },
      { op: "create", text: secret, filename: "../../elsewhere" },
      { op: "copy", id: "../elsewhere", filename: "api-key.txt" },
    ]) {
      const response = await run(frame(message));
      assert.equal(decode(response).ok, false);
      assert.equal(response.includes(secret), false);
    }
    const tooLarge = Buffer.alloc(4);
    tooLarge.writeUInt32LE(1048577);
    assert.equal(decode(await run(tooLarge)).ok, false);
    assert.equal(
      decode(await run(Buffer.from([2, 0, 0, 0, 123, 125]))).ok,
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

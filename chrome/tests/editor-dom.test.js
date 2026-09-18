import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule } from "node:vm";
import { JSDOM } from "jsdom";

// Only shipped local source is evaluated. DOM tests do not launch a browser,
// load external resources or call the real clipboard/native host.
async function setup(
  t,
  {
    failNative = false,
    page = "editor",
    downloads = [],
    url = `https://keydrop.invalid/${page}.html`,
    allowedOrigin = false,
  } = {},
) {
  const base = new URL("../extension/", import.meta.url);
  const dom = new JSDOM(await readFile(new URL(`${page}.html`, base), "utf8"), {
    url,
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const q = (selector) => w.document.querySelector(selector);
  const calls = [];
  let ids = downloads.map((item) => item.id);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.URL.createObjectURL = () =>
    "blob:chrome-extension://test-extension/fixture";
  w.URL.revokeObjectURL = () => {};
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      readText: async () => {
        calls.push({ op: "readClipboard" });
        return "LOCAL_FAKE_KEY";
      },
    },
  });
  w.chrome = {
    runtime: {
      id: "test-extension",
      onMessage: { addListener() {} },
      async sendMessage(message) {
        calls.push(message);
        return { ok: true };
      },
      async sendNativeMessage(host, message) {
        calls.push(message);
        if (failNative) return { ok: false };
        return {
          ok: true,
          id: "local-test-file",
          filename: message.filename,
          count: 3,
        };
      },
    },
    permissions: {
      async request(value) {
        calls.push({ op: "permission", ...value });
        return true;
      },
      async getAll() {
        return { origins: [] };
      },
      async contains() {
        return allowedOrigin;
      },
    },
    storage: {
      local: {
        async get() {
          return { downloadIDs: ids };
        },
        async set(value) {
          ids = value.downloadIDs;
        },
      },
    },
    downloads: {
      async search({ id }) {
        return downloads.filter((item) => item.id === id);
      },
      async removeFile(id) {
        calls.push({ op: "removeDownload", id });
      },
      async erase({ id }) {
        calls.push({ op: "eraseDownload", id });
      },
    },
  };
  const context = dom.getInternalVMContext();
  const assets = new SourceTextModule(
    await readFile(new URL("assets.js", base), "utf8"),
    { context },
  );
  await assets.link(() => {
    throw new Error("Assets must not import");
  });
  await assets.evaluate();
  const modules = new Map();
  async function load(name) {
    if (
      ![
        "editor.js",
        "options.js",
        "payload.js",
        "native.js",
        "cleanup-copy.js",
        "key-rows.js",
      ].includes(name)
    )
      throw new Error("Unexpected module");
    if (modules.has(name)) return modules.get(name);
    const module = new SourceTextModule(
      await readFile(new URL(name, base), "utf8"),
      { context },
    );
    modules.set(name, module);
    await module.link((specifier) => load(specifier.replace(/^\.\//, "")));
    return module;
  }
  await (await load(`${page}.js`)).evaluate();
  return { w, q, calls };
}

test("initial popup implements the removals without hidden key/clipboard work", async (t) => {
  const { q, calls, w } = await setup(t);
  assert.equal(q(".name-field > span").textContent, "名称");
  assert.equal(q(".name").value, "");
  assert.equal(q(".value").type, "password");
  assert.equal(q("#status").hidden, true);
  assert.equal(w.document.querySelectorAll(".row").length, 1);
  assert.equal(w.document.querySelectorAll('input[name="format"]').length, 3);
  assert.equal(q('input[name="format"]:checked').value, "txt");
  for (const selector of [
    ".local",
    ".intro",
    "#count",
    "#format-hint",
    ".editor-foot",
    "details",
    "footer",
    "select",
    ".optional",
    "#clear",
  ])
    assert.equal(q(selector), null, selector);
  assert.equal(q("#cleanup-cache").textContent.trim(), "文件清理");
  assert.equal(q("#site-toggle").disabled, true);
  assert.match(q("#site-permission-state").textContent, /从网站打开/);
  assert.deepEqual(calls, []);
});

test("current website permission is visible and can be enabled explicitly", async (t) => {
  const { q, calls } = await setup(t, {
    url: "chrome-extension://test-extension/editor.html?origin=https%3A%2F%2Fplatform.example.com&tab=42",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(q("#site-toggle").textContent, "允许");
  assert.match(q("#site-permission-state").textContent, /未允许/);
  await q("#site-toggle").onclick();
  assert.equal(calls[0].op, "permission");
  assert.deepEqual([...calls[0].origins], ["https://platform.example.com/*"]);
  assert.equal(calls[1].type, "sync-sites");
  assert.equal(calls[1].tabId, 42);
});

test("three visible formats reach the real serializer and native request; recopy retains id", async (t) => {
  const { q, w, calls } = await setup(t);
  q(".value").value = "LOCAL_FAKE_KEY";
  for (const format of ["txt", "json", "yaml"]) {
    const radio = q(`input[value="${format}"]`);
    radio.checked = true;
    radio.dispatchEvent(new w.Event("change", { bubbles: true }));
    await q("#generate").onclick();
    const request = calls.at(-1);
    assert.equal(request.op, "create");
    assert.equal(request.filename, `api-key.${format}`);
    assert.equal(
      request.text,
      format === "txt" ? "LOCAL_FAKE_KEY" : '"LOCAL_FAKE_KEY"',
    );
    assert.equal(q("#ready").hidden, false);
    assert.equal(q("#status").hidden, true);
    await q("#copy-file").onclick();
    assert.equal(calls.at(-1).op, "copy");
    assert.equal(calls.at(-1).id, "local-test-file");
  }
});

test("add/remove and eye still work; populated removal requires confirmation", async (t) => {
  const { q, w } = await setup(t);
  q(".reveal").click();
  assert.equal(q(".value").type, "text");
  q(".add").click();
  const second = w.document.querySelectorAll(".row")[1];
  second.querySelector(".value").value = "LOCAL_FAKE_SECOND";
  second.querySelector(".remove").click();
  assert.equal(q("#confirm").open, true);
  q("#cancel").click();
  assert.equal(w.document.querySelectorAll(".row").length, 2);
  second.querySelector(".remove").click();
  await q("#confirm-do").onclick();
  assert.equal(w.document.querySelectorAll(".row").length, 1);
  assert.equal(q(".remove").hidden, true);
});

test("cleanup is one button, cancel does nothing, confirm cleans only the chosen scope", async (t) => {
  const { q, calls } = await setup(t);
  q("#cleanup-cache").click();
  assert.equal(q("#confirm").open, true);
  assert.equal(q("#include-downloads").checked, false);
  q("#cancel").click();
  assert.deepEqual(calls, []);
  q("#cleanup-cache").click();
  await q("#confirm-do").onclick();
  assert.deepEqual(
    calls.map((call) => call.op),
    ["cleanup"],
  );
  assert.match(q("#status").textContent, /3 个临时文件/);
});

test("optional download cleanup still rejects unrelated files", async (t) => {
  const { q, calls } = await setup(t, {
    downloads: [
      {
        id: 1,
        byExtensionId: "test-extension",
        url: "blob:chrome-extension://test-extension/test",
        exists: true,
        state: "complete",
      },
      {
        id: 2,
        byExtensionId: "other-extension",
        url: "https://example.invalid/file",
        exists: true,
        state: "complete",
      },
    ],
  });
  q("#cleanup-cache").click();
  q("#include-downloads").checked = true;
  await q("#confirm-do").onclick();
  assert.deepEqual(
    calls.filter((call) => call.op === "removeDownload").map((call) => call.id),
    [1],
  );
  assert.match(q("#status").textContent, /1 项未能清理/);
});

test("native failure stays visible and does not show a false success card", async (t) => {
  const { q } = await setup(t, { failNative: true });
  q(".value").value = "LOCAL_FAKE_KEY";
  await q("#generate").onclick();
  assert.equal(q("#status").hidden, false);
  assert.equal(q("#status").classList.contains("error"), true);
  assert.equal(q("#ready").hidden, true);
  assert.equal(q("#generate").disabled, false);
});

test("settings only request a specific website after explicit submission", async (t) => {
  const { q, calls } = await setup(t, { page: "options" });
  assert.deepEqual(calls, []);
  q("#site-origin").value = "https://platform.example.com/api-keys";
  await q("#site-form").onsubmit({ preventDefault() {} });
  assert.deepEqual([...calls[0].origins], ["https://platform.example.com/*"]);
  assert.equal(calls[1].type, "sync-sites");
});

test("settings reject insecure external websites without permission requests", async (t) => {
  const { q, calls } = await setup(t, { page: "options" });
  q("#site-origin").value = "http://platform.example.com";
  await q("#site-form").onsubmit({ preventDefault() {} });
  assert.deepEqual(calls, []);
  assert.equal(q("#status").classList.contains("error"), true);
});

import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";

let context, worker, extensionID, fixtureDir, server, base, board;
let guard;
const systemClipboard = process.env.KEYDROP_SYSTEM_CLIPBOARD_QA === "1";
const errors = [];
test.beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(tmpdir(), "keydrop-browser-test-"));
  board = systemClipboard
    ? "__general__"
    : "KeyDropTest-" + crypto.randomUUID();
  if (systemClipboard) {
    guard = spawn(
      path.resolve("native/build/clipboard-guard"),
      [path.join(fixtureDir, "cache")],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    await new Promise((resolve, reject) => {
      guard.stdout.once("data", resolve);
      guard.once("error", reject);
    });
  }
  const extension = path.join(fixtureDir, "extension");
  await cp(path.resolve("extension"), extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(
    path.join(extension, "manifest.json"),
    JSON.stringify(manifest),
  );
  const html = await readFile("tests/fixture.html");
  server = createServer((req, res) => {
    res.setHeader("content-type", "text/html;charset=utf-8");
    res.setHeader(
      "content-security-policy",
      "img-src 'none'; connect-src 'none'; object-src 'none'",
    );
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const profile = path.join(fixtureDir, "profile");
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !systemClipboard,
    acceptDownloads: true,
    env: {
      ...process.env,
      KEYDROP_TEST_ROOT: path.join(fixtureDir, "cache"),
      ...(!systemClipboard ? { KEYDROP_TEST_PASTEBOARD: board } : {}),
    },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route(/^https?:\/\//, (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionID = new URL(worker.url()).host;
  const native = path.join(fixtureDir, "native");
  await mkdir(native);
  await cp("native/build/keydrop-bridge-test", path.join(native, "bridge"));
  await writeFile(
    path.join(native, "bridge-config.json"),
    JSON.stringify({ allowedOrigins: [`chrome-extension://${extensionID}/`] }),
  );
  await mkdir(path.join(profile, "NativeMessagingHosts"), { recursive: true });
  await writeFile(
    path.join(profile, "NativeMessagingHosts/ai.keydrop.bridge.json"),
    JSON.stringify({
      name: "ai.keydrop.bridge",
      description: "KeyDrop isolated test",
      path: path.join(native, "bridge"),
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionID}/`],
    }),
  );
  await expect
    .poll(() =>
      worker.evaluate(
        async () =>
          (await chrome.scripting.getRegisteredContentScripts()).length,
      ),
    )
    .toBe(1);
});
test.afterAll(async () => {
  await context?.close();
  if (guard) {
    const ended = new Promise((resolve) => guard.once("exit", resolve));
    guard.stdin.end("restore\n");
    await ended;
  }
  server?.close();
  if (fixtureDir) await rm(fixtureDir, { recursive: true, force: true });
});
async function editor() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionID}/editor.html`);
  await expect(page.locator("#bridge-status")).toContainText("已连接");
  return page;
}
function copiedPath() {
  return execFileSync(path.resolve("native/build/probe"), [board], {
    encoding: "utf8",
  }).trim();
}
async function copiedText() {
  const file = copiedPath();
  // clearContents -> writeObjects is a real, short transition; poll it rather than fail early.
  if (file === "NO_FILE") return "NO_FILE";
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "NO_FILE";
    throw error;
  }
}

test("real native messaging: Generate copies file, recopy reuses file, formats and remove work", async ({}, info) => {
  const page = await editor();
  await expect(page.locator(".row")).toHaveCount(1);
  await expect(page.locator("#format-wrap")).toBeVisible();
  await page
    .getByLabel("API Key", { exact: true })
    .fill("KEYDROP_LOCAL_QA_ONLY");
  await expect(page.locator(".reveal svg")).toBeVisible();
  await page.locator(".reveal").click();
  await expect(page.locator(".value")).toHaveAttribute("type", "text");
  await page.locator(".reveal").click();
  await expect(page.locator(".value")).toHaveAttribute("type", "password");
  await page.locator("#generate").click();
  await expect(page.locator("#status")).toContainText("已生成并复制");
  expect(await copiedText()).toBe("KEYDROP_LOCAL_QA_ONLY");
  const first = copiedPath();
  await page.locator("#copy-file").click();
  await expect(page.locator("#status")).toContainText("已重新复制");
  expect(copiedPath()).toBe(first);
  await page.locator(".add").click();
  await page.getByLabel("API Key", { exact: true }).nth(1).fill("FAKE_SECOND");
  await page.getByLabel("可选名称").nth(0).fill("FIRST_KEY");
  await page.getByLabel("可选名称").nth(1).fill("SECOND_KEY");
  await page.locator("#format").selectOption("json");
  await page.locator("#generate").click();
  await expect(page.locator("#copy-file")).toHaveText("复制 api-key.json");
  expect(JSON.parse(await copiedText())).toEqual({
    FIRST_KEY: "KEYDROP_LOCAL_QA_ONLY",
    SECOND_KEY: "FAKE_SECOND",
  });
  await page.setViewportSize({ width: 550, height: 820 });
  await page.screenshot({
    path: process.env.KEYDROP_PREVIEW_PATH ?? info.outputPath("editor.png"),
    fullPage: true,
  });
  await page.locator("#format").selectOption("yaml");
  await page.locator("#generate").click();
  await expect(page.locator("#copy-file")).toHaveText("复制 api-key.yaml");
  expect(await copiedText()).toContain('"FIRST_KEY": "KEYDROP_LOCAL_QA_ONLY"');
  await page.locator(".remove").nth(1).click();
  await page.locator("#confirm-do").click();
  await expect(page.locator(".row")).toHaveCount(1);
  const store = await page.evaluate(() =>
    Promise.all([
      chrome.storage.local.get(null),
      chrome.storage.session.get(null),
    ]),
  );
  expect(JSON.stringify(store)).not.toContain("KEYDROP_LOCAL_QA_ONLY");
  await page.close();
});

for (const provider of ["deepseek", "openai"]) {
  test(`${provider}: branded shortcut writes actual file clipboard; original Copy opens populated editor`, async ({}, info) => {
    const page = await context.newPage();
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: base,
    });
    await page.goto(base);
    await expect(page.locator("[data-keydrop]")).toHaveCount(2);
    await expect(page.locator("#ordinary + [data-keydrop]")).toHaveCount(0);
    const expected = await page
      .locator(`#${provider}-key`)
      .evaluate((field) => field.value ?? field.textContent);
    const badge = page.locator(`#${provider}-copy + [data-keydrop]`);
    const tabId = await worker.evaluate(
      async (url) => (await chrome.tabs.query({ url: url + "/*" }))[0].id,
      base,
    );
    const [artwork] = await worker.evaluate(
      async (id) =>
        chrome.scripting.executeScript({
          target: { tabId: id },
          func: () => {
            const root = chrome.dom.openOrClosedShadowRoot(
              document.querySelector("[data-keydrop]"),
            );
            const canvas = root.querySelector("canvas");
            return {
              canvas: !!canvas,
              visiblePixels:
                canvas &&
                [
                  ...canvas.getContext("2d").getImageData(0, 0, 64, 64).data,
                ].some(Boolean),
              text: root.querySelector("button").textContent,
            };
          },
        }),
      tabId,
    );
    expect(artwork.result).toEqual({
      canvas: true,
      visiblePixels: true,
      text: "",
    });
    if (provider === "deepseek")
      await page.screenshot({
        path:
          process.env.KEYDROP_BADGE_PREVIEW_PATH ??
          info.outputPath("shortcut.png"),
        fullPage: true,
      });
    const bounds = await badge.boundingBox();
    await page.mouse.click(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await expect.poll(copiedText).toBe(expected);
    const popupPromise = context.waitForEvent("page");
    await page.locator(`#${provider}-copy`).click();
    const popup = await popupPromise;
    await expect(popup.getByLabel("API Key", { exact: true })).toHaveValue(
      expected,
    );
    expect(popup.url()).not.toContain(expected);
    await popup.close();
    await page.close();
  });
}

test("discovery never reads values; synthetic clicks ignored; disabling removes badges", async () => {
  const page = await context.newPage();
  await page.goto(base);
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({ url: url + "/*" }))[0].id,
    base,
  );
  await worker.evaluate(
    async (id) =>
      chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => {
          Object.defineProperty(HTMLInputElement.prototype, "value", {
            get() {
              throw new Error("Secret read during discovery");
            },
          });
        },
      }),
    tabId,
  );
  await page.evaluate(() => {
    document.querySelector("#deepseek-copy").setAttribute("title", "Copy");
    document.querySelector("h1").textContent = "Mock rerender";
  });
  await expect(page.locator("[data-keydrop]")).toHaveCount(2);
  // Only the detector is tested here; remove mock site's own clipboard handler first by replacing button.
  await page.evaluate(() => {
    const button = document.querySelector("#openai-copy");
    button.replaceWith(button.cloneNode(true));
    document.querySelector("#openai-copy").click();
  });
  await page.waitForTimeout(300);
  expect(
    context.pages().filter((item) => item.url().includes("/editor.html")),
  ).toHaveLength(0);
  await worker.evaluate(
    async (id) =>
      chrome.tabs.sendMessage(id, { type: "detector-toggle", enabled: false }),
    tabId,
  );
  await expect(page.locator("[data-keydrop]")).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.close();
});

test("brand, copy, accessible states and compact layout in both themes", async ({}, info) => {
  const page = await editor();
  await expect(page.locator("#format")).toHaveValue("txt");
  await expect(page.locator(".name")).toHaveValue("");
  await expect(page.locator(".value")).toHaveValue("");
  await expect(page.locator("h1")).toContainText("把 Key 交给你的 Agent");
  expect(
    await page
      .locator(".brand-mark")
      .evaluate((img) => img.complete && img.naturalWidth === 128),
  ).toBe(true);
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  expect(Object.keys(manifest.icons)).toEqual(["16", "32", "48", "128"]);
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [360, 550]) {
      await page.setViewportSize({ width, height: 820 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((item) => ({
          id: item.id,
          targets: item.nodes.map((node) => node.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: process.env.KEYDROP_BRAND_PREVIEW_DIR
          ? path.join(
              process.env.KEYDROP_BRAND_PREVIEW_DIR,
              `KeyDrop-${theme}-${width}.png`,
            )
          : info.outputPath(`${theme}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await page.locator(".add").click();
  await page.locator(".value").nth(1).fill("FAKE_BRAND_QA");
  await page.locator(".remove").nth(1).click();
  await expect(page.locator("#confirm")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".row")).toHaveCount(2);
  await page.locator("#clear").click();
  await page.locator("#confirm-do").click();
  await expect(page.locator(".row")).toHaveCount(1);
  await expect(page.locator(".value")).toHaveValue("");
  await page.close();
});

test("native-helper failure is visible; no false clipboard success; cleanup requires confirmation", async () => {
  const page = await editor();
  await page.locator(".value").fill("KEYDROP_LOCAL_QA_ONLY");
  const registration = path.join(
    fixtureDir,
    "profile/NativeMessagingHosts/ai.keydrop.bridge.json",
  );
  const saved = await readFile(registration);
  await rm(registration);
  await page.locator("#generate").click();
  await expect(page.locator("#status")).toContainText("未能确认");
  await expect(page.locator("#ready")).toBeHidden();
  await writeFile(registration, saved);
  await page.locator("#generate").click();
  await expect(page.locator("#status")).toContainText("已生成并复制");
  await page.locator(".cleanup-settings > summary").click();
  await page.locator("#cleanup-cache").click();
  await expect(page.locator("#confirm")).toBeVisible();
  await page.locator("#cancel").click();
  expect(await copiedText()).toBe("KEYDROP_LOCAL_QA_ONLY");
  await page.locator("#cleanup-cache").click();
  await page.locator("#confirm-do").click();
  await expect(page.locator("#status")).toContainText("已删除");
  await page.close();
});

test("system clipboard accepts Cmd+V as an actual File in an ordinary local webpage", async () => {
  test.skip(
    !systemClipboard,
    "Explicit opt-in test touches system clipboard with fake data and restores locally.",
  );
  const page = await context.newPage();
  await page.goto(base);
  const popup = await editor();
  await popup.locator(".value").fill("KEYDROP_LOCAL_QA_ONLY");
  await popup.locator("#generate").click();
  await expect(popup.locator("#status")).toContainText("已生成并复制");
  await page.bringToFront();
  await page.locator("#paste").click();
  await page.keyboard.press("Meta+v");
  await expect(page.locator("#paste-result")).toHaveText(
    "api-key.txt · 文件内容匹配：true",
  );
  await popup.close();
  await page.close();
});

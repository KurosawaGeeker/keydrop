import { nativeRequest } from "./native.js";

const editorURL = chrome.runtime.getURL("editor.html");
const captures = new Map();
let opening;
let syncing = Promise.resolve();
async function reportFailure() {
  // Only a fixed status is exposed; never log native payloads, keys, URLs or exception messages.
  await chrome.action.setBadgeText({ text: "!" });
  await chrome.action.setBadgeBackgroundColor({ color: "#b43c46" });
  await chrome.action.setTitle({
    title: "KeyDrop 操作未完成，请打开检查或重新加载插件",
  });
}

const validValue = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 65536;

async function openEditor(tab, value) {
  if (opening) return opening;
  opening = (async () => {
    const existing = (await chrome.tabs.query({})).find(
      (item) => item.url?.split("?")[0] === editorURL,
    );
    if (existing) {
      await chrome.windows.update(existing.windowId, { focused: true });
      // The window may close between the tab query and this best-effort draft reminder.
      await chrome.runtime
        .sendMessage({ type: "copy-pending" })
        .catch(() => {});
      return;
    }
    const query = new URLSearchParams();
    if (tab?.url?.startsWith("http"))
      query.set("origin", new URL(tab.url).origin);
    if (tab?.id) query.set("tab", tab.id);
    let token;
    if (validValue(value)) {
      token = crypto.randomUUID();
      captures.set(token, { value, expires: Date.now() + 15000 });
      setTimeout(() => captures.delete(token), 15000);
      query.set("capture", token);
    }
    try {
      await chrome.windows.create({
        url: `${editorURL}?${query}`,
        type: "popup",
        width: 550,
        height: 770,
      });
      await chrome.action.setBadgeText({ text: "" });
    } catch (error) {
      if (token) captures.delete(token);
      throw error;
    }
  })().finally(() => {
    opening = undefined;
  });
  return opening;
}

function syncSites() {
  // A failed previous registration must not permanently poison subsequent user retries.
  syncing = syncing
    .catch(() => {})
    .then(async () => {
      const { origins = [] } = await chrome.permissions.getAll();
      const old = await chrome.scripting.getRegisteredContentScripts();
      if (old.length)
        await chrome.scripting.unregisterContentScripts({
          ids: old.map((item) => item.id),
        });
      if (origins.length)
        await chrome.scripting.registerContentScripts([
          {
            id: "keydrop-sites",
            matches: origins,
            js: ["assets.js", "detector.js"],
            runAt: "document_start",
            persistAcrossSessions: true,
          },
        ]);
    });
  return syncing;
}

async function handle(message, sender) {
  if (sender.id !== chrome.runtime.id) return { ok: false };
  if (["credential-copy", "create-from-page"].includes(message?.type)) {
    if (
      !sender.tab ||
      sender.frameId !== 0 ||
      !/^https?:\/\//.test(sender.url ?? "")
    )
      return { ok: false };
    const origin = new URL(sender.url).origin;
    if (!(await chrome.permissions.contains({ origins: [origin + "/*"] })))
      return { ok: false };
    if (message.type === "credential-copy") {
      await openEditor(sender.tab, message.value);
      return { ok: true };
    }
    if (!validValue(message.value)) return { ok: false };
    await nativeRequest({
      op: "create",
      text: message.value,
      filename: "api-key.txt",
    });
    // A website receives only completion, never a credential, file path or reusable file handle.
    return { ok: true };
  }
  if (sender.url?.split("?")[0] !== editorURL) return { ok: false };
  if (message?.type === "take-capture") {
    const token = new URL(sender.url).searchParams.get("capture");
    const item = captures.get(token);
    captures.delete(token);
    return {
      ok: true,
      value: item?.expires > Date.now() ? item.value : undefined,
    };
  }
  if (message?.type === "sync-sites") {
    await syncSites();
    if (Number.isInteger(message.tabId) && message.tabId > 0) {
      const tab = await chrome.tabs.get(message.tabId);
      if (
        /^https?:\/\//.test(tab.url ?? "") &&
        (await chrome.permissions.contains({
          origins: [new URL(tab.url).origin + "/*"],
        }))
      ) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["assets.js", "detector.js"],
        });
        await chrome.tabs.sendMessage(tab.id, {
          type: "detector-toggle",
          enabled: true,
        });
      }
    }
    return { ok: true };
  }
  if (
    message?.type === "disable-site" &&
    /^https?:\/\//.test(message.origin ?? "")
  ) {
    const pattern = new URL(message.origin).origin + "/*";
    for (const tab of await chrome.tabs.query({ url: pattern })) {
      // Tabs without a detector (or closing tabs) have nothing to disable.
      await chrome.tabs
        .sendMessage(tab.id, { type: "detector-toggle", enabled: false })
        .catch(() => {});
    }
    await chrome.permissions.remove({ origins: [pattern] });
    return { ok: true };
  }
  return { ok: false };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === "copy-pending") return false;
  handle(message, sender).then(respond, () =>
    respond({ ok: false, error: "操作未完成，请打开 KeyDrop 检查本机助手。" }),
  );
  return true;
});
chrome.action.onClicked.addListener((tab) => {
  openEditor(tab).catch(reportFailure);
});
chrome.runtime.onInstalled.addListener(() => {
  syncSites().catch(reportFailure);
});
chrome.runtime.onStartup.addListener(() => {
  syncSites().catch(reportFailure);
});
chrome.permissions.onAdded.addListener(() => {
  syncSites().catch(reportFailure);
});
chrome.permissions.onRemoved.addListener(() => {
  syncSites().catch(reportFailure);
});

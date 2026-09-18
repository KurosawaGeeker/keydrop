import { serialize } from "./payload.js";
import { nativeRequest } from "./native.js";
import { cleanupCopy } from "./cleanup-copy.js";
import { createKeyRows } from "./key-rows.js";

const $ = (selector) => document.querySelector(selector);
function renderIcons(root) {
  // Only build-time bundled SVGs are inserted, never user or website content.
  for (const element of root.querySelectorAll("[data-icon]"))
    element.innerHTML = KeyDropAssets.icons[element.dataset.icon];
}
renderIcons(document);
const query = new URLSearchParams(location.search);
const origin = query.get("origin") || "";
const sourceTab = Number(query.get("tab"));
let activeValue;
let fileURL;
let generated;
let copiedFile;
let busy = false;
const selectedFormat = () => $('input[name="format"]:checked').value;
let downloadStarting = false;
const objectURLs = new Set();
const rows = () => [...document.querySelectorAll(".row")];
const data = () =>
  rows().map((row) => ({
    name: row.querySelector(".name").value,
    value: row.querySelector(".value").value,
  }));

function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").hidden = !text;
  $("#status").classList.toggle("error", error);
}
function invalidate() {
  $("#ready").hidden = true;
  generated = undefined;
  copiedFile = undefined;
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  fileURL = undefined;
  status("");
}
function confirmAction(title, body, action, cleanup = false) {
  $("#cleanup-options").hidden = !cleanup;
  $("#include-downloads").checked = false;
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-do").onclick = () => {
    $("#confirm").close();
    return action();
  };
  $("#confirm").showModal();
}
$("#cancel").onclick = () => $("#confirm").close();

const siteToggle = $("#site-toggle");
const sitePermissionState = $("#site-permission-state");
function setSitePermissionUI({ allowed = false, unavailable = false } = {}) {
  if (unavailable) {
    sitePermissionState.textContent = "从网站打开插件后可配置";
    siteToggle.textContent = "不可用";
    siteToggle.disabled = true;
    return;
  }
  sitePermissionState.textContent = allowed
    ? "已允许在复制按钮旁显示 KeyDrop"
    : "未允许在复制按钮旁显示 KeyDrop";
  siteToggle.textContent = allowed ? "关闭" : "允许";
  siteToggle.disabled = false;
  siteToggle.setAttribute("aria-pressed", String(allowed));
}
async function refreshSitePermission() {
  if (!origin || !siteToggle) {
    setSitePermissionUI({ unavailable: true });
    return;
  }
  try {
    const allowed = await chrome.permissions.contains({
      origins: [`${origin}/*`],
    });
    setSitePermissionUI({ allowed });
  } catch {
    sitePermissionState.textContent = "无法读取网站权限状态";
    siteToggle.textContent = "重试";
    siteToggle.disabled = false;
  }
}
siteToggle.onclick = async () => {
  siteToggle.disabled = true;
  try {
    const pattern = `${origin}/*`;
    const allowed = await chrome.permissions.contains({ origins: [pattern] });
    if (allowed) {
      const result = await chrome.runtime.sendMessage({
        type: "disable-site",
        origin,
      });
      if (!result?.ok) throw new Error("disable-failed");
    } else {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) {
        setSitePermissionUI({ allowed: false });
        return;
      }
      const result = await chrome.runtime.sendMessage({
        type: "sync-sites",
        tabId: sourceTab,
      });
      if (!result?.ok) throw new Error("sync-failed");
    }
    await refreshSitePermission();
  } catch {
    sitePermissionState.textContent = "操作未完成，请重试";
    siteToggle.textContent = "重试";
    siteToggle.disabled = false;
  }
};
refreshSitePermission();

const { addRow } = createKeyRows({
  container: $("#rows"),
  template: $("#row-template"),
  icons: KeyDropAssets.icons,
  onChange: invalidate,
  onActive: (value) => {
    activeValue = value;
  },
  confirmRemove: (remove) =>
    confirmAction(
      "移除这一行？",
      "这一行已填写的名称和 API Key 将被移除。",
      remove,
    ),
});

async function readClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) {
      status("剪贴板中没有文本。", true);
      return;
    }
    if (text.length > 65536) {
      status("剪贴板内容过长，请手动粘贴需要的部分。", true);
      return;
    }
    (activeValue ?? rows()[0].querySelector(".value")).value = text;
    invalidate();
  } catch {
    status("无法读取剪贴板，请点击输入框并按 ⌘V / Ctrl+V。", true);
  }
}
$("#read").onclick = async () => {
  try {
    if (await chrome.permissions.request({ permissions: ["clipboardRead"] }))
      await readClipboard();
    else status("未开启剪贴板读取，可直接手动粘贴。");
  } catch {
    status("无法申请剪贴板权限，请手动粘贴。", true);
  }
};
$("#format").onchange = invalidate;
async function withBusy(action) {
  if (busy) return;
  busy = true;
  $(".editor").setAttribute("aria-busy", "true");
  const controls = [...document.querySelectorAll("button,input,select")].filter(
    (control) => !control.disabled,
  );
  controls.forEach((control) => {
    control.disabled = true;
  });
  try {
    await action();
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    $(".editor").setAttribute("aria-busy", "false");
    controls.forEach((control) => {
      control.disabled = false;
    });
  }
}
$("#generate").onclick = () =>
  withBusy(async () => {
    invalidate();
    try {
      generated = serialize(data(), selectedFormat());
      status("正在本机生成并复制文件…");
      copiedFile = await nativeRequest({
        op: "create",
        text: generated.text,
        filename: generated.filename,
      });
      fileURL = URL.createObjectURL(
        new Blob([generated.text], { type: "text/plain;charset=utf-8" }),
      );
      objectURLs.add(fileURL);
      $("#download").href = fileURL;
      $("#download").download = generated.filename;
      $("#download").textContent = "下载副本";
      $("#copy-file").textContent = `复制 ${generated.filename}`;
      $("#file-name").textContent = generated.filename;
      $("#ready").hidden = false;
      status("");
    } catch (error) {
      status(error.message, true);
    }
  });
$("#copy-file").onclick = () =>
  withBusy(async () => {
    if (!copiedFile) return;
    await nativeRequest({
      op: "copy",
      id: copiedFile.id,
      filename: copiedFile.filename,
    });
    status(`${copiedFile.filename} 已重新复制。`);
  });
$("#cleanup-cache").onclick = () =>
  confirmAction(
    cleanupCopy.title,
    cleanupCopy.body,
    () =>
      withBusy(async () => {
        const includeDownloads = $("#include-downloads").checked;
        const result = await nativeRequest({ op: "cleanup" });
        invalidate();
        if (includeDownloads) {
          const downloads = await cleanupDownloads();
          status(
            downloads.remaining
              ? `已清理 ${result.count} 个临时文件、${downloads.removed} 个下载副本；${downloads.remaining} 项未能清理，请检查下载列表。`
              : `已清理 ${result.count} 个临时文件、${downloads.removed} 个下载副本。`,
            downloads.remaining > 0,
          );
        } else status(`已清理 ${result.count} 个临时文件。`);
      }),
    true,
  );
$("#download").onclick = async (event) => {
  event.preventDefault();
  if (!generated || !fileURL || downloadStarting) return;
  downloadStarting = true;
  $("#cleanup-cache").disabled = true;
  try {
    const id = await chrome.downloads.download({
      url: fileURL,
      filename: `KeyDrop/${Date.now()}-${crypto.randomUUID().slice(0, 8)}/${generated.filename}`,
      conflictAction: "uniquify",
      saveAs: false,
    });
    const { downloadIDs = [] } = await chrome.storage.local.get("downloadIDs");
    await chrome.storage.local.set({
      downloadIDs: [...new Set([...downloadIDs, id])],
    });
    status("已开始下载，可在浏览器的下载列表查看。");
  } catch {
    status("下载未完成，请检查浏览器的下载列表后重试。", true);
  } finally {
    downloadStarting = false;
    $("#cleanup-cache").disabled = false;
  }
};
$("#drag").addEventListener("dragstart", (event) => {
  if (!generated || !fileURL) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.items.add(
    new File([generated.text], generated.filename, { type: "text/plain" }),
  );
  event.dataTransfer.setData(
    "DownloadURL",
    `text/plain:${generated.filename}:${fileURL}`,
  );
});
async function cleanupDownloads() {
  const { downloadIDs = [] } = await chrome.storage.local.get("downloadIDs");
  const remaining = [];
  let removed = 0;
  for (const id of downloadIDs) {
    try {
      const [item] = await chrome.downloads.search({ id });
      if (!item) continue;
      // Exact recorded IDs + Chrome's extension attribution + generated blob origin.
      // Do not infer ownership from a filename: Chrome/user settings can rename it.
      if (
        item.byExtensionId !== chrome.runtime.id ||
        !item.url.startsWith(`blob:chrome-extension://${chrome.runtime.id}/`)
      ) {
        remaining.push(id);
        continue;
      }
      if (item.state === "in_progress") {
        remaining.push(id);
        continue;
      }
      if (item.exists) {
        await chrome.downloads.removeFile(id);
        removed++;
      }
      await chrome.downloads.erase({ id });
    } catch {
      remaining.push(id);
    }
  }
  await chrome.storage.local.set({ downloadIDs: remaining });

  return { removed, remaining: remaining.length };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "copy-pending")
    status("检测到新的复制操作。当前输入已保留，点击“读取剪贴板”填入所选行。");
});
window.addEventListener("pagehide", () => {
  for (const row of rows()) row.querySelector(".value").value = "";
  for (const url of objectURLs) URL.revokeObjectURL(url);
});
addRow();
if (query.has("capture")) {
  const result = await chrome.runtime.sendMessage({ type: "take-capture" });
  history.replaceState(
    null,
    "",
    location.pathname +
      "?origin=" +
      encodeURIComponent(origin) +
      "&tab=" +
      sourceTab,
  );
  if (result?.value) {
    activeValue.value = result.value;
    invalidate();
  } else status("未能取得完整字段，请手动粘贴。", true);
}

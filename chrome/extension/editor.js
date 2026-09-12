import { serialize } from "./payload.js";
import { nativeRequest } from "./native.js";

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
  $("#status").classList.toggle("error", error);
}
function invalidate() {
  $("#ready").hidden = true;
  generated = undefined;
  copiedFile = undefined;
  for (const url of objectURLs) URL.revokeObjectURL(url);
  objectURLs.clear();
  fileURL = undefined;
  $("#count").textContent = `${rows().length} 个`;
  for (const row of rows())
    row.querySelector(".remove").hidden = rows().length === 1;
  $("#format-hint").textContent =
    $("#format").value === "txt"
      ? "名称留空，TXT 只保留 Key；多个 Key 按行分隔。"
      : "名称选填；填写后，请给每个 Key 起一个不重复的名称。";
  status("准备好后，生成文件并直接粘贴。");
}
function confirmAction(title, body, action) {
  $("#confirm-title").textContent = title;
  $("#confirm-body").textContent = body;
  $("#confirm-do").onclick = () => {
    $("#confirm").close();
    action();
  };
  $("#confirm").showModal();
}
$("#cancel").onclick = () => $("#confirm").close();

function addRow(after) {
  const row = $("#row-template").content.firstElementChild.cloneNode(true);
  renderIcons(row);
  if (after) after.after(row);
  else $("#rows").append(row);
  const value = row.querySelector(".value");
  row.addEventListener("focusin", () => {
    activeValue = value;
  });
  row.addEventListener("input", invalidate);
  row.querySelector(".reveal").onclick = (event) => {
    const visible = value.type === "password";
    value.type = visible ? "text" : "password";
    event.currentTarget.setAttribute(
      "aria-label",
      visible ? "隐藏 API Key" : "显示 API Key",
    );
    event.currentTarget.title = visible ? "隐藏 API Key" : "显示 API Key";
    event.currentTarget.setAttribute("aria-pressed", String(visible));
    event.currentTarget.innerHTML =
      KeyDropAssets.icons[visible ? "eye-off" : "eye"];
  };
  row.querySelector(".add").onclick = () => addRow(row);
  row.querySelector(".remove").onclick = () => {
    const remove = () => {
      if (rows().length <= 1) return;
      row.remove();
      activeValue = rows()[0].querySelector(".value");
      invalidate();
      activeValue.focus();
    };
    if (value.value || row.querySelector(".name").value)
      confirmAction(
        "移除这一行？",
        "这一行已填写的名称和 API Key 将被移除。",
        remove,
      );
    else remove();
  };
  invalidate();
  activeValue = value;
  value.focus();
  row.scrollIntoView({ block: "nearest" });
}

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
    status("已从本机剪贴板填入，请确认内容后生成文件。");
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
      generated = serialize(data(), $("#format").value);
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
      status(`${generated.filename} 已生成并复制，去目标输入框按 ⌘V 粘贴。`);
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
    "清理本机临时文件？",
    "永久删除 KeyDrop 应用和本插件在 KeyDrop 缓存中生成的密钥文件，所有时间段都会清理。无法撤销；不包含下载副本、手动移动或已上传的文件。",
    () =>
      withBusy(async () => {
        const result = await nativeRequest({ op: "cleanup" });
        invalidate();
        status(`已删除 ${result.count} 个本机临时文件，无法撤销。`);
      }),
  );
$("#download").onclick = async (event) => {
  event.preventDefault();
  if (!generated || !fileURL || downloadStarting) return;
  downloadStarting = true;
  $("#cleanup").disabled = true;
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
    $("#cleanup").disabled = false;
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
$("#clear").onclick = () =>
  confirmAction(
    "清空当前输入？",
    "移除窗口中的所有名称和密钥。已生成的文件和剪贴板内容不受影响。",
    () => {
      $("#rows").replaceChildren();
      for (const url of objectURLs) URL.revokeObjectURL(url);
      objectURLs.clear();
      fileURL = undefined;
      addRow();
      status("当前输入已清空。");
    },
  );
$("#cleanup").onclick = () =>
  confirmAction(
    "清理本插件下载的文件？",
    "永久删除本插件记录的、仍在原下载路径的密钥文件，并移除对应下载记录。无法撤销；不包含 macOS 应用缓存、手动复制或移动的文件。",
    async () => {
      $("#cleanup").disabled = true;
      try {
        const { downloadIDs = [] } =
          await chrome.storage.local.get("downloadIDs");
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
              !item.url.startsWith(
                `blob:chrome-extension://${chrome.runtime.id}/`,
              )
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
        status(
          remaining.length
            ? `已删除 ${removed} 个文件，${remaining.length} 项未能清理，请检查下载列表。`
            : `已清理 ${removed} 个文件。`,
          remaining.length > 0,
        );
      } catch {
        status("清理未完成，请稍后重试。", true);
      } finally {
        $("#cleanup").disabled = false;
      }
    },
  );

async function showSites() {
  const permissions = await chrome.permissions.getAll();
  const origins = permissions.origins ?? [];
  $("#sites").replaceChildren();
  for (const pattern of origins) {
    const line = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = pattern.replace(/\/\*$/, "");
    const remove = document.createElement("button");
    remove.textContent = "关闭";
    remove.onclick = () => disableSite(label.textContent);
    line.append(label, remove);
    $("#sites").append(line);
  }
  if (!origins.length) $("#sites").textContent = "尚未开启任何网站。";
  const supported =
    /^https:\/\//.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (supported) {
    $("#site-name").textContent = origin;
    const enabled = await chrome.permissions.contains({
      origins: [origin + "/*"],
    });
    $("#enable").hidden = enabled;
    $("#disable").hidden = !enabled;
  }
}
async function disableSite(site) {
  try {
    const result = await chrome.runtime.sendMessage({
      type: "disable-site",
      origin: site,
    });
    if (!result?.ok) throw new Error();
    await showSites();
    status("已关闭该网站的快捷入口。");
  } catch {
    status("关闭失败，请到浏览器扩展管理中移除网站权限。", true);
  }
}
$("#enable").onclick = async () => {
  try {
    const allowed = await chrome.permissions.request({
      origins: [origin + "/*"],
    });
    if (!allowed) {
      status("未开启；仍可手动粘贴和生成文件。");
      return;
    }
    const result = await chrome.runtime.sendMessage({
      type: "sync-sites",
      tabId: sourceTab,
    });
    await showSites();
    status(
      result?.ok
        ? "已开启，请返回网站点击复制密钥按钮。"
        : "权限已开启，请刷新目标网页后使用。",
    );
  } catch {
    status("未能开启，请刷新目标网页后重试。", true);
  }
};
$("#disable").onclick = () => disableSite(origin);
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "copy-pending")
    status("检测到新的复制操作。当前输入已保留，点击“读取剪贴板”填入所选行。");
});
window.addEventListener("pagehide", () => {
  for (const row of rows()) row.querySelector(".value").value = "";
  for (const url of objectURLs) URL.revokeObjectURL(url);
});
addRow();
await showSites();
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
    status("已在本机填入刚点击的字段，请确认后生成文件。");
  } else status("未能取得完整字段，请手动粘贴。", true);
}
nativeRequest({ op: "ping" }).then(
  () => {
    $("#bridge-status").textContent = "本机助手已连接";
  },
  () => {
    $("#bridge-status").textContent =
      "本机助手未连接，暂时无法生成并复制文件。";
    $("#bridge-status").classList.add("error");
  },
);

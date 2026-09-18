import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import "../extension/assets.js";
import { cleanupCopy } from "../extension/cleanup-copy.js";
import { createKeyRows } from "../extension/key-rows.js";

// Use shipped UI and row interactions, without connecting sensitive operations.
export async function buildPreview() {
  const base = new URL("../extension/", import.meta.url);
  const dom = new JSDOM(await readFile(new URL("editor.html", base), "utf8"));
  const doc = dom.window.document;
  doc.querySelectorAll("script,link").forEach((node) => node.remove());
  const style = doc.createElement("style");
  style.textContent = await readFile(new URL("editor.css", base), "utf8");
  doc.head.append(style);
  doc.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = globalThis.KeyDropAssets.icons[node.dataset.icon];
  });
  doc.querySelector(".brand-mark").src =
    `data:image/png;base64,${(await readFile(new URL("assets/icon-128.png", base))).toString("base64")}`;
  // Rows are interactive, inputs read-only; no native, file, clipboard or network API.
  const script = doc.createElement("script");
  script.textContent = `
const createKeyRows = ${createKeyRows.toString()};
const { addRow } = createKeyRows({
  container: document.querySelector('#rows'),
  template: document.querySelector('#row-template'),
  icons: ${JSON.stringify(Object.fromEntries(["eye", "eye-off", "plus", "minus"].map((name) => [name, globalThis.KeyDropAssets.icons[name]])))},
  readOnly: true,
  onChange: () => {},
  onActive: () => {},
  confirmRemove: (remove) => {
    document.querySelector('#confirm-title').textContent = '移除这一行？';
    document.querySelector('#confirm-body').textContent = '这一行已填写的名称和 API Key 将被移除。';
    document.querySelector('#cleanup-options').hidden = true;
    document.querySelector('#confirm-do').disabled = false;
    document.querySelector('#confirm-do').title = '';
    document.querySelector('#confirm-do').onclick = () => {
      document.querySelector('#confirm').close();
      remove();
    };
    document.querySelector('#confirm').showModal();
  },
});
addRow();
document.querySelector('#cleanup-cache').onclick = () => {
  document.querySelector('#confirm-title').textContent = ${JSON.stringify(cleanupCopy.title)};
  document.querySelector('#confirm-body').textContent = ${JSON.stringify(cleanupCopy.body)};
  document.querySelector('#cleanup-options').hidden = false;
  document.querySelector('#include-downloads').checked = false;
  document.querySelector('#confirm-do').disabled = true;
  document.querySelector('#confirm-do').onclick = null;
  document.querySelector('#confirm-do').title = '仅预览，不会删除文件';
  document.querySelector('#confirm').showModal();
};
document.querySelector('#cancel').onclick = () => document.querySelector('#confirm').close();
document.querySelector('#site-permission-state').textContent = '从网站打开插件后可配置';
document.querySelector('#site-toggle').textContent = '不可用';
document.querySelector('#site-toggle').disabled = true;
`;
  const hash = createHash("sha256").update(script.textContent).digest("base64");
  const csp = doc.createElement("meta");
  csp.httpEquiv = "Content-Security-Policy";
  csp.content = `default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; form-action 'none'; base-uri 'none'`;
  doc.head.prepend(csp);
  doc.body.append(script);
  const html = dom.serialize();
  dom.window.close();
  return html;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output = process.argv[2];
  if (!output) throw new Error("Provide an output HTML path");
  await writeFile(output, await buildPreview());
  console.log("Updated offline popup preview with interactive row controls.");
}

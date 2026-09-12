(() => {
  if (globalThis.__keydropDetector === "0.3.0") return;
  globalThis.__keydropDetector = "0.3.0";
  const buttons = 'button,[role="button"],clipboard-copy,.ds-button';
  const dialogs =
    'dialog,[role="dialog"],[aria-modal="true"],.ds-modal,.ds-modal-content,[data-slot="dialog-content"]';
  const headings =
    'h1,h2,h3,h4,h5,h6,[role="heading"],legend,label,.ds-modal-content__title';
  const credential = /api[\s_-]*keys?|secret[\s_-]*keys?|密钥|金鑰|秘钥/i;
  const copyLabel = /\bcopy\b|\bcopied\b|复制|已复制|複製/i;
  const badges = new Map();
  let enabled = true;
  let timer;
  let lastCopy = 0;

  // Discovery reads short UI labels only, never field values, clipboard contents or whole dialogs.
  function label(element, depth = 0) {
    if (
      !element ||
      depth > 4 ||
      element.matches?.("input,textarea,code,pre,svg,[data-keydrop]")
    )
      return "";
    let text = "";
    for (const child of element.childNodes) {
      text +=
        child.nodeType === Node.TEXT_NODE
          ? child.textContent
          : label(child, depth + 1);
      if (text.length > 120) return "";
    }
    return text.trim();
  }
  function publicLabel(element) {
    const text =
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      label(element);
    return text.length <= 120 && !/\bsk-[A-Za-z0-9_-]{8,}/.test(text)
      ? text
      : "";
  }
  function titled(container) {
    if (!container) return false;
    if (credential.test(container.getAttribute("aria-label") || ""))
      return true;
    const ids = (container.getAttribute("aria-labelledby") || "").split(/\s+/);
    if (
      ids.some((id) =>
        credential.test(
          publicLabel(
            document.getElementById(id) || document.createElement("span"),
          ),
        ),
      )
    )
      return true;
    return [...container.querySelectorAll(headings)].some((item) =>
      credential.test(publicLabel(item)),
    );
  }
  function matches(button) {
    if (
      !enabled ||
      !button?.isConnected ||
      !button.getClientRects().length ||
      button.disabled ||
      button.getAttribute("aria-disabled") === "true"
    )
      return false;
    const text = publicLabel(button);
    if (!copyLabel.test(text)) return false;
    if (credential.test(text) || titled(button.closest(dialogs))) return true;
    let parent = button.parentElement;
    for (
      let depth = 0;
      parent && depth < 7;
      depth++, parent = parent.parentElement
    ) {
      if (
        parent.matches("body,main,article,nav") ||
        parent.querySelectorAll(buttons).length > 8
      )
        break;
      if (titled(parent)) return true;
    }
    return false;
  }
  function usable(value) {
    return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= 65536 &&
      !/[•●…]|\*{3,}/.test(value)
    );
  }
  // Called only inside a trusted user gesture. No pre-click secret inspection or polling.
  function clickedValue(button) {
    const explicit = button.getAttribute("data-clipboard-text");
    if (usable(explicit)) return explicit;
    const dialog = button.closest(dialogs);
    let parent = button.parentElement;
    for (
      let depth = 0;
      parent && depth < 7;
      depth++, parent = parent.parentElement
    ) {
      if (parent.matches("body,main,article,nav")) break;
      const fields = [
        ...parent.querySelectorAll(
          'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea',
        ),
      ].filter((item) => item.getClientRects().length);
      if (fields.length === 1 && usable(fields[0].value))
        return fields[0].value;
      const codes = [...parent.querySelectorAll("code,pre")].filter(
        (item) =>
          !item.querySelector("code,pre") && item.getClientRects().length,
      );
      if (
        !fields.length &&
        codes.length === 1 &&
        usable(codes[0].textContent.trim())
      )
        return codes[0].textContent.trim();
      if (!fields.length && !codes.length) {
        const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
        const candidates = new Set();
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (
            node.parentElement.closest(
              `${buttons},${headings},[data-keydrop],script,style`,
            ) ||
            !node.parentElement.getClientRects().length
          )
            continue;
          const text = node.textContent.trim();
          if (/^sk-[A-Za-z0-9_-]{8,}$/.test(text)) candidates.add(text);
        }
        if (candidates.size === 1) return [...candidates][0];
      }
      if (parent === dialog || fields.length > 1) break;
    }
  }
  function attach(button) {
    const host = document.createElement("span");
    host.dataset.keydrop = "action";
    host.style.cssText =
      "display:inline-flex;vertical-align:middle;margin-left:6px;position:relative;flex-shrink:0;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent =
      ":host{all:initial}button{display:grid;place-items:center;width:34px;height:34px;padding:3px;border:1px solid #567d65;border-radius:9px;background:#c6ebd5;color:#244732;cursor:pointer}button:hover{background:#b3dfc5}button:focus-visible{outline:2px solid #347a50;outline-offset:3px}button:disabled{opacity:.6}img{width:28px;height:28px;display:block}svg{width:20px;height:20px;stroke-width:1.8}span{position:absolute;right:0;top:40px;z-index:2147483647;background:#202621;color:#f7f8f5;padding:10px 12px;border-radius:9px;width:220px;font:12px/1.6 system-ui}span:empty{display:none}";
    const action = document.createElement("button");
    action.type = "button";
    // Paint bundled artwork without fetching a URL or reading anything from the page.
    const logo = document.createElement("canvas");
    logo.width = logo.height = KeyDropAssets.logoSize;
    logo.style.cssText = "width:28px;height:28px;display:block;";
    logo.setAttribute("aria-hidden", "true");
    const pixels = Uint8ClampedArray.from(
      atob(KeyDropAssets.logoPixels),
      (byte) => byte.charCodeAt(0),
    );
    logo
      .getContext("2d")
      .putImageData(new ImageData(pixels, logo.width, logo.height), 0, 0);
    action.append(logo);
    function showIcon(name) {
      action.innerHTML = KeyDropAssets.icons[name];
    }
    action.title = "KeyDrop：生成并复制 api-key.txt";
    action.setAttribute("aria-label", action.title);
    const notice = document.createElement("span");
    notice.setAttribute("role", "status");
    action.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!event.isTrusted || !matches(button) || action.disabled) return;
      const value = clickedValue(button);
      if (!usable(value)) {
        notice.textContent = "无法确定完整密钥，请打开 KeyDrop 手动粘贴。";
        return;
      }
      action.disabled = true;
      showIcon("loader");
      try {
        const result = await chrome.runtime.sendMessage({
          type: "create-from-page",
          value,
        });
        if (!result?.ok) throw new Error();
        showIcon("check");
        notice.textContent = "api-key.txt 已复制，可直接粘贴文件。";
      } catch {
        showIcon("alert-circle");
        notice.textContent = "复制未确认，请打开 KeyDrop 检查本机助手。";
      } finally {
        action.disabled = false;
        setTimeout(() => {
          action.replaceChildren(logo);
          notice.textContent = "";
        }, 6000);
      }
    });
    shadow.append(style, action, notice);
    button.after(host);
    badges.set(button, host);
  }
  function scan() {
    timer = undefined;
    if (!enabled) return;
    for (const [button, host] of badges) {
      if (!matches(button) || !host.isConnected) {
        host.remove();
        badges.delete(button);
      }
    }
    for (const button of document.querySelectorAll(buttons))
      if (!badges.has(button) && matches(button)) attach(button);
  }
  const observer = new MutationObserver(() => {
    if (!timer) timer = setTimeout(scan, 120);
  });
  function start() {
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "aria-label",
        "title",
        "role",
        "class",
        "hidden",
        "aria-hidden",
      ],
    });
    scan();
  }
  document.addEventListener(
    "click",
    (event) => {
      if (!enabled || !event.isTrusted) return;
      const button =
        event.target instanceof Element ? event.target.closest(buttons) : null;
      if (!matches(button) || Date.now() - lastCopy < 1000) return;
      lastCopy = Date.now();
      const value = clickedValue(button);
      chrome.runtime
        .sendMessage({ type: "credential-copy", value })
        .catch(() => {
          enabled = false;
        });
    },
    true,
  );
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "detector-toggle") return;
    enabled = Boolean(message.enabled);
    observer.disconnect();
    clearTimeout(timer);
    timer = undefined;
    if (enabled) start();
    else {
      for (const host of badges.values()) host.remove();
      badges.clear();
    }
  });
  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();

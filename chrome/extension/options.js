const $ = (selector) => document.querySelector(selector);
function status(text, error = false) {
  $("#status").textContent = text;
  $("#status").hidden = !text;
  $("#status").classList.toggle("error", error);
}
async function showSites() {
  const { origins = [] } = await chrome.permissions.getAll();
  $("#sites").replaceChildren();
  for (const pattern of origins) {
    const line = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = pattern.replace(/\/\*$/, "");
    const remove = document.createElement("button");
    remove.textContent = "关闭";
    remove.onclick = async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: "disable-site",
          origin: label.textContent,
        });
        if (!result?.ok) throw new Error("disable-failed");
        await showSites();
        status("已关闭该网站的快捷入口。");
      } catch {
        status("关闭失败，请在浏览器扩展管理中移除网站权限。", true);
      }
    };
    line.append(label, remove);
    $("#sites").append(line);
  }
}
$("#site-form").onsubmit = async (event) => {
  event.preventDefault();
  let site;
  try {
    site = new URL($("#site-origin").value);
    if (
      site.username ||
      site.password ||
      !(
        site.protocol === "https:" ||
        (site.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(site.hostname))
      )
    )
      throw new Error("unsupported");
  } catch {
    status("请输入 HTTPS 网站地址；本机测试地址可以使用 HTTP。", true);
    return;
  }
  try {
    const allowed = await chrome.permissions.request({
      origins: [site.origin + "/*"],
    });
    if (!allowed) return status("未开启网站权限。");
    const result = await chrome.runtime.sendMessage({ type: "sync-sites" });
    await showSites();
    status(
      result?.ok
        ? "已开启，请刷新目标网页。"
        : "权限已开启，请重新加载插件后刷新目标网页。",
    );
  } catch {
    status("未能开启，请稍后重试。", true);
  }
};
showSites().catch(() => status("未能读取网站权限，请重新打开设置。", true));

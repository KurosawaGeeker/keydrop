export const hostName = "ai.keydrop.bridge";

export async function nativeRequest(message) {
  let timer;
  try {
    const result = await Promise.race([
      chrome.runtime.sendNativeMessage(hostName, message),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), 8000);
      }),
    ]);
    if (!result?.ok) throw new Error("native-failed");
    return result;
  } catch {
    throw new Error(
      "未能确认操作完成。请确认本机助手已安装、插件有“与本机应用通信”权限，再重试。",
    );
  } finally {
    clearTimeout(timer);
  }
}

// Installs only the local bridge and host-registration manifests. No browser profile edits.
import { mkdir, copyFile, chmod, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const id = process.argv[2];
if (!/^[a-p]{32}$/.test(id ?? ""))
  throw new Error("Pass the installed KeyDrop extension ID.");
const source = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(
  homedir(),
  "Library/Application Support/KeyDrop/BrowserBridge",
);
const origins = [`chrome-extension://${id}/`];
const targets = ["Google/Chrome", "Citro Labs/ego lite"].map((browser) =>
  path.join(
    homedir(),
    "Library/Application Support",
    browser,
    "NativeMessagingHosts/ai.keydrop.bridge.json",
  ),
);
// Preflight every registration before modifying any installation files.
for (const target of targets) {
  try {
    const previous = JSON.parse(await readFile(target, "utf8"));
    if (previous.path !== path.join(directory, "keydrop-bridge"))
      throw new Error("Existing bridge registration points elsewhere.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
await mkdir(directory, { recursive: true, mode: 0o700 });
await copyFile(
  path.join(source, "build/keydrop-bridge"),
  path.join(directory, "keydrop-bridge"),
);
await chmod(path.join(directory, "keydrop-bridge"), 0o700);
await writeFile(
  path.join(directory, "bridge-config.json"),
  JSON.stringify({ allowedOrigins: origins }),
  { mode: 0o600 },
);
const manifest = {
  name: "ai.keydrop.bridge",
  description: "KeyDrop local file clipboard helper",
  path: path.join(directory, "keydrop-bridge"),
  type: "stdio",
  allowed_origins: origins,
};
for (const target of targets) {
  const hosts = path.dirname(target);
  await mkdir(hosts, { recursive: true });
  // Preserve a prior unrelated registration rather than silently replace it.
  try {
    const previous = JSON.parse(await readFile(target, "utf8"));
    if (previous.path !== manifest.path)
      throw new Error("Existing bridge registration points elsewhere.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(target, JSON.stringify(manifest, null, 2), { mode: 0o600 });
  process.stdout.write(`Registered: ${target}\n`);
}

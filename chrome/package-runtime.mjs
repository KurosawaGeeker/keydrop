import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const output = process.argv[2];
if (!output || !path.isAbsolute(output))
  throw new Error("Pass an absolute output directory.");
await mkdir(output, { recursive: true });
await cp(
  new URL("./extension/", import.meta.url),
  path.join(output, "KeyDrop-Chrome"),
  { recursive: true },
);
await cp(
  new URL("./LICENSE", import.meta.url),
  path.join(output, "KeyDrop-Chrome/LICENSE"),
);
const readme = await readFile(new URL("./README.md", import.meta.url), "utf8");
await writeFile(
  path.join(output, "KeyDrop-Chrome-README.md"),
  readme.replaceAll("extension/assets/", "KeyDrop-Chrome/assets/"),
);
await writeFile(
  path.join(output, "KeyDrop-Chrome/README.md"),
  readme.replaceAll("extension/assets/", "assets/"),
);
await cp(
  new URL("./tests/fixture.html", import.meta.url),
  path.join(output, "KeyDrop-Mock.html"),
);
const manifest = JSON.parse(
  await readFile(new URL("./extension/manifest.json", import.meta.url), "utf8"),
);
await writeFile(
  path.join(output, "KeyDrop-build.json"),
  JSON.stringify(
    {
      version: manifest.version,
      builtAt: new Date().toISOString(),
      platform: process.platform,
      network: "No runtime network calls; native stdio only",
    },
    null,
    2,
  ),
);
console.log(`Packaged KeyDrop ${manifest.version}: ${output}`);

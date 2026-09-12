import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const content = await readFile(new URL("./fixture.html", import.meta.url));
createServer((request, response) => {
  response.setHeader("Content-Type", "text/html;charset=utf-8");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'",
  );
  response.end(content);
}).listen(18743, "127.0.0.1", () =>
  console.log("Local fake-key test page: http://127.0.0.1:18743"),
);

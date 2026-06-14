import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, "public");
const entries = ["index.html", "styles.css", "script.js", "team-logos", "ai-logos"];

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

for (const entry of entries) {
  await cp(join(root, entry), join(publicDir, entry), {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

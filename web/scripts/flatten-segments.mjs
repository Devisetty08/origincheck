// Next 16.4 static export writes nested route segments as `guide/__next.guide/__PAGE__.txt`, but the client
// router requests `guide/__next.guide.__PAGE__.txt`, which 404s on static hosts. Write a copy under the name the
// client asks for. Remove this when Next writes the dotted names itself.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) flatten(p, dir, name);
    else walk(p);
  }
}

function flatten(segDir, parent, prefix, root = segDir) {
  for (const name of readdirSync(segDir)) {
    const p = join(segDir, name);
    if (statSync(p).isDirectory()) flatten(p, parent, prefix, root);
    else copyFileSync(p, join(parent, `${prefix}.${relative(root, p).split(sep).join(".")}`));
  }
}

walk("out");

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function extractForgeBodyCardDiv(html) {
  const needle = '<div class="forge-sub-card forge-body-card">';
  const start = html.indexOf(needle);
  if (start === -1) throw new Error("forge-body-card start not found");

  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[0];
    const isClose = tag.startsWith("</");
    if (!isClose) depth += 1;
    else depth -= 1;
    if (isClose && depth === 0) {
      return html.slice(start, m.index + tag.length);
    }
  }
  throw new Error("forge-body-card closing div not found");
}

const headBuf = execFileSync("git", ["show", "HEAD:index.html"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
});
const headHtml = headBuf.toString("utf8");
const bodyChunk = extractForgeBodyCardDiv(headHtml);

const idxPath = path.join(root, "index.html");
const cur = fs.readFileSync(idxPath, "utf8");

const needle = '<div class="forge-sub-card forge-body-card">';
const curStart = cur.indexOf(needle);
const proj = cur.indexOf('<div id="projectModule"');
if (curStart === -1 || proj === -1) throw new Error("index.html markers not found");

const beforeBody = cur.slice(0, curStart);
const fromProject = cur.slice(proj);

const closingForgeModule = `          </section>
          </div>
        </div>
      </div>
    </div>


`;

const out = beforeBody + bodyChunk + "\n\n" + closingForgeModule + fromProject;
fs.writeFileSync(idxPath, out, "utf8");
console.log("OK restored forge-body-card from git object, len", bodyChunk.length);

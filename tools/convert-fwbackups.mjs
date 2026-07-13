// Local dev pipeline: fwbackups/*.fwbackup (real FieldWorks project backups, gitignored, never
// committed) -> unzip -> FieldWorks' own GenerateHCConfig.exe -> HermitCrab grammar XML, written
// under .data/ (also gitignored -- derived data from a real project is still real project data).
// Windows + a local FieldWorks install only; see README for the manual-export fallback anyone
// without both can use instead. Safe to run repeatedly: skips a project whose converted output is
// newer than its .fwbackup.
import AdmZip from "adm-zip";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backupsDir = path.join(demoRoot, "fwbackups");
const dataDir = path.join(demoRoot, ".data");

const GENERATE_HC_CONFIG =
  process.env.FW_GENERATEHCCONFIG_PATH ?? "C:\\Program Files\\SIL\\FieldWorks 9\\GenerateHCConfig.exe";

function safeId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// `<CurVernWss><Uni>seh seh-fonipa-x-etic</Uni></CurVernWss>` on the LangProject root object --
// the first, space-separated token is the project's primary vernacular writing system's ISO code
// (confirmed against a real exported Sena project). Regex over the raw XML text rather than a full
// parse: .fwdata files run tens of MB and we only need this one field.
function extractVernacularWs(fwdataText) {
  const m = fwdataText.match(/<CurVernWss>\s*<Uni>([^<]*)<\/Uni>/);
  if (!m) return null;
  const tokens = m[1].trim().split(/\s+/);
  return tokens[0] || null;
}

function convertOne(backupPath) {
  const base = path.basename(backupPath, path.extname(backupPath));
  const id = safeId(base);
  const projectDir = path.join(dataDir, id);
  const hcXmlPath = path.join(projectDir, `${id}-hc.xml`);
  const manifestPath = path.join(projectDir, "manifest.json");

  const backupMtime = statSync(backupPath).mtimeMs;
  if (existsSync(hcXmlPath) && statSync(hcXmlPath).mtimeMs >= backupMtime) {
    console.log(`[convert] ${base}: up to date, skipping`);
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  }

  console.log(`[convert] ${base}: extracting backup...`);
  const rawDir = path.join(projectDir, "raw");
  mkdirSync(rawDir, { recursive: true });
  const zip = new AdmZip(backupPath);
  zip.extractAllTo(rawDir, true);

  const fwdataFile = readdirSync(rawDir).find((f) => f.endsWith(".fwdata"));
  if (!fwdataFile) {
    throw new Error(`${base}: no .fwdata file found inside the backup`);
  }
  const fwdataPath = path.join(rawDir, fwdataFile);

  console.log(`[convert] ${base}: reading vernacular writing system...`);
  const fwdataText = readFileSync(fwdataPath, "utf8");
  const vernacularWs = extractVernacularWs(fwdataText);

  console.log(`[convert] ${base}: running GenerateHCConfig...`);
  execFileSync(GENERATE_HC_CONFIG, [fwdataPath, hcXmlPath], { stdio: "inherit" });

  const manifest = {
    id,
    displayName: base,
    vernacularWs,
    hcXmlUrl: `/.data/${id}/${id}-hc.xml`,
    convertedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[convert] ${base}: done (vernacular ws: ${vernacularWs ?? "unknown"})`);
  return manifest;
}

function main() {
  mkdirSync(dataDir, { recursive: true });

  if (!existsSync(GENERATE_HC_CONFIG)) {
    console.warn(
      `[convert] GenerateHCConfig.exe not found at ${GENERATE_HC_CONFIG} -- skipping FieldWorks ` +
        `backup conversion (set FW_GENERATEHCCONFIG_PATH if FieldWorks is installed elsewhere). ` +
        `The demo will still run against samples/ only.`
    );
    writeFileSync(path.join(dataDir, "index.json"), JSON.stringify([], null, 2));
    return;
  }

  const backups = existsSync(backupsDir)
    ? readdirSync(backupsDir).filter((f) => f.toLowerCase().endsWith(".fwbackup"))
    : [];

  if (backups.length === 0) {
    console.log("[convert] no .fwbackup files in fwbackups/ -- nothing to convert");
    writeFileSync(path.join(dataDir, "index.json"), JSON.stringify([], null, 2));
    return;
  }

  const manifests = [];
  for (const file of backups) {
    try {
      manifests.push(convertOne(path.join(backupsDir, file)));
    } catch (err) {
      console.error(`[convert] ${file}: FAILED -- ${err.message}`);
    }
  }
  writeFileSync(path.join(dataDir, "index.json"), JSON.stringify(manifests, null, 2));
  console.log(`[convert] wrote .data/index.json with ${manifests.length} project(s)`);
}

main();

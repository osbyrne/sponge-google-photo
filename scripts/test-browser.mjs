import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const directory = await mkdtemp(join(tmpdir(), "photos-sponge-tests-"));
try {
  const build = await Bun.build({
    entrypoints: ["tests/browser/trash-shortcut.ts"],
    outdir: directory,
    target: "browser",
    format: "iife",
    naming: "tests.js",
  });
  if (!build.success) throw new AggregateError(build.logs, "Browser tests did not build");
  const page = join(directory, "index.html");
  await writeFile(page, '<!doctype html><html><body><script src="tests.js"></script></body></html>');
  const chrome = process.env.CHROME_BIN ?? (
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome"
  );
  const { stdout } = await promisify(execFile)(chrome, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--user-data-dir=${join(directory, "profile")}`,
    "--virtual-time-budget=30000",
    "--dump-dom",
    new URL(`file://${page}`).href,
  ], { timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  const encoded = stdout.match(/data-test-results="([^"]+)"/)?.[1];
  if (!encoded) throw new Error(`Browser tests did not finish:\n${stdout}`);
  const results = JSON.parse(Buffer.from(encoded, "base64").toString());
  for (const result of results) {
    console.log(`${result.error ? "FAIL" : "PASS"} ${result.name}`);
    if (result.error) console.error(result.error);
  }
  if (results.some((result) => result.error)) process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}

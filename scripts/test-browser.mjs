import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";

// Media playback needs Chrome's real clock; virtual time can outrun decoding.
async function runVideoSuite(chrome, page, profile) {
  const child = spawn(chrome, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`, "--remote-debugging-pipe", "about:blank",
  ], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  let id = 0;
  let buffer = "";
  const pending = new Map();
  const rejectAll = (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on("error", rejectAll);
  child.on("exit", () => rejectAll(new Error("Chrome exited before video tests completed")));
  child.stdio[4].setEncoding("utf8");
  child.stdio[4].on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const request = pending.get(message.id);
      if (!request) continue;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    child.stdio[3].write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
  });
  const timeout = setTimeout(() => rejectAll(new Error("Video tests timed out")), 45000);
  try {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.navigate", { url: pathToFileURL(page).href }, sessionId);
    const result = await send("Runtime.evaluate", {
      expression: `new Promise(resolve => {
        const timer = setInterval(() => {
          const output = document.querySelector('[data-test-results]');
          if (output) { clearInterval(timer); resolve(output.dataset.testResults); }
        }, 20);
      })`,
      awaitPromise: true,
      returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
}

const directory = await mkdtemp(join(tmpdir(), "photos-sponge-tests-"));
try {
  const build = await Bun.build({
    entrypoints: ["tests/browser/trash-shortcut.ts", "tests/browser/continuous-review.ts", "tests/browser/video-playback.ts"],
    outdir: directory,
    target: "browser",
    format: "iife",
    naming: "[name].js",
    plugins: [{ name: "svelte", setup(builder) {
      builder.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({
        contents: compile(await Bun.file(path).text(), { filename: path, generate: "client", css: "injected" }).js.code,
        loader: "js",
      }));
    } }],
  });
  if (!build.success) throw new AggregateError(build.logs, "Browser tests did not build");
  await copyFile("tests/browser/fixtures/playback.webm", join(directory, "playback.webm"));
  await copyFile("entrypoints/photos.content/style.css", join(directory, "panel.css"));
  const chrome = process.env.CHROME_BIN ?? (
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome"
  );
  for (const suite of ["trash-shortcut", "continuous-review", "video-playback"]) {
    const page = join(directory, `${suite}.html`);
    await writeFile(page, `<!doctype html><html><head>${suite === "continuous-review" ? '<link rel="stylesheet" href="panel.css">' : ''}</head><body><script src="${suite}.js"></script></body></html>`);
    let encoded;
    if (suite === "video-playback") {
      encoded = await runVideoSuite(chrome, page, join(directory, "video-profile"));
    } else {
      const { stdout } = await promisify(execFile)(chrome, [
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        `--user-data-dir=${join(directory, "profile")}`,
        "--virtual-time-budget=120000",
        "--dump-dom",
        pathToFileURL(page).href,
      ], { timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
      encoded = stdout.match(/data-test-results="([^"]+)"/)?.[1];
      if (!encoded) throw new Error(`Browser tests did not finish:\n${stdout}`);
    }
    const results = JSON.parse(Buffer.from(encoded, "base64").toString());
    for (const result of results) {
      console.log(`${result.error ? "FAIL" : "PASS"} ${result.name}`);
      if (result.error) console.error(result.error);
    }
    if (results.some((result) => result.error)) process.exitCode = 1;
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

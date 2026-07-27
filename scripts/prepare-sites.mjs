import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectDirectory = process.cwd();
const outputDirectory = path.join(projectDirectory, "dist");
const serverDirectory = path.join(outputDirectory, "server");
const hostingDirectory = path.join(outputDirectory, ".openai");

await mkdir(serverDirectory, { recursive: true });
await mkdir(hostingDirectory, { recursive: true });

await copyFile(
  path.join(projectDirectory, ".openai", "hosting.json"),
  path.join(hostingDirectory, "hosting.json"),
);

const workerSource = `const asHtmlRequest = (request) => {
  const url = new URL(request.url);
  url.pathname = "/index.html";
  return new Request(url, request);
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const assetResponse = await env.ASSETS.fetch(request);

    if (
      assetResponse.status === 404 &&
      request.method === "GET" &&
      !url.pathname.includes(".")
    ) {
      return env.ASSETS.fetch(asHtmlRequest(request));
    }

    return assetResponse;
  },
};
`;

await writeFile(path.join(serverDirectory, "index.js"), workerSource, "utf8");

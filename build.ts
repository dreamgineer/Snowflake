import isolatedDecl from "bun-plugin-isolated-decl";
import { GatewayIntents } from ".";
import { createMinifier } from "dts-minify"; // dts-minify on npm
import * as ts from "typescript";

// setup (provide a TS Compiler API object)
const minifier = createMinifier(ts);

console.log("Bundling...");
await Bun.build({
  entrypoints: ["index.ts"],
  outdir: "dist",
  minify: true,
  target: "bun",
  plugins: [
    isolatedDecl({
      forceGenerate: true,
    }),
  ],
});
console.log("Copying files...");
const pkg = await Bun.file("package.json").json();
delete pkg.devDependencies;
delete pkg.scripts;
await Bun.write("dist/package.json", JSON.stringify(pkg));
await Bun.write("dist/README.md", Bun.file("README.md"));
console.log("Fetching specification...");
const cache = Bun.file(import.meta.dir + "/specification.json");
const spec = await cache.exists().then((exist) =>
  exist
    ? cache.json()
    : fetch(
        `https://raw.githubusercontent.com/discord/discord-api-spec/refs/heads/main/specs/openapi.json`
      )
        .then((e) => e.json())
        .then((e: any) => {
          // Turn list of paths into a nested object of methods
          let spec: Record<string, any> = {};
          for (const [path, method] of Object.entries(e.paths)) {
            // Object.keys(method as Object).filter(e=>e!="parameters")
            let stack: any = spec;
            const parts = path.split("/").slice(1);
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i] as string;
              stack[part] = stack[part] || {};
              if (i === parts.length - 1) {
                stack[part]._ = Object.keys(method as Object).filter(
                  (e) => e != "parameters"
                );
                break;
              }
              stack = stack[part];
            }
          }
          return spec;
        })
        .then((e: any) => (cache.write(JSON.stringify(e)).catch(() => {}), e))
);
console.log("Generating types...");
const methods = {
  post: "create",
  patch: "edit",
  put: "add",
};
function generateApiType(spec: any, depth = 0): string {
  const indent = (lvl: number) => "  ".repeat(lvl);
  const lines: string[] = [];

  lines.push("{");

  for (const [key, val] of Object.entries(spec)) {
    if (key === "_") {
      const m = val as string[];
      for (const method of val as string[]) {
        if (method in methods) m.push(methods[method as keyof typeof methods]);
      }
      for (const method of m as string[]) {
        lines.push(`${indent(depth + 1)}${method}: Call;`);
      }
      continue;
    }

    const isParam = key.startsWith("{");
    const isWrapped = /^[a-z]+$/.test(key);
    const safeKey = isParam
      ? `[${key.slice(1, -1)}: string]`
      : isWrapped
      ? key
      : JSON.stringify(key);
    const nestedType = generateApiType(val, depth + 1);
    lines.push(`${indent(depth + 1)}${safeKey}: ${nestedType}`);
  }

  lines.push(`${indent(depth)}}${"_" in spec ? " & ((args?: Record<string, any>) => Promise<any>);" : ";"}`);
  return lines.join("\n");
}
const types = await Bun.file("dist/index.d.ts").text();
const finalTypes = types
  .replace(
    "type Intents = Record<string, number>;",
    `type Intents = {\n${Object.keys(GatewayIntents)
      .map((e) => "  " + e + ": number;")
      .join("\n")}\n};`
  )
  .replace(
    "export { Snowflake, Snowflake as default, GatewayIntents };",
    `declare module "@sfjs/snowflake" {
  export { Snowflake, Snowflake as default, GatewayIntents };
}
  
type Call = (args?: Record<string, any>) => Promise<any>`
  )
  .replace(
    "readonly rest: RestCall;",
    `readonly rest: RestCall;${generateApiType(spec).slice(1, -2)}`
  )
  .replace(
    /(type .+ = {\n)([^}]+)\n *};/g,
    (_, g1: string, g2: string) =>
      `${g1}${g2
        .split("\n")
        .map((e) => (e.endsWith(";") ? e : `${e};`))
        .join("\n")}\n};`
  )
  .replace(/ {2,}|;{2,}|\t|\n/g, "");
await Bun.write("dist/index.d.ts", /* minifier.minify */ finalTypes);
console.log("Publishing package...");
await Bun.$`bun publish --cwd=dist --access public ${
  process.argv.includes("--dry") ? "--dry-run" : ""
}`;
console.log("Done!");

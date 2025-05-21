import isolatedDecl from "bun-plugin-isolated-decl";
import { GatewayIntents } from ".";

console.log("Bundling...");
await Bun.build({
  entrypoints: ["index.ts"],
  outdir: "dist/js",
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
await Bun.write("dist/js/package.json", JSON.stringify(pkg));
await Bun.write("dist/js/README.md", Bun.file("README.md"));
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
        lines.push(
          `${indent(
            depth + 1
          )}${method}: (args?: Record<string, any>) => Promise<any>;`
        );
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

  lines.push(`${indent(depth)}}`);
  return lines.join("\n");
}
const types = await Bun.file("dist/js/index.d.ts").text();
await Bun.file("dist/js/index.d.ts").delete();
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
  export type Specification = ${generateApiType(spec, 1)};
}`
  );
await Bun.write("dist/ts/index.d.ts", finalTypes, { createPath: true });
await Bun.write(
  "dist/ts/package.json",
  JSON.stringify({
    name: "@sfjs/types",
    version: pkg.version,
    description: "Types for Snowflake Discord API wrapper",
    types: "index.d.ts",
  })
);
if (!process.argv.includes("--dry")) {
  console.log("Publishing package...");
  await Bun.$`bun publish --cwd=dist/js --access public`;
  console.log("Publishing types...");
  await Bun.$`bun publish --cwd=dist/ts --access public`;
}
console.log("Done!");

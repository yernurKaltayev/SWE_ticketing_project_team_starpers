import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const source = new URL("../../backend/docs/openapi.yaml", import.meta.url);
const destination = new URL(
  "../shared/src/generated/api.d.ts",
  import.meta.url,
);
const generated = astToString(await openapiTS(source));
if (process.argv.includes("--check")) {
  let existing = "";
  try {
    existing = await readFile(destination, "utf8");
  } catch {
    /* Missing types fail below. */
  }
  if (
    existing.replaceAll("\r\n", "\n") !== generated.replaceAll("\r\n", "\n")
  ) {
    console.error(
      "API types differ from backend/docs/openapi.yaml. Run npm run generate:api.",
    );
    process.exitCode = 1;
  } else {
    console.log("Generated API types match the backend contract.");
  }
} else {
  await mkdir(new URL("../shared/src/generated/", import.meta.url), {
    recursive: true,
  });
  await writeFile(destination, generated);
  console.log(`Generated ${fileURLToPath(destination)}`);
}

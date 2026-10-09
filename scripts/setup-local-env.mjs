import { access, copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(".env");
const examplePath = resolve(".env.example");

try {
  await access(envPath, constants.F_OK);
  console.log(".env existe déjà ; aucune modification effectuée.");
} catch {
  await copyFile(examplePath, envPath);
  console.log(".env créé à partir de .env.example.");
}

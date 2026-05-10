import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(process.cwd(), ".next");

if (!target.endsWith(`${process.cwd()}\\.next`) && !target.endsWith(`${process.cwd()}/.next`)) {
  throw new Error(`Refusing to remove unexpected path: ${target}`);
}

await rm(target, { recursive: true, force: true });

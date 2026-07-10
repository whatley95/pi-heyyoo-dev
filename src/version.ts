import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as {
  version: string;
  homepage?: string;
};

export const VERSION = pkg.version;
export const HOMEPAGE = pkg.homepage ?? "https://whatley.xyz";

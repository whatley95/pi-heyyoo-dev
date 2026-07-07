import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadHeyyooConfig } from "./config.js";
import { loadDocContext } from "./doc-fetcher.js";

export async function handleYooSearchCommand(
  args: string,
  ctx: ExtensionContext,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const query = args.trim();
  if (!query) {
    return { content: [{ type: "text", text: "Usage: /yoo-search <query>" }] };
  }
  const config = loadHeyyooConfig(ctx.cwd);
  if (!config.docs?.webSearch?.enabled) {
    return {
      content: [
        {
          type: "text",
          text: "Web search is disabled. Enable it with pi-heyyoo.docs.webSearch.enabled in settings.json.",
        },
      ],
    };
  }
  const result = await loadDocContext(ctx.cwd, config.docs, { search: query });
  if (!result) {
    return { content: [{ type: "text", text: `No results for "${query}".` }] };
  }
  return { content: [{ type: "text", text: `Web search results for "${query}":\n\n${result}` }] };
}

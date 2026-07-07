export type WebSearchProvider = "duckduckgo" | "brave";

export interface WebSearchConfig {
  enabled: boolean;
  maxResults: number;
  maxCharsPerResult: number;
  /** Search provider. Defaults to "brave" if a Brave API key is available, otherwise "duckduckgo". */
  provider?: WebSearchProvider;
  /** Inline Brave API key (prefer auth.json or BRAVE_API_KEY env var). */
  apiKey?: string;
}

export interface DocsConfig {
  sources: Record<string, string>;
  maxCharsPerSource: number;
  webSearch: WebSearchConfig;
}

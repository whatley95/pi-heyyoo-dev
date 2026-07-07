export interface WebSearchConfig {
  enabled: boolean;
  maxResults: number;
  maxCharsPerResult: number;
}

export interface DocsConfig {
  sources: Record<string, string>;
  maxCharsPerSource: number;
  webSearch: WebSearchConfig;
}

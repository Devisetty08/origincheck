// Server-only configuration. Keys are read from the environment and never sent to the browser.
import "server-only";

const env = (k: string) => process.env[k]?.trim() || undefined;

export const config = {
  userAgent: env("HTTP_USER_AGENT") ?? `origincheck/0.2 (contact: ${env("CONTACT_EMAIL") ?? "unknown"})`,
  contactEmail: env("CONTACT_EMAIL"),
  crossrefMailto: env("CROSSREF_MAILTO") ?? env("CONTACT_EMAIL"),
  openalexMailto: env("OPENALEX_MAILTO") ?? env("CONTACT_EMAIL"),
  unpaywallEmail: env("UNPAYWALL_EMAIL"),
  braveKey: env("BRAVE_API_KEY"),
  jinaKey: env("JINA_API_KEY"),
  coreKey: env("CORE_API_KEY"),
  semanticScholarKey: env("SEMANTIC_SCHOLAR_API_KEY"),
  googleKey: env("GOOGLE_API_KEY"),
  googleCx: env("GOOGLE_CSE_ID"),
  aiProvider: (env("AI_PROVIDER") ?? "anthropic") as "anthropic" | "ollama",
  anthropicKey: env("ANTHROPIC_API_KEY"),
  anthropicModel: env("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
  ollamaUrl: env("OLLAMA_BASE_URL") ?? "http://localhost:11434",
  ollamaModel: env("OLLAMA_MODEL"),
  aiLikelihood: env("ENABLE_AI_LIKELIHOOD") === "true",
  languageTool: env("ENABLE_LANGUAGETOOL") === "true",
  languageToolUrl: env("LANGUAGETOOL_URL") ?? "http://localhost:8010",
  maxQueries: Math.max(1, Math.min(40, Number(env("SEARCH_MAX_QUERIES") ?? 8) || 8)),
};

/** What the browser may know: which features are available, never the keys themselves. */
export function publicConfig() {
  const improve = config.aiProvider === "ollama" ? !!config.ollamaModel : !!config.anthropicKey;
  return {
    aiLikelihood: config.aiLikelihood,
    languageTool: config.languageTool,
    improve: improve ? config.aiProvider : null,
    maxQueries: config.maxQueries,
  };
}

/** Strip anything that looks like a secret before it reaches a log line. */
export function redact(s: string) {
  let out = s;
  for (const v of [config.braveKey, config.jinaKey, config.coreKey, config.semanticScholarKey, config.googleKey, config.anthropicKey])
    if (v) out = out.split(v).join("[redacted]");
  return out.replace(/(api[_-]?key|token|key|authorization)=([^&\s]+)/gi, "$1=[redacted]");
}

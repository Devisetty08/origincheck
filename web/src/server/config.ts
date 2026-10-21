// Server-only configuration. Keys are read from the environment and never sent to the browser.
// Getters, so values saved from the Settings page apply without a restart.
import "server-only";
import { copyleaks } from "./paid/copyleaks";

const env = (k: string) => process.env[k]?.trim() || undefined;

export const config = {
  get userAgent() { return env("HTTP_USER_AGENT") ?? `origincheck/0.2 (contact: ${env("CONTACT_EMAIL") ?? "unknown"})`; },
  get contactEmail() { return env("CONTACT_EMAIL"); },
  get crossrefMailto() { return env("CROSSREF_MAILTO") ?? env("CONTACT_EMAIL"); },
  get openalexMailto() { return env("OPENALEX_MAILTO") ?? env("CONTACT_EMAIL"); },
  get unpaywallEmail() { return env("UNPAYWALL_EMAIL"); },
  get braveKey() { return env("BRAVE_API_KEY"); },
  get jinaKey() { return env("JINA_API_KEY"); },
  get coreKey() { return env("CORE_API_KEY"); },
  get semanticScholarKey() { return env("SEMANTIC_SCHOLAR_API_KEY"); },
  get googleKey() { return env("GOOGLE_API_KEY"); },
  get googleCx() { return env("GOOGLE_CSE_ID"); },
  get aiProvider() { return (env("AI_PROVIDER") ?? "anthropic") as "anthropic" | "ollama"; },
  get anthropicKey() { return env("ANTHROPIC_API_KEY"); },
  get anthropicModel() { return env("ANTHROPIC_MODEL") ?? "claude-opus-5-5"; },
  get ollamaUrl() { return env("OLLAMA_BASE_URL") ?? "http://localhost:11434"; },
  get ollamaModel() { return env("OLLAMA_MODEL"); },
  get aiLikelihood() { return env("ENABLE_AI_LIKELIHOOD") === "true"; },
  get languageTool() { return env("ENABLE_LANGUAGETOOL") === "true"; },
  get languageToolUrl() { return env("LANGUAGETOOL_URL") ?? "http://localhost:8010"; },
  get copyleaksEmail() { return env("COPYLEAKS_EMAIL"); },
  get copyleaksKey() { return env("COPYLEAKS_KEY"); },
  get copyleaksSandbox() { return env("COPYLEAKS_SANDBOX") === "true"; },
  /** Public address Copyleaks can reach for its webhook (an ngrok tunnel locally); Vercel's production URL by default. */
  get publicBaseUrl() {
    const v = env("PUBLIC_BASE_URL") ?? (env("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${env("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined);
    return v?.replace(/\/$/, "");
  },
  get maxQueries() { return Math.max(1, Math.min(40, Number(env("SEARCH_MAX_QUERIES") ?? 8) || 8)); },
};

/** What the browser may know: which features are available, never the keys themselves. */
export function publicConfig() {
  const improve = config.aiProvider === "ollama" ? !!config.ollamaModel : !!config.anthropicKey;
  return {
    aiLikelihood: config.aiLikelihood,
    languageTool: config.languageTool,
    improve: improve ? config.aiProvider : null,
    maxQueries: config.maxQueries,
    paid: { label: copyleaks.label, missing: copyleaks.missing(), sandbox: config.copyleaksSandbox },
  };
}

/** Strip anything that looks like a secret before it reaches a log line. */
export function redact(s: string) {
  let out = s;
  for (const v of [config.braveKey, config.jinaKey, config.coreKey, config.semanticScholarKey, config.googleKey, config.anthropicKey, config.copyleaksKey])
    if (v) out = out.split(v).join("[redacted]");
  return out.replace(/(api[_-]?key|token|key|authorization)=([^&\s]+)/gi, "$1=[redacted]");
}

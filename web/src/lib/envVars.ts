// The server settings shown on the Settings page. Names and help text only: values stay on the server.
export interface EnvVar {
  key: string;
  label: string;
  group: string;
  help: string;
  secret?: boolean; // never sent back to the browser, only "set" / "not set"
  kind?: "text" | "bool" | "select" | "number";
  options?: string[];
  placeholder?: string;
  link?: string;
}

export const ENV_VARS: EnvVar[] = [
  { key: "CONTACT_EMAIL", group: "Contact", label: "Contact email", placeholder: "you@university.edu",
    help: "Sent to Wikipedia, Crossref and OpenAlex as polite-use contact. Without it they rate-limit sooner." },
  { key: "UNPAYWALL_EMAIL", group: "Contact", label: "Unpaywall email", placeholder: "you@university.edu",
    help: "Needed for open-access links by DOI. Must be a real address." },

  { key: "BRAVE_API_KEY", group: "Web search", label: "Brave Search API key", secret: true, link: "https://brave.com/search/api/",
    help: "Searches the open web — the closest to Turnitin's internet coverage. Paid from a monthly credit." },
  { key: "JINA_API_KEY", group: "Web search", label: "Jina API key", secret: true, link: "https://jina.ai/",
    help: "Fallback web search." },
  { key: "GOOGLE_API_KEY", group: "Web search", label: "Google API key", secret: true,
    help: "Existing Programmable Search customers only (closed to new customers, ends 1 January 2027)." },
  { key: "GOOGLE_CSE_ID", group: "Web search", label: "Google search engine ID", help: "Goes with the Google API key." },

  { key: "SEMANTIC_SCHOLAR_API_KEY", group: "Publications", label: "Semantic Scholar API key", secret: true, link: "https://www.semanticscholar.org/product/api",
    help: "Without a key, Semantic Scholar is usually rate-limited." },
  { key: "CORE_API_KEY", group: "Publications", label: "CORE API key", secret: true, link: "https://core.ac.uk/services/api",
    help: "Raises CORE's rate limit for open-access papers." },

  { key: "COPYLEAKS_EMAIL", group: "Paid plagiarism check (Copyleaks)", label: "Copyleaks account email", placeholder: "you@university.edu",
    help: "Scans the whole document against the web, journals and Copyleaks' database of submitted papers. Uses paid credits." },
  { key: "COPYLEAKS_KEY", group: "Paid plagiarism check (Copyleaks)", label: "Copyleaks API key", secret: true, link: "https://api.copyleaks.com/",
    help: "From your Copyleaks account's API dashboard." },
  { key: "COPYLEAKS_SANDBOX", group: "Paid plagiarism check (Copyleaks)", label: "Sandbox mode", kind: "bool",
    help: "Free mock results for testing; no credits used. Turn off for real scans." },
  { key: "PUBLIC_BASE_URL", group: "Paid plagiarism check (Copyleaks)", label: "Public address of this app", placeholder: "https://abc123.ngrok-free.app",
    help: "Copyleaks sends results to this address. Locally, run a tunnel such as ngrok http 3100 and paste its URL. On Vercel it defaults to your production URL." },

  { key: "AI_PROVIDER", group: "Rewrite (Improve my writing)", label: "Provider", kind: "select", options: ["anthropic", "ollama"],
    help: "Who revises the passages you select." },
  { key: "ANTHROPIC_API_KEY", group: "Rewrite (Improve my writing)", label: "Anthropic API key", secret: true, link: "https://console.anthropic.com/",
    help: "Turns on Rewrite with Claude." },
  { key: "ANTHROPIC_MODEL", group: "Rewrite (Improve my writing)", label: "Claude model", placeholder: "claude-opus-5-5",
    help: "Default claude-opus-5-5. claude-sonnet-5-5 or claude-haiku-5-5 cost less." },
  { key: "OLLAMA_BASE_URL", group: "Rewrite (Improve my writing)", label: "Ollama server", placeholder: "http://localhost:11434",
    help: "Free, runs on your own computer." },
  { key: "OLLAMA_MODEL", group: "Rewrite (Improve my writing)", label: "Ollama model", placeholder: "llama3.1",
    help: "Any model you have pulled with ollama pull." },

  { key: "ENABLE_AI_LIKELIHOOD", group: "Optional checks", label: "AI indicator", kind: "bool",
    help: "Shows an AI-likelihood estimate. Unreliable by nature: a signal, never proof." },
  { key: "ENABLE_LANGUAGETOOL", group: "Optional checks", label: "LanguageTool second opinion", kind: "bool",
    help: "Needs your own LanguageTool server." },
  { key: "LANGUAGETOOL_URL", group: "Optional checks", label: "LanguageTool server", placeholder: "http://localhost:8010", help: "" },
  { key: "SEARCH_MAX_QUERIES", group: "Optional checks", label: "Passages searched per run", kind: "number", placeholder: "8",
    help: "More finds more sources in long documents but takes longer (1–40)." },
];

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

  { key: "TAVILY_API_KEY", group: "Web search", label: "Tavily API key (default web search)", secret: true, link: "https://www.tavily.com/",
    help: "Free plan: 1,000 credits a month, no card; searches simply stop when they run out. Tavily may keep the short phrases it receives." },
  { key: "TAVILY_MONTHLY_CREDIT_CAP", group: "Web search", label: "Tavily monthly cap (credits)", kind: "number", placeholder: "900",
    help: "origincheck stops calling Tavily at this many credits per month." },
  { key: "BRAVE_API_KEY", group: "Web search", label: "Brave Search API key (optional, paid)", secret: true, link: "https://brave.com/search/api/",
    help: "Off unless set. Needs a card; use beyond the monthly free credit is billed with no spending limit of its own, so the cap below applies." },
  { key: "BRAVE_MONTHLY_QUERY_CAP", group: "Web search", label: "Brave monthly cap (searches)", kind: "number", placeholder: "800",
    help: "origincheck stops calling Brave at this many searches per month." },
  { key: "JINA_API_KEY", group: "Web search", label: "Jina API key", secret: true, link: "https://jina.ai/",
    help: "Fallback web search." },
  { key: "GOOGLE_API_KEY", group: "Web search", label: "Google API key", secret: true,
    help: "Existing Programmable Search customers only (closed to new customers, ends 1 January 2027)." },
  { key: "GOOGLE_CSE_ID", group: "Web search", label: "Google search engine ID", help: "Goes with the Google API key." },

  { key: "SEMANTIC_SCHOLAR_API_KEY", group: "Publications", label: "Semantic Scholar API key", secret: true, link: "https://www.semanticscholar.org/product/api",
    help: "Without a key, Semantic Scholar is usually rate-limited." },
  { key: "CORE_API_KEY", group: "Publications", label: "CORE API key", secret: true, link: "https://core.ac.uk/services/api",
    help: "Free. Needed to search CORE's open-access papers: without it CORE refuses requests." },

  { key: "COPYLEAKS_EMAIL", group: "Paid plagiarism check (Copyleaks)", label: "Copyleaks account email", placeholder: "you@university.edu",
    help: "Scans the whole document against the web, journals and Copyleaks' database of submitted papers. Uses paid credits." },
  { key: "COPYLEAKS_KEY", group: "Paid plagiarism check (Copyleaks)", label: "Copyleaks API key", secret: true, link: "https://api.copyleaks.com/",
    help: "From your Copyleaks account's API dashboard." },
  { key: "COPYLEAKS_SANDBOX", group: "Paid plagiarism check (Copyleaks)", label: "Sandbox mode", kind: "bool",
    help: "Free mock results for testing; no credits used. Turn off for real scans." },
  { key: "COPYLEAKS_MONTHLY_SCAN_CAP", group: "Paid plagiarism check (Copyleaks)", label: "Copyleaks monthly cap (scans)", kind: "number", placeholder: "20",
    help: "origincheck stops sending scans at this many per month." },
  { key: "PUBLIC_BASE_URL", group: "Paid plagiarism check (Copyleaks)", label: "Public address of this app", placeholder: "https://abc123.ngrok-free.app",
    help: "Copyleaks sends results to this address. Locally, run a tunnel such as ngrok http 3100 and paste its URL. On Vercel it defaults to your production URL." },

  { key: "AI_PROVIDER", group: "Rewrite (Improve my writing)", label: "Provider", kind: "select", options: ["ollama", "anthropic", "gateway"],
    help: "ollama (default): a free model on your own computer, text stays here. anthropic: Claude, paid per use and capped below. gateway: a free-model gateway on your computer (FreeLLMAPI or OmniRoute), personal use only; your passage goes to one of its free providers." },
  { key: "GATEWAY_BASE_URL", group: "Rewrite (Improve my writing)", label: "Gateway address", placeholder: "http://localhost:3001/v1", link: "https://github.com/tashfeenahmed/freellmapi",
    help: "Only used when Provider is gateway. FreeLLMAPI: http://localhost:3001/v1 (desktop app: http://localhost:31415/v1). OmniRoute: http://localhost:20128/v1. Include /v1." },
  { key: "GATEWAY_API_KEY", group: "Rewrite (Improve my writing)", label: "Gateway key", secret: true,
    help: "FreeLLMAPI: the unified freellmapi-… key from the Keys page. OmniRoute: the key from the Endpoints page." },
  { key: "GATEWAY_MODEL", group: "Rewrite (Improve my writing)", label: "Gateway model", placeholder: "auto",
    help: "Default auto (the gateway picks). Pin one strong model, for example a large Qwen or Llama model, so rewrites keep the facts consistently. In OmniRoute, leave prompt compression off for this key: it would change the text before it is rewritten." },
  { key: "GATEWAY_MONTHLY_REQUEST_CAP", group: "Rewrite (Improve my writing)", label: "Gateway monthly cap (requests)", kind: "number", placeholder: "1000",
    help: "origincheck stops calling the gateway at this many Rewrite requests per month." },
  { key: "ZOTERO_USER_ID", group: "My library (Zotero)", label: "Zotero user ID", placeholder: "1234567", link: "https://www.zotero.org/settings/keys",
    help: "Shown as \"Your user ID for use in API calls\" on zotero.org/settings/keys. Only works when origincheck runs on your own computer." },
  { key: "ZOTERO_API_KEY", group: "My library (Zotero)", label: "Zotero API key", secret: true, link: "https://www.zotero.org/settings/keys/new",
    help: "Create a private key with \"Allow library access\" (read-only is enough). Used to import your references and the full text Zotero indexed from your PDFs." },
  { key: "ANTHROPIC_API_KEY", group: "Rewrite (Improve my writing)", label: "Anthropic API key", secret: true, link: "https://console.anthropic.com/",
    help: "Only used when Provider is anthropic." },
  { key: "ANTHROPIC_MONTHLY_REQUEST_CAP", group: "Rewrite (Improve my writing)", label: "Anthropic monthly cap (requests)", kind: "number", placeholder: "500",
    help: "origincheck stops calling Anthropic at this many Rewrite requests per month." },
  { key: "ANTHROPIC_MODEL", group: "Rewrite (Improve my writing)", label: "Claude model", placeholder: "claude-opus-5-5",
    help: "Default claude-opus-5-5. claude-sonnet-5-5 or claude-haiku-5-5 cost less." },
  { key: "OLLAMA_BASE_URL", group: "Rewrite (Improve my writing)", label: "Ollama server", placeholder: "http://localhost:11434",
    help: "Free, runs on your own computer." },
  { key: "OLLAMA_MODEL", group: "Rewrite (Improve my writing)", label: "Ollama model", placeholder: "qwen2.5:7b",
    help: "Default qwen2.5:7b (Alibaba Qwen, Apache-2.0, ~4.7 GB): it kept facts best in our tests. Install Ollama, then run: ollama pull qwen2.5:7b. Smaller models such as phi4-mini are faster but change facts more often." },

  { key: "LIBRETRANSLATE_URL", group: "Translation (documents not in English)", label: "LibreTranslate server", placeholder: "https://libretranslate.com",
    help: "Translates your search phrases into English so a document in another language is also checked against English sources. Self-host it for free, or use libretranslate.com with a key.",
    link: "https://github.com/LibreTranslate/LibreTranslate" },
  { key: "LIBRETRANSLATE_API_KEY", group: "Translation (documents not in English)", label: "LibreTranslate API key", secret: true, link: "https://portal.libretranslate.com/",
    help: "Only for libretranslate.com; a self-hosted server doesn't need one." },
  { key: "GOOGLE_BOOKS_API_KEY", group: "Web search", label: "Google Books API key", secret: true, link: "https://console.cloud.google.com/apis/library/books.googleapis.com",
    help: "Free. Searches inside millions of books for your phrases." },

  { key: "ENABLE_AI_LIKELIHOOD", group: "Optional checks", label: "AI indicator", kind: "bool",
    help: "Shows an AI-likelihood estimate. Unreliable by nature: a signal, never proof." },
  { key: "ENABLE_LANGUAGETOOL", group: "Optional checks", label: "LanguageTool second opinion", kind: "bool",
    help: "Needs your own LanguageTool server." },
  { key: "LANGUAGETOOL_URL", group: "Optional checks", label: "LanguageTool server", placeholder: "http://localhost:8010", help: "" },
  { key: "SEARCH_MAX_QUERIES", group: "Optional checks", label: "Passages searched per run", kind: "number", placeholder: "8",
    help: "More finds more sources in long documents but takes longer (1–40)." },
];

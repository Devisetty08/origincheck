// Pluggable interface for a paid plagiarism API. Unlike the search adapters it scans the whole document,
// asynchronously: submit, then the provider calls our webhook when the scan is done.
export interface PaidMatch { kind: "internet" | "database" | "repositories"; title: string; url?: string; introduction?: string; matchedWords: number }

export interface PaidResult {
  score: number; // provider's aggregated similarity, 0–100
  totalWords: number;
  identicalWords: number;
  minorChangedWords: number;
  relatedMeaningWords: number;
  matches: PaidMatch[];
}

export interface PaidChecker {
  id: string;
  label: string;
  /** null when ready, otherwise what is missing (shown as "not configured"). */
  missing(): string | null;
  submit(text: string, scanId: string, webhookUrl: string, signal?: AbortSignal): Promise<void>;
  /** Parse the provider's webhook body for a status; returns the result, an error message, or null to ignore the event. */
  parseWebhook(status: string, body: unknown): { result: PaidResult } | { error: string } | null;
}

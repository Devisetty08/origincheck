import { publicConfig } from "@/server/config";
import { sourceStatus } from "@/server/adapters";
import { improveStatus } from "@/server/improve";

/** Feature flags and which sources are configured — never the keys. */
export async function GET() {
  const im = await improveStatus(); // is the local model (or the Anthropic key) actually available?
  return Response.json({ ...publicConfig(), improve: im.provider, improveModel: im.model, improveNote: im.note, sources: sourceStatus() });
}

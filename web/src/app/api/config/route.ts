import { publicConfig } from "@/server/config";
import { sourceStatus } from "@/server/adapters";
import { improveStatus } from "@/server/improve";
import { isLocalRequest } from "@/server/local";

/** Feature flags and which sources are configured — never the keys. */
export async function GET(req: Request) {
  const im = await improveStatus(isLocalRequest(req)); // is the local model (or the Anthropic key) actually available, for this device?
  return Response.json({ ...publicConfig(), improve: im.provider, improveModel: im.model, improveNote: im.note, sources: sourceStatus() });
}

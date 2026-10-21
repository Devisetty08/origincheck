import { publicConfig } from "@/server/config";
import { sourceStatus } from "@/server/adapters";

/** Feature flags and which sources are configured — never the keys. */
export async function GET() {
  return Response.json({ ...publicConfig(), sources: sourceStatus() });
}

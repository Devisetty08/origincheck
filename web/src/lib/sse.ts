/** POST JSON and read a Server-Sent Events response, calling `on(event, data)` for each message. */
export async function postSse(url: string, body: unknown, on: (event: string, data: unknown) => void | Promise<void>, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    throw Object.assign(new Error((j as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const event = chunk.match(/^event: (.*)$/m)?.[1] ?? "message";
      const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
      await on(event, data ? JSON.parse(data) : null); // handlers may be async (e.g. parsing a PDF); keep order
    }
  }
}

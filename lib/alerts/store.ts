type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

export function alertMemoryConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

export async function shouldSendAlert(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  if (!alertMemoryConfigured()) {
    return false;
  }
  const stored = await redisCommand<"OK" | null>([
    "SET",
    key,
    "1",
    "EX",
    String(ttlSeconds),
    "NX",
  ]);
  return stored === "OK";
}

export async function rememberAlertPayload(
  key: string,
  payload: unknown,
  ttlSeconds: number,
): Promise<void> {
  if (!alertMemoryConfigured()) return;
  await redisCommand<"OK">([
    "SET",
    key,
    JSON.stringify(payload),
    "EX",
    String(ttlSeconds),
  ]);
}

async function redisCommand<T>(command: string[]): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;

  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify([command]),
  });
  const body = (await res.json().catch(() => null)) as
    | Array<UpstashResponse<T>>
    | null;
  if (!res.ok || !body?.[0] || body[0].error) {
    throw new Error(body?.[0]?.error || `Alert memory returned HTTP ${res.status}.`);
  }
  return body[0].result ?? null;
}

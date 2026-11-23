import { randomBytes, createHash } from "node:crypto";
import { jsonFile } from "./jsonFile";
type Session = { id: string; expires: number };
const file = jsonFile<Record<string, Session>>("sessions.json", () => ({}));
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function createSession(
  id: string,
  duration: number,
  previous = "",
) {
  const token = randomBytes(32).toString("hex");
  await file.update((s) => {
    for (const key of Object.keys(s))
      if (s[key].expires <= Date.now()) delete s[key];
    if (previous) delete s[hash(previous)];
    s[hash(token)] = { id, expires: Date.now() + duration };
  });
  return token;
}
export async function readSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return undefined;
  const s = (await file.read())[hash(token)];
  return s && s.expires > Date.now() ? s : undefined;
}
export async function revokeSession(token: string) {
  if (token)
    await file.update((s) => {
      delete s[hash(token)];
    });
}

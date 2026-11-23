import { cleanRut, validRut, formatRut } from "../shared/people";
import type { RutResult } from "../shared/rutLookup";
export function parseSre(
  body: unknown,
  status: number,
  rut: string,
): RutResult {
  const b =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fail = (message: string): RutResult => ({
    status: "unavailable",
    source: "sre",
    rut,
    message,
  });
  if (status === 403 || status === 429)
    return fail(
      "El servicio gratuito alcanzó su límite de consultas. Puedes completar los datos manualmente o intentar más tarde.",
    );
  if (status === 401)
    return fail(
      "El servicio de consulta no autorizó el acceso. Puedes escribir los datos manualmente.",
    );
  if (status === 404)
    return {
      status: "not_found",
      source: "sre",
      rut,
      message: "No se encontró la empresa. Completa sus datos manualmente.",
    };
  if (status < 200 || status >= 300)
    return fail(
      "El servicio externo no está disponible. Puedes escribir los datos manualmente.",
    );
  if (typeof b.rut === "string" && cleanRut(b.rut) !== cleanRut(rut))
    return fail(
      "El servicio devolvió un RUT diferente. No se aplicaron datos.",
    );
  if (
    b.result === true &&
    typeof b.razon_social === "string" &&
    b.razon_social.trim()
  ) {
    return {
      status: "found",
      source: "sre",
      rut,
      name: b.razon_social.trim().slice(0, 160),
      message:
        "Razón social encontrada en SRE. Revisa los datos. Este servicio no entrega la dirección completa.",
    };
  }
  if (b.result === false && !b.error && !b.message)
    return {
      status: "not_found",
      source: "sre",
      rut,
      message: "No se encontró información. Puedes completarla manualmente.",
    };
  return fail(
    "No fue posible obtener datos de la empresa. Puedes escribirlos manualmente.",
  );
}
const cache = new Map<string, { expires: number; value: RutResult }>();
const ongoing = new Map<string, Promise<RutResult>>();
export async function lookupSre(value: string): Promise<RutResult> {
  if (!validRut(value))
    throw new Error("Revisa el RUT y su dígito verificador.");
  const rut = formatRut(value),
    normalized = cleanRut(rut),
    key = normalized.slice(0, -1) + "-" + normalized.slice(-1);
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  if (ongoing.has(key)) return ongoing.get(key)!;
  const work = (async () => {
    try {
      const response = await fetch("https://sre.cl/api/company_info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: process.env.SRE_API_TOKEN || "token_publico",
          rut: key,
          version: "2.0",
        }),
        signal: AbortSignal.timeout(8000),
      });
      const result = parseSre(await response.json(), response.status, rut);
      if (result.status === "found" || result.status === "not_found") {
        if (cache.size >= 500) cache.delete(cache.keys().next().value!);
        cache.set(key, {
          expires: Date.now() + (result.status === "found" ? 86400000 : 300000),
          value: result,
        });
      }
      return result;
    } catch {
      return {
        status: "unavailable",
        source: "sre",
        rut,
        message:
          "No se pudo conectar con la consulta de empresas. Puedes escribir los datos manualmente.",
      } as RutResult;
    }
  })();
  ongoing.set(key, work);
  try {
    return await work;
  } finally {
    ongoing.delete(key);
  }
}

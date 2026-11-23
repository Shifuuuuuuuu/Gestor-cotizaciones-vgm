import { z } from "zod";
export const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().transform((v) => v.toLowerCase()),
  phone: z.string().max(30).transform(formatPhone),
  position: z.string().max(100),
  rut: z
    .string()
    .max(15)
    .transform(formatRut)
    .refine(
      (v) => !v || validRut(v),
      "Revisa el RUT del usuario y su dígito verificador.",
    )
    .optional(),
});
export type Profile = z.infer<typeof profileSchema> & {
  id: string;
  role: "admin" | "member";
  active: boolean;
  deleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
};
export const customerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  rut: z.string().max(15),
  email: z.union([z.email(), z.literal("")]),
  address: z.string().max(300),
  phone: z.string().max(30).transform(formatPhone),
});
export type Customer = z.infer<typeof customerSchema> & {
  id: string;
  updatedAt: string;
  active: boolean;
  deleted: boolean;
};
export const cleanRut = (rut: string) =>
  rut.replace(/[^0-9kK]/g, "").toUpperCase();
export function formatRut(value: string) {
  const rut = cleanRut(value).slice(0, 9);
  if (rut.length < 2) return rut;
  return (
    rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + rut.slice(-1)
  );
}
export function validRut(value: string) {
  const rut = cleanRut(value);
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  let sum = 0,
    m = 2;
  for (const c of rut.slice(0, -1).split("").reverse()) {
    sum += Number(c) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const v = 11 - (sum % 11);
  return rut.at(-1) === (v === 11 ? "0" : v === 10 ? "K" : String(v));
}

export function formatPhone(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (/^\+5?6?$/.test(text)) return text;
  if (text.startsWith("+") && !text.startsWith("+56")) return text;
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("0056")) digits = digits.slice(4);
  else if (
    digits.startsWith("56") &&
    (digits.length > 9 || text.startsWith("+56"))
  )
    digits = digits.slice(2);
  if (!digits) return "";
  if (!/^[2-9]/.test(digits) || digits.length > 9) return text;
  return (
    "+56 " +
    [digits.slice(0, 1), digits.slice(1, 5), digits.slice(5, 9)]
      .filter(Boolean)
      .join(" ")
  );
}
export function formatContactField(key: string, value: string) {
  return key === "phone"
    ? formatPhone(value)
    : key === "rut"
      ? formatRut(value)
      : value;
}

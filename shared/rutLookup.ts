export type RutResult = {
  status: "found" | "not_found" | "unavailable" | "blocked";
  source: "local" | "sre";
  rut: string;
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
  message: string;
};

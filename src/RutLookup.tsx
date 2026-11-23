import { useEffect, useRef, useState } from "react";
import { Search, Check } from "lucide-react";
import { cleanRut, validRut, formatRut, type Customer } from "../shared/people";
import type { RutResult } from "../shared/rutLookup";
import { api } from "./api";
import { Spinner } from "./ui";
export function RutLookup({
  rut,
  customers,
  onApply,
  disabled = false,
}: {
  rut: string;
  customers: Customer[];
  onApply: (result: RutResult) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [result, setResult] = useState<RutResult | null>(null);
  const current = useRef(rut);
  current.current = rut;
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current++;
    setResult(null);
    setBusy(false);
    return () => {
      sequence.current++;
    };
  }, [rut]);
  async function search() {
    const input = rut,
      id = ++sequence.current;
    setBusy(true);
    setResult(null);
    try {
      const local = customers.find((c) => cleanRut(c.rut) === cleanRut(input));
      const response: RutResult = local
        ? !local.active || local.deleted
          ? {
              status: "blocked",
              source: "local",
              rut: input,
              message:
                "Este cliente está bloqueado o eliminado. Revisa su registro en Clientes.",
            }
          : {
              status: "found",
              source: "local",
              rut: formatRut(input),
              name: local.name,
              address: local.address,
              email: local.email,
              phone: local.phone,
              message: "Cliente encontrado en tu directorio.",
            }
        : await api("rut/lookup", { rut: input });
      if (id === sequence.current && current.current === input)
        setResult(response);
    } catch {
      if (id === sequence.current)
        setResult({
          status: "unavailable",
          source: "sre",
          rut: input,
          message:
            "Sin conexión o consulta no disponible. Puedes completar los datos manualmente.",
        });
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }
  const registered = cleanRut(rut)
    ? customers.find((c) => cleanRut(c.rut) === cleanRut(rut))
    : undefined;
  if (registered)
    return (
      <div className="rut-lookup rut-local" role="status">
        <Check size={15} />
        <span>
          {registered.active && !registered.deleted
            ? "Cliente registrado · Se utilizan los datos de tu directorio."
            : "Cliente bloqueado o eliminado · Revisa su registro en Clientes."}
        </span>
      </div>
    );
  return (
    <div className="rut-lookup">
      <button
        type="button"
        disabled={disabled || busy || !validRut(rut)}
        onClick={search}
      >
        {busy ? <Spinner /> : <Search size={15} />}{" "}
        {busy ? "Consultando…" : "Consultar RUT"}
      </button>
      <p className="hint">
        Primero buscamos en tus clientes. Si no existe, se consulta el RUT en
        SRE (servicio externo gratuito, sujeto a cupo).
      </p>
      {result && (
        <div className="rut-result" role="status">
          <p>{result.message}</p>
          {result.status === "found" && (
            <>
              <strong>{result.name}</strong>
              {result.address && <p>{result.address}</p>}
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onApply(result);
                  setResult(null);
                }}
              >
                <Check size={15} />
                Completar campos vacíos
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

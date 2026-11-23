import { useEffect, useRef, useState } from "react";
import { ImagePlus, Package, UploadCloud, X } from "lucide-react";
import { auth } from "./api";
import { Spinner } from "./ui";
export function ProductImage({
  src,
  alt = "",
  className = "",
}: {
  src?: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    setUrl("");
    if (!src) return;
    const abort = new AbortController();
    let local = "";
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch(src, {
          signal: abort.signal,
          credentials: "same-origin",
          headers: token ? { Authorization: "Bearer " + token } : {},
        });
        if (!response.ok) return;
        local = URL.createObjectURL(await response.blob());
        if (!abort.signal.aborted) setUrl(local);
        else URL.revokeObjectURL(local);
      } catch {}
    })();
    return () => {
      abort.abort();
      if (local) URL.revokeObjectURL(local);
    };
  }, [src]);
  return (
    <span className={"product-image " + className}>
      {url ? <img src={url} alt={alt} /> : <Package size={22} />}
    </span>
  );
}
async function prepareImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Selecciona PNG, JPG o WebP.");
  if (file.size > 5 * 1024 * 1024)
    throw new Error("La imagen original debe pesar menos de 5 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const factor = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * factor));
    canvas.height = Math.max(1, Math.round(bitmap.height * factor));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("No se pudo preparar la imagen.")),
        "image/jpeg",
        0.78,
      ),
    );
    if (blob.size > 400 * 1024)
      throw new Error(
        "La imagen aún es muy pesada. Usa una imagen más pequeña.",
      );
    return blob;
  } finally {
    bitmap.close();
  }
}
export function ImageDropzone({
  value,
  onChange,
  onBusy,
}: {
  value: string;
  onChange: (url: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [drag, setDrag] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const blob = await prepareImage(file),
        token = await auth?.currentUser?.getIdToken();
      const res = await fetch("/api/images", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": blob.type,
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo subir la imagen.");
      onChange(data.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="image-uploader">
      <div
        className={"image-drop " + (drag ? "dragging" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Imagen del producto"
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = "";
          }}
          hidden
        />
        {value ? (
          <ProductImage
            src={value}
            alt="Imagen del producto"
            className="large"
          />
        ) : (
          <UploadCloud size={32} />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? <Spinner /> : <ImagePlus size={16} />}{" "}
          {busy
            ? "Preparando imagen…"
            : value
              ? "Cambiar imagen"
              : "Seleccionar imagen"}
        </button>
        <small>O arrastra una imagen aquí · JPG, PNG, WebP · máx. 5 MB</small>
        {value && (
          <button
            className="icon-button"
            type="button"
            aria-label="Quitar imagen"
            disabled={busy}
            onClick={() => onChange("")}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

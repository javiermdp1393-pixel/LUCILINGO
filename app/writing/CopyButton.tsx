"use client";

import { useState } from "react";

/** Copia un texto al portapapeles, con confirmación breve. */
export function CopyButton({
  text,
  label = "Copiar texto corregido",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Safari en contextos sin permiso: seleccionamos como plan B.
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* si tampoco puede, el usuario copia a mano */
      }
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className={`flex min-h-12 w-full items-center justify-center rounded-2xl border border-brand px-4 text-sm font-semibold text-brand-ink active:scale-[0.99] ${className}`}
    >
      {copied ? "¡Copiado! ✅" : label}
    </button>
  );
}

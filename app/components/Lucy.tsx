import Image from "next/image";

// Lucy, la mascota. Placeholder SVG hasta subir el PNG real a
// public/brand/lucy.png (ver README) — cambia el `src` a "/brand/lucy.png".
export function Lucy({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/lucy.svg"
      alt="Lucy"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}

import Image from "next/image";

// Lucy, la mascota de Lucilingo.
export function Lucy({ size = 96, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/lucy.png"
      alt="Lucy"
      width={size}
      height={size}
      priority
      className={className}
    />
  );
}

import { cn } from "@/lib/utils";

interface VelaLogoProps {
  className?: string;
  withWordmark?: boolean;
  size?: number;
}

/**
 * Vela.ai brand mark - circular hull (Mist) containing a two-tone sail
 * (Ocean + Seafoam) angled with the wind. Optional wordmark to the right.
 */
export const VelaLogo = ({ className, withWordmark = true, size = 28 }: VelaLogoProps) => {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="Vela.ai">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-hidden={withWordmark ? "true" : undefined}
      >
        <circle cx="32" cy="32" r="30" fill="hsl(var(--muted))" />
        {/* main sail - Ocean */}
        <polygon points="20,48 20,14 46,48" fill="hsl(var(--primary))" />
        {/* secondary sail - Seafoam / Teal */}
        <polygon points="24,48 44,20 44,48" fill="hsl(var(--accent))" />
        {/* waterline */}
        <rect x="14" y="48" width="36" height="2" rx="1" fill="hsl(var(--primary) / 0.6)" />
      </svg>
      {withWordmark && (
        <span
          className="font-extrabold tracking-tight text-foreground leading-none"
          style={{ fontSize: Math.round(size * 0.72) }}
        >
          <span style={{ color: "#042C53" }}>Vela</span>
          <span className="text-accent">.ai</span>
        </span>
      )}
    </span>
  );
};

export default VelaLogo;
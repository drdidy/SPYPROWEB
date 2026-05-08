import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const v: Record<Variant, string> = {
  primary:
    "bg-ink text-paper hover:bg-ink-2 shadow-[0_1px_0_0_rgba(20,22,26,0.6)]",
  secondary:
    "bg-paper text-ink shadow-rule hover:shadow-rule-strong hover:bg-paper-2/50",
  outline:
    "bg-transparent text-ink shadow-rule hover:shadow-rule-strong",
  ghost: "text-ink-2 hover:text-ink hover:bg-paper-2/60",
  danger: "bg-bear text-paper hover:bg-bear-ink",
};

const s: Record<Size, string> = {
  xs: "h-6 px-2 text-[11px]",
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(({ className, variant = "secondary", size = "md", ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center gap-1.5 rounded-soft font-medium tracking-tight transition-all duration-150 ease-swift disabled:opacity-40 disabled:pointer-events-none",
      v[variant],
      s[size],
      className,
    )}
    {...props}
  />
));
Button.displayName = "Button";

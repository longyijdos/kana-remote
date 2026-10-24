import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ButtonHTMLAttributes } from "react";

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      className={`${className} shrink-0 animate-spin motion-reduce:animate-none`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  iconOnly?: boolean;
};
const variants = {
  primary: "border-foreground bg-foreground text-background hover:opacity-85",
  secondary: "border-border bg-surface text-foreground hover:bg-muted/40",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
};

export function Button({
  variant = "primary",
  iconOnly = false,
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 border border-solid font-medium transition-[color,background-color,border-color,opacity,scale] duration-[180ms] ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100 ${
        iconOnly ? "size-10 shrink-0 rounded-full p-0" : "min-h-10 rounded-xl px-4 py-2.5 text-sm"
      } ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  icon: Icon,
  label,
  busy = false,
  ...props
}: Omit<ButtonProps, "children" | "iconOnly"> & {
  icon: LucideIcon;
  label: string;
  busy?: boolean;
}) {
  return (
    <Button variant="ghost" iconOnly aria-label={label} title={label} {...props}>
      <span className="grid size-5 place-items-center" aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.span
            key={busy ? "busy" : Icon.displayName}
            className="col-start-1 row-start-1 flex size-5 items-center justify-center"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
          >
            {busy ? <Spinner /> : <Icon className="size-[18px]" strokeWidth={1.75} />}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}

import { cn } from '../../lib/utils.js';

export function Label({ className, ...props }) {
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn('h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Select({ className, ...props }) {
  return (
    <select
      className={cn('h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn('min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
  );
}

export function Field({ label, htmlFor, className, children }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

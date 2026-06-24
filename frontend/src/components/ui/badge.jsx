import { cn } from '../../lib/utils.js';

const variants = {
  pending: 'border-border bg-secondary text-muted-foreground',
  in_progress: 'border-accent/50 bg-accent/15 text-accent',
  completed: 'border-primary/50 bg-primary/15 text-primary',
  failed: 'border-destructive/50 bg-destructive/15 text-destructive',
  ready: 'border-primary/50 bg-primary/15 text-primary',
};

export function Badge({ className, variant = 'pending', ...props }) {
  return (
    <span
      className={cn('inline-flex min-h-6 items-center rounded-md border px-2 py-0.5 text-xs font-medium capitalize', variants[variant] || variants.pending, className)}
      {...props}
    />
  );
}

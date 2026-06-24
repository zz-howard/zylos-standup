import { cn } from '../../lib/utils.js';

export function Card({ className, ...props }) {
  return <section className={cn('rounded-lg border border-border bg-card text-card-foreground', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('space-y-1.5 p-4 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={cn('text-base font-semibold tracking-normal', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('p-4 pt-0', className)} {...props} />;
}

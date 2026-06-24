import { Badge } from './ui/badge.jsx';
import { Button } from './ui/button.jsx';
import { cn } from '../lib/utils.js';

function statusLabel(status) {
  if (status === 'in_progress') return 'In progress';
  return status || 'pending';
}

export default function TaskCard({ task, active, onSelect }) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start rounded-lg border p-3 text-left',
        active ? 'border-primary/60 bg-primary/10' : 'border-border bg-card hover:bg-secondary',
      )}
      onClick={() => onSelect(task.id)}
    >
      <div className="grid w-full gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{task.report_date}</div>
            <div className="text-xs text-muted-foreground">Task #{task.id}</div>
          </div>
          <Badge variant={task.status}>{statusLabel(task.status)}</Badge>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
          {task.ai_summary || 'No summary yet.'}
        </p>
      </div>
    </Button>
  );
}

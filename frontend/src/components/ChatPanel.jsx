import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import MarkdownText from './MarkdownText.jsx';
import { Button } from './ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.jsx';
import { Input } from './ui/form.jsx';
import { cn } from '../lib/utils.js';

export default function ChatPanel({ messages, disabled, onSend, sending }) {
  const [message, setMessage] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function submit(event) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setMessage('');
    await onSend(trimmed);
  }

  return (
    <Card className="flex min-h-[420px] min-w-0 flex-col">
      <CardHeader>
        <CardTitle>AI chat</CardTitle>
        <CardDescription>Capture follow-up details and maintain the report summary.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={scrollRef} className="min-h-[220px] flex-1 overflow-y-auto rounded-md border border-border bg-background/60 p-3">
          {messages.length ? (
            <div className="grid gap-3">
              {messages.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    'max-w-[92%] rounded-lg border px-3 py-2 text-sm leading-6',
                    row.role === 'user'
                      ? 'ml-auto border-primary/40 bg-primary/15'
                      : 'mr-auto border-border bg-secondary',
                  )}
                >
                  <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">{row.role}</div>
                  <MarkdownText text={row.content} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted-foreground">
              No chat yet.
            </div>
          )}
        </div>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submit}>
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={disabled || sending}
            placeholder="Send an update or answer a follow-up"
          />
          <Button type="submit" disabled={disabled || sending || !message.trim()} className="sm:w-auto">
            <Send className="h-4 w-4" />
            Send
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

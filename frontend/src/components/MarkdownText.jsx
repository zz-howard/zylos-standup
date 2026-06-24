function renderInline(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

export default function MarkdownText({ text, className = '' }) {
  const lines = String(text || '').split(/\r?\n/);
  return (
    <div className={className}>
      {lines.map((line, index) => (
        <p key={index} className={line.trim() ? 'mb-2 last:mb-0' : 'mb-3'}>
          {line.trim() ? renderInline(line) : '\u00a0'}
        </p>
      ))}
    </div>
  );
}

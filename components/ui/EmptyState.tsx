import { ReactNode } from "react";
import { Button } from "./Button";

export function EmptyState({
  icon,
  title,
  body,
  exampleAction,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  exampleAction?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-paper-2 flex items-center justify-center text-ink-3 mb-5 shadow-rule">
        {icon}
      </div>
      <h3 className="text-title font-serif text-ink mb-1.5">{title}</h3>
      <p className="text-sm text-ink-2 max-w-md mb-5 leading-relaxed">{body}</p>
      {exampleAction && (
        <Button variant="secondary" size="sm" onClick={exampleAction.onClick}>
          {exampleAction.label}
        </Button>
      )}
    </div>
  );
}

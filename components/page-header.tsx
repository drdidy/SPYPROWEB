import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  desc: string;
  action?: ReactNode;
}

export function PageHeader({ title, desc, action }: PageHeaderProps) {
  return (
    <div style={{
      display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      gap: 24, marginBottom: 24, flexWrap: "wrap",
    }}>
      <div>
        <h1 className="t-display-s" style={{ margin: "0 0 6px", color: "var(--text-primary)" }}>{title}</h1>
        <p className="t-body-l c-secondary" style={{ margin: 0, maxWidth: 640 }}>{desc}</p>
      </div>
      {action}
    </div>
  );
}

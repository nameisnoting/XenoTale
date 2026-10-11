import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import './DisclosureCard.css';

export function CardSection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="edit-card-section" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <div className="edit-card-section-body">{children}</div>
    </section>
  );
}

export function CardHeader({
  title,
  leading,
  children,
  titleContent,
  titleClassName = '',
  chevronClassName = '',
  collapsible = true,
}: {
  title: string;
  leading?: ReactNode;
  children?: ReactNode;
  titleContent?: ReactNode;
  titleClassName?: string;
  chevronClassName?: string;
  collapsible?: boolean;
}) {
  const Header = collapsible ? 'summary' : 'div';
  return (
    <Header className={`card-header ${collapsible ? '' : 'card-header-static'}`}>
      {leading}
      <span className={`disclosure-title ${titleClassName}`} title={title}>
        {titleContent ?? title}
      </span>
      {children}
      {collapsible && (
        <ChevronDown
          className={`disclosure-chevron ${chevronClassName}`}
          size={16}
          aria-hidden="true"
        />
      )}
    </Header>
  );
}

export function DisclosureCard({
  title,
  actions,
  children,
  className = '',
  expanded = false,
  leading,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  expanded?: boolean;
  leading?: ReactNode;
}) {
  return (
    <details className={`disclosure-card edit-card-typography ${className}`} open={expanded}>
      <CardHeader title={title} leading={leading}>
        {actions}
      </CardHeader>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

import type { ReactNode } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';

type SettingsMenuItemProps = { icon: ReactNode; label: string } & (
  { href: string; onClick?: never } | { href?: never; onClick: () => void }
);

export function SettingsMenuItem({ icon, label, href, onClick }: SettingsMenuItemProps) {
  const contents = (
    <>
      {icon}
      <span>{label}</span>
      {href ? <ExternalLink /> : <ChevronRight />}
    </>
  );
  return href ? (
    <a className="settings-menu-item" href={href} target="_blank" rel="noopener noreferrer">
      {contents}
    </a>
  ) : (
    <button className="settings-menu-item" type="button" onClick={onClick}>
      {contents}
    </button>
  );
}

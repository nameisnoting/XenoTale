import type { ButtonHTMLAttributes } from 'react';
import { SquarePlus } from 'lucide-react';
import { Button } from './UI';
import './AddButton.css';

// Full-width list creation actions share the user-note button's appearance.
export function AddButton({
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button type="button" {...props} className={`full add-button ${className}`}>
      <SquarePlus size={24} aria-hidden="true" />
      {children}
    </Button>
  );
}

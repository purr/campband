import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** Icon to display (Lucide icon element) */
  icon: React.ReactNode;
  /** Main title */
  title: string;
  /** Description text */
  description?: string;
  /** Optional action button */
  action?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * Shared empty state component for lists, grids, etc.
 * Used when there's no content to display.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-8 text-center',
        className
      )}
    >
      <div className="w-24 h-24 rounded-2xl bg-surface flex items-center justify-center mb-6 text-muted">
        <div className="opacity-50">{icon}</div>
      </div>
      <h2 className="text-lg font-medium text-text mb-2">{title}</h2>
      {description && (
        <p className="text-muted max-w-md">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}


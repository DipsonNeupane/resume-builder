import type { MouseEvent } from 'react';

export type WorkspaceSection = 'today' | 'discover' | 'applications' | null;
type Props = { current: WorkspaceSection; onNavigate: (section: Exclude<WorkspaceSection, null>) => void };

const items: { id: Exclude<WorkspaceSection, null>; label: string; href: string }[] = [
  { id: 'today', label: 'Today', href: '/workspace/today' },
  { id: 'discover', label: 'Discover', href: '/workspace/discover' },
  { id: 'applications', label: 'My applications', href: '/workspace/applications' },
];

/** Primary workspace navigation. Resume, profile, preferences and billing stay in the
 * profile/secondary area; resume editing also opens from each application. */
export function WorkspaceNav({ current, onNavigate }: Props) {
  const go = (event: MouseEvent<HTMLAnchorElement>, id: Exclude<WorkspaceSection, null>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(id);
  };
  return <nav className="workspace-nav" aria-label="Workspace">
    {items.map(item => <a key={item.id} href={item.href} aria-current={current === item.id ? 'page' : undefined} onClick={event => go(event, item.id)}>{item.label}</a>)}
  </nav>;
}

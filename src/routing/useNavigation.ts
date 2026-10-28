import { useCallback, useEffect, useState } from 'react';
import { isAccountCallback, parseAppRoute, routeForPage, routePage, type AppRoute, type LegacyAppPage, type NavigableRoute } from './routes';

type NavigationTarget = LegacyAppPage | NavigableRoute;
type NavigationOptions = { replace?: boolean };

function currentRoute(): AppRoute {
 return parseAppRoute(window.location);
}

export function useNavigation() {
 const [route, setRoute] = useState<AppRoute>(currentRoute);
 useEffect(() => {
  const initial = currentRoute();
  if (window.location.pathname === '/' && window.location.search && !isAccountCallback(window.location) && initial.kind !== 'home' && initial.kind !== 'not_found') {
   window.history.replaceState(null, '', initial.path);
  } else if ((initial.kind === 'workspace_jobs' || initial.kind === 'workspace_applications' || initial.kind === 'workspace_today') && window.location.pathname.replace(/\/$/, '').toLowerCase() !== initial.path) {
   // Retained links (/workspace, /workspace/jobs, /workspace/jobs/saved) show their current path.
   window.history.replaceState(null, '', `${initial.path}${window.location.search}${window.location.hash}`);
  }
  const restore = () => setRoute(currentRoute());
  window.addEventListener('popstate', restore);
  return () => window.removeEventListener('popstate', restore);
 }, []);
 const navigate = useCallback((target: NavigationTarget, options: NavigationOptions = {}) => {
  const next = typeof target === 'string' ? routeForPage(target) : target;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current !== next.path) window.history[options.replace ? 'replaceState' : 'pushState'](null, '', next.path);
  setRoute(next);
  window.scrollTo(0, 0);
 }, []);
 return { route, page: routePage(route), navigate };
}

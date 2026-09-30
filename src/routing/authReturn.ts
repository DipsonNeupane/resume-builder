import { routeForJourney, routeForPage, savedJobsRoute, type NavigableRoute } from './routes';

export type AuthReturnKey='import'|'build'|'job'|'resume'|'jobs'|'saved'|'pro';
export function authReturnKey(route:NavigableRoute):AuthReturnKey|null{
 switch(route.kind){
  case 'start_import':return'import';case'start_build':return'build';case'start_job':return'job';
  case'workspace_resume':case'workspace_job_resume':return'resume';
  case'workspace_jobs':case'workspace_match':return'jobs';case'workspace_saved_jobs':return'saved';case'workspace_pro':return'pro';
  default:return null;
 }
}
export function authReturnRoute(value:string|null):NavigableRoute|null{
 switch(value){case'import':return routeForJourney('import_first');case'build':return routeForJourney('build_first');case'job':return routeForJourney('job_first');case'resume':return routeForPage('builder');case'jobs':return routeForPage('jobs');case'saved':return savedJobsRoute();case'pro':return routeForPage('pro');default:return null;}
}
export function accountUrl(route:NavigableRoute,recovery=false):string{
 const params=new URLSearchParams();const key=authReturnKey(route);if(key)params.set('return_to',key);if(recovery)params.set('reset','1');
 return `/workspace/account${params.size?`?${params}`:''}`;
}

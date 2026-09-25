import { browserProjects } from './playwright.browsers';
import { defineConfig } from '@playwright/test';
// Dedicated port (not 5173, the normal interactive `npm run dev` port) and
// reuseExistingServer:false so this suite never attaches to a developer's
// already-running dev server — that server inherits whatever real config is
// in .env.local (which, per HANDOFF.md, now points at a live Supabase
// project), which previously made `authConfigured` true under this suite and
// broke the unconfigured-account-screen test. Explicit empty Supabase env
// vars on the spawned server additionally override .env.local directly
// (Vite's loadEnv gives already-set process.env vars priority over .env
// files), so this suite is always exercising the unconfigured/local-only
// builder regardless of what any .env.local on the machine contains.
export default defineConfig({projects:browserProjects(),testDir:'./tests',testIgnore:['**/auth/**','**/extension/**','**/paid/**','**/server/**','**/billing/**'],use:{baseURL:'http://127.0.0.1:5183',headless:true},webServer:{command:'npm run dev -- --port 5183 --strictPort',url:'http://127.0.0.1:5183',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''}},reporter:'list'});

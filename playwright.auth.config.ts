import { browserProjects } from './playwright.browsers';
import { defineConfig } from '@playwright/test';
// VITE_CLOUD_STORAGE_ENABLED:'true' here because tests/auth/resumes.spec.ts
// specifically exercises cloud resume sync (load/save/create/consent/
// conflict), which is off by default (see .env.example).
export default defineConfig({projects:browserProjects(),testDir:'./tests/auth',use:{baseURL:'http://127.0.0.1:5174',headless:true},webServer:{command:'npm run dev -- --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'https://auth-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-placeholder',VITE_CLOUD_STORAGE_ENABLED:'true'}},reporter:'list'});

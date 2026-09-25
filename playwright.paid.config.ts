import { browserProjects } from './playwright.browsers';
import {defineConfig} from '@playwright/test';
export default defineConfig({projects:browserProjects(),testDir:'./tests/paid',use:{baseURL:'http://127.0.0.1:5181',headless:true},webServer:{command:'npm run dev -- --port 5181 --strictPort',url:'http://127.0.0.1:5181',reuseExistingServer:false,env:{VITE_SUPABASE_URL:'https://auth-test.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public-placeholder',VITE_BILLING_UI_ENABLED:'true',VITE_PAID_FEATURES_UI_ENABLED:'true'}},reporter:'list'});

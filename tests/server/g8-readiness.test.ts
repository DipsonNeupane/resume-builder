import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capabilities } from '../../src/content/capabilities.ts';
import { commercialPolicy } from '../../src/content/commercial.ts';
import { defaultInterfaceLocale, initialInterfaceLocale, parseInterfaceLocale, protectedProductIdentifiers, supportedInterfaceLocales } from '../../src/i18n/locale.ts';

const read=(path:string)=>readFileSync(path,'utf8');

test('public Match methodology covers actual evidence states, clarifications, limits and AI boundary',()=>{
 const methodology=capabilities.find(item=>item.slug==='match-methodology');
 assert.ok(methodology);
 const copy=JSON.stringify(methodology);
 for(const phrase of ['required','preferred','Clearly demonstrated','Worth reviewing','Not demonstrated','confirmed incompatibility','deterministic','AI']) assert.match(copy,new RegExp(phrase,'i'));
 for(const phrase of ['hiring prediction','ATS score','decision']) assert.match(copy,new RegExp(phrase,'i'));
 const engine=read('server/jobs/match.ts');
 for(const token of ["'required'","'preferred'","'nice_to_have'","'demonstrated'","'partially_demonstrated'","'not_demonstrated'","'confirmed_incompatible'"]) assert.match(engine,new RegExp(token));
 assert.match(read('middleware.ts'),/\/features\/match-methodology\//);
});

test('voluntary outcome boundary is consented, self-reported, bounded and content-free',()=>{
 const migration=read('supabase/migrations/20260930140000_voluntary_outcomes.sql');
 for(const value of ['application_prepared','application_submitted','interview_received','offer_received','declined','withdrawn','self_reported','outcomes-v1']) assert.match(migration,new RegExp(value));
 const columns=migration.match(/create table public\.product_outcome_reports \(([\s\S]*?)\n\);/)?.[1]??'';
 assert.doesNotMatch(columns,/\b(?:resume_text|job_text|job_url|notes|contact_details)\b/);
 const ui=read('src/features/jobs/OutcomeReportPanel.tsx');
 assert.match(ui,/optional/i);assert.match(ui,/will not claim it caused/i);assert.match(ui,/No resume text, job text, job URL, notes or contact details/i);
 assert.match(ui,/consent:true/);
});

test('commercial launch contract stays US-only, USD-only and refuses unverified tax, invoice or method claims',()=>{
 assert.match(commercialPolicy.territory,/only in the United States/i);
 assert.match(commercialPolicy.currency,/USD/);
 assert.match(commercialPolicy.paymentMethods,/does not promise a particular method/i);
 assert.match(commercialPolicy.taxesAndInvoices,/Review any taxes, currency conversion, invoice, and receipt details in Stripe Checkout before paying/i);
 assert.match(commercialPolicy.refunds,/mandatory consumer/i);
 const territory=read('server/billing/catalog.ts');
 assert.match(territory,/country !== 'US'/);
});

test('localization contract defaults to an explicit supported locale without country or IP inference',()=>{
 assert.deepEqual(supportedInterfaceLocales,['en']);
 assert.equal(defaultInterfaceLocale,'en');
 assert.equal(parseInterfaceLocale('en'),'en');
 assert.equal(parseInterfaceLocale('fr'),null);
 assert.equal(initialInterfaceLocale({getItem:()=>null}),'en');
 assert.equal(initialInterfaceLocale({getItem:()=> 'en'}),'en');
 assert.ok(protectedProductIdentifiers.includes('APWICO'));
 const source=read('src/i18n/locale.ts');
 assert.doesNotMatch(source,/x-vercel-ip-country|geoip|navigator\.language/);
 const builder=read('src/main.tsx');
 assert.match(builder,/Resume language code/);assert.match(builder,/Writing direction/);assert.match(builder,/does not translate the English interface/);
});

test('cloud lifecycle has explicit consent, conflict handling, account switching and self-service deletion',()=>{
 const hook=read('src/hooks/useCloudResume.ts');
 const service=read('src/services/resumes.ts');
 for(const phrase of ['acceptConsent','ResumeConflictError','sessionEpoch','restoreGuestDraft','removeFromAccount']) assert.match(hook,new RegExp(phrase));
 assert.match(service,/\.delete\(\)\.eq\('owner_id', ownerId\)\.eq\('revision', expectedRevision\)/);
 assert.match(read('supabase/migrations/20260918120000_resume_storage.sql'),/resumes_delete_own/);
});

test('post-launch G8 initiatives have no fabricated evidence fixtures',()=>{
 const status=read('docs/redesign/BLUEPRINT_STATUS.md');
 assert.doesNotMatch(status,/advisory group.*COMPLETE|partnerships.*COMPLETE|original research.*COMPLETE/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPendingJobImport, storePendingJobImport } from '../../src/services/extensionImport.ts';

class MemoryStorage {
  private values = new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,String(value));}
  removeItem(key:string){this.values.delete(key);}
}
const capture={title:'Fictional role',company:'Example',description:'Fictional duties',sourceUrl:'https://jobs.example/one',capturedAt:new Date().toISOString(),site:'manual' as const};

test('guest capture can be adopted once by the account that completes continuation',()=>{
 const storage=new MemoryStorage();storePendingJobImport(storage as unknown as Storage,capture,null);
 assert.deepEqual(loadPendingJobImport(storage as unknown as Storage,'owner-a'),capture);
 assert.deepEqual(loadPendingJobImport(storage as unknown as Storage,'owner-a'),capture);
 assert.equal(loadPendingJobImport(storage as unknown as Storage,'owner-b'),null);
});

test('account-owned capture is never restored for another account',()=>{
 const storage=new MemoryStorage();storePendingJobImport(storage as unknown as Storage,capture,'owner-a');
 assert.equal(loadPendingJobImport(storage as unknown as Storage,'owner-b'),null);
 assert.equal(loadPendingJobImport(storage as unknown as Storage,'owner-a'),null);
});

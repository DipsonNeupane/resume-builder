import test from 'node:test'
import assert from 'node:assert/strict'
import {costMicroUsd,reserveCost,MAX_INPUT_BYTES} from '../../server/ai/cost.ts'
test('AI cost uses integer micro dollars and rounds upward',()=>{
 assert.equal(costMicroUsd(1000000,1000000),2000000)
 assert.equal(costMicroUsd(1,0),1)
 assert.equal(costMicroUsd(0,1),2)
 for(const value of [-1,NaN,Infinity,0.5]) assert.throws(()=>costMicroUsd(value,0))
})
test('reservation counts multibyte input and includes maximum output',()=>{
 assert.ok(reserveCost('é')>4800)
 assert.throws(()=>reserveCost('é'.repeat(MAX_INPUT_BYTES)))
 assert.ok(reserveCost('x'.repeat(MAX_INPUT_BYTES))<25000000)
})

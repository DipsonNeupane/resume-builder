import Stripe from 'stripe'
import { premiumTemplates } from '../src/model.js'

const secret=process.env.STRIPE_SECRET_KEY
if(!secret?.startsWith('sk_test_'))throw new Error('Stripe catalog verification is test-mode only.')
const stripe=new Stripe(secret)
const account=await stripe.accounts.retrieve()
if(account.id!==process.env.STRIPE_ACCOUNT_ID)throw new Error('Unexpected Stripe test account')
const specs=[{key:'pro:monthly',amount:1999},...premiumTemplates.map(template=>({key:`template:${template.id}`,amount:199}))]
const mapping:Record<string,string>={};let pro=''
for(const spec of specs){
 const products=await stripe.products.search({query:`metadata['offer_key']:'${spec.key}'`,limit:2})
 if(products.data.length!==1||!products.data[0].active||products.data[0].livemode)throw new Error(`Invalid Product mapping for ${spec.key}`)
 const prices=await stripe.prices.list({product:products.data[0].id,active:true,type:'recurring',limit:100})
 const matches=prices.data.filter(price=>!price.livemode&&price.currency==='usd'&&price.unit_amount===spec.amount&&price.recurring?.interval==='month'&&price.recurring.interval_count===1&&price.metadata.offer_key===spec.key)
 if(matches.length!==1)throw new Error(`Expected exactly one authoritative monthly Price for ${spec.key}`)
 if(spec.key==='pro:monthly')pro=matches[0].id;else mapping[spec.key.slice(9)]=matches[0].id
}
console.log(`PASS Stripe TEST account ${account.id}: ${specs.length} allowlisted Products and ${specs.length} monthly Prices verified`)
console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${pro}`)
console.log(`STRIPE_TEMPLATE_PRICE_MAP=${JSON.stringify(mapping)}`)

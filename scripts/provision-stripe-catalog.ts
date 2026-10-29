import Stripe from 'stripe'

const apply = process.argv.includes('--apply')
const live = process.argv.includes('--live')
const secret = process.env.STRIPE_SECRET_KEY
if (!secret || (!secret.startsWith('sk_test_') && !secret.startsWith('sk_live_'))) throw new Error('Set a valid Stripe secret key.')
if (secret.startsWith('sk_live_') !== live) throw new Error(`Stripe key mode does not match ${live ? '--live' : 'test-mode'} catalog provisioning.`)
if (live && (!apply || process.env.STRIPE_CATALOG_APPLY_LIVE !== 'true')) {
 throw new Error('Live catalog provisioning requires --apply --live and STRIPE_CATALOG_APPLY_LIVE=true.')
}
const stripe = new Stripe(secret)
// Additive only: this prepares the V2 Pro price and deliberately leaves every
// existing price/product active so legacy subscribers continue to renew.
const specs = [{ key:'pro:monthly', name:'APWICO Pro', amount:1499 }]

for (const spec of specs) {
 const products = await stripe.products.search({ query:`metadata['offer_key']:'${spec.key}'`, limit:2 })
 if (products.data.length>1) throw new Error(`Duplicate Stripe products for ${spec.key}`)
 let product=products.data[0]
 if (!product) {
  if (!apply) { console.log(`[dry-run] create product and monthly USD price: ${spec.key} (${spec.amount} cents)`); continue }
  product=await stripe.products.create({name:spec.name,metadata:{offer_key:spec.key,apwico_catalog:'v2'},tax_code:'txcd_10103000'},{idempotencyKey:`catalog-product:${spec.key}`})
 }
 const prices=await stripe.prices.list({product:product.id,active:true,type:'recurring',limit:100})
 let price=prices.data.find(item=>item.currency==='usd'&&item.unit_amount===spec.amount&&item.recurring?.interval==='month'&&item.recurring.interval_count===1)
 if (!price) {
  if (!apply) { console.log(`[dry-run] create monthly USD price for existing ${spec.key} (${spec.amount} cents)`); continue }
  price=await stripe.prices.create({product:product.id,currency:'usd',unit_amount:spec.amount,recurring:{interval:'month',interval_count:1},lookup_key:`apwico_${spec.key.replace(':','_')}_monthly`,metadata:{offer_key:spec.key}},{idempotencyKey:`catalog-price:${spec.key}:usd:${spec.amount}:month`})
 }
 console.log(`STRIPE_PRO_MONTHLY_PRICE_ID=${price.id}`)
}
if (!apply) console.log(`Dry run only. Re-run with --apply${live ? ' --live and STRIPE_CATALOG_APPLY_LIVE=true' : ''} to create the missing ${live ? 'LIVE' : 'TEST'}-mode Pro price. Existing prices are not changed.`)

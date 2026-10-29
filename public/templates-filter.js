const form=document.querySelector('[data-template-filters]');
const cards=[...document.querySelectorAll('[data-template-grid] [data-template-card]')];
const status=document.querySelector('[data-filter-status]');
if(form&&status){
 const apply=()=>{const values=Object.fromEntries(new FormData(form));let shown=0;for(const card of cards){const visible=['tier','family','density'].every(key=>values[key]==='all'||card.dataset[key]===values[key]);card.hidden=!visible;if(visible)shown++;}status.textContent=`Showing ${shown} of ${cards.length} templates.`;};
 form.addEventListener('change',apply);form.addEventListener('reset',()=>requestAnimationFrame(apply));
}

export type Entry = { id: string; title: string; organization: string; location: string; dates: string; description: string };
export type Section = { id: string; title: string; entries: Entry[] };
export type Resume = { version: 1; name: string; headline: string; email: string; phone: string; location: string; website: string; summary: string; skills: string; profileHeading: string; skillsHeading: string; sections: Section[]; template: 'modern' | 'classic' | 'minimal'; paper: 'A4' | 'Letter'; accent: string; direction: 'ltr' | 'rtl'; language: string };
export const entry = (): Entry => ({ id: crypto.randomUUID(), title: '', organization: '', location: '', dates: '', description: '' });
export const blank = (): Resume => ({version:1,name:'',headline:'',email:'',phone:'',location:'',website:'',summary:'',skills:'',profileHeading:'Profile',skillsHeading:'Skills & languages',sections:[{id:crypto.randomUUID(),title:'Experience',entries:[entry()]},{id:crypto.randomUUID(),title:'Education',entries:[entry()]}],template:'modern',paper:'A4',accent:'#20594a',direction:'ltr',language:'en'});
export const example = (): Resume => ({ ...blank(), name:'Alex Morgan', headline:'Customer Experience Specialist',email:'alex.morgan@example.com',phone:'+44 7700 900123',location:'Manchester, United Kingdom',website:'linkedin.com/in/alex-example',summary:'People-first customer experience specialist with a thoughtful approach to solving problems. Experienced in supporting diverse customers, improving everyday processes, and helping teams deliver a consistently welcoming service.',skills:'Customer support, Team collaboration, Problem solving, CRM systems, English, Spanish',sections:[{id:'experience',title:'Experience',entries:[{id:'role1',title:'Customer Experience Specialist',organization:'Example Company',location:'Manchester, UK',dates:'2022 — Present',description:'Support customers across email, phone, and live chat with clear, empathetic communication.\nPartner with the operations team to simplify common support processes.\nHelp new team members develop product knowledge and confidence.'},{id:'role2',title:'Customer Service Associate',organization:'Sample Retail',location:'Leeds, UK',dates:'2020 — 2022',description:'Helped customers find the right products and resolve order questions.\nMaintained accurate records and coordinated with colleagues during busy periods.'}]},{id:'education',title:'Education',entries:[{id:'degree1',title:'BA Business Management',organization:'Example University',location:'United Kingdom',dates:'2017 — 2020',description:''}]}] });
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const strings = (value: Record<string, unknown>, keys: string[], max = 50000) => keys.every(key => typeof value[key] === 'string' && (value[key] as string).length <= max);
export function migrate(value: unknown): unknown {
 if (object(value)) {
  if (typeof value.profileHeading !== 'string') value.profileHeading = 'Profile';
  if (typeof value.skillsHeading !== 'string') value.skillsHeading = 'Skills & languages';
 }
 return value;
}
export function isResume(value: unknown): value is Resume {
 if (!object(value) || value.version !== 1 || !strings(value,['name','headline','email','phone','location','website','summary','skills','accent','language']) || !strings(value,['profileHeading','skillsHeading'],200)) return false;
 if (!['modern','classic','minimal'].includes(String(value.template)) || !['A4','Letter'].includes(String(value.paper)) || !['ltr','rtl'].includes(String(value.direction)) || !/^#[0-9a-f]{6}$/i.test(String(value.accent)) || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(String(value.language))) return false;
 if (!Array.isArray(value.sections) || value.sections.length > 30) return false;
 const ids = new Set<string>();
 return value.sections.every(section => {
  if (!object(section) || !strings(section,['id','title']) || !Array.isArray(section.entries) || section.entries.length > 100 || ids.has(String(section.id))) return false;
  ids.add(String(section.id));
  return section.entries.every(item => {if (!object(item) || !strings(item,['id','title','organization','location','dates','description']) || ids.has(String(item.id))) return false; ids.add(String(item.id)); return true;});
 });
}
export const storageKey = 'resumebuildr.resume.v1';
export const rescueKey = 'resumebuildr.resume.v1.rescue';

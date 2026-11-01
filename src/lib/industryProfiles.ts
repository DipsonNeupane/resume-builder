/** Optional role starters for people who do not know which job titles to search.
 * Choosing a profile only suggests titles; the user chooses which roles to search. */
export const INDUSTRY_PROFILES = {
  technology: { label: 'Technology', roles: ['Software developer', 'IT support specialist', 'Data analyst', 'Cybersecurity analyst'] },
  healthcare: { label: 'Healthcare', roles: ['Registered nurse', 'Medical assistant', 'Care coordinator', 'Healthcare administrator'] },
  warehouse: { label: 'Warehouse & logistics', roles: ['Warehouse associate', 'Forklift operator', 'Logistics coordinator', 'Delivery driver'] },
  customer_service: { label: 'Customer service', roles: ['Customer service representative', 'Call center agent', 'Customer success specialist', 'Receptionist'] },
  operations: { label: 'Business & operations', roles: ['Administrative assistant', 'Operations coordinator', 'Project coordinator', 'Office manager'] },
  skilled_trades: { label: 'Skilled trades', roles: ['Electrician', 'Plumber', 'HVAC technician', 'Maintenance technician'] },
  construction: { label: 'Construction', roles: ['Construction worker', 'Carpenter', 'Site supervisor', 'Construction project estimator'] },
  education: { label: 'Education', roles: ['Primary school teacher', 'Teaching assistant', 'Tutor', 'School administrator'] },
  hospitality: { label: 'Hospitality & food service', roles: ['Hotel front desk agent', 'Cook', 'Server', 'Housekeeping attendant'] },
  finance: { label: 'Finance & accounting', roles: ['Bookkeeper', 'Accounting assistant', 'Financial analyst', 'Payroll specialist'] },
  sales: { label: 'Sales & retail', roles: ['Retail sales associate', 'Sales representative', 'Store supervisor', 'Merchandiser'] },
  marketing: { label: 'Marketing & creative', roles: ['Graphic designer', 'Marketing coordinator', 'Content writer', 'Social media specialist'] },
  public_service: { label: 'Public & community services', roles: ['Social worker', 'Community support worker', 'Program assistant', 'Public services officer'] },
  manufacturing: { label: 'Manufacturing & production', roles: ['Production operator', 'Quality inspector', 'CNC machinist', 'Production supervisor'] },
  transportation: { label: 'Transportation & supply chain', roles: ['Truck driver', 'Delivery driver', 'Fleet coordinator', 'Supply chain analyst'] },
  science: { label: 'Science & laboratory work', roles: ['Laboratory technician', 'Research assistant', 'Environmental scientist', 'Quality control analyst'] },
  agriculture: { label: 'Agriculture & food production', roles: ['Farm worker', 'Agricultural technician', 'Equipment operator', 'Food production worker'] },
  public_safety: { label: 'Public safety & emergency services', roles: ['Security officer', 'Firefighter', 'Paramedic', 'Emergency dispatcher'] },
} as const;

export type IndustryProfile = keyof typeof INDUSTRY_PROFILES;

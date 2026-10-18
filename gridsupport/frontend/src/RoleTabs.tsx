import {ArrowUpRight} from 'lucide-react';

const roles = [
  {route: 'racer', label: 'Rider'},
  {route: 'shop', label: 'Shopkeeper'},
  {route: 'fan', label: 'Fan'},
] as const;

export default function RoleTabs({active}: {active: string}) {
  return <nav className="dash-tabs" aria-label="GridSupport workspaces">{roles.map(role =>
    <a key={role.route} className={active === role.route ? 'active' : ''} aria-current={active === role.route ? 'page' : undefined}
      href={`/${role.route}`}>{role.label} <ArrowUpRight size={15}/></a>)}</nav>;
}

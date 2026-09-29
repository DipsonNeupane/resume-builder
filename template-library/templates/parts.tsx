/* @jsxRuntime automatic */
// Small, stateless building blocks shared by Premium renderers. No hooks, so every
// template renders identically in the browser and through renderToStaticMarkup.
import type { CSSProperties, ReactNode } from 'react';
import { figures as splitFigures, leadIn, linkify, displayUrl, type Contact, type DocEntry, type Meta, type ResumeDoc, type SkillGroup } from '../document';
import type { PremiumId } from '../registry';

export function Text({ value, figures = false }: { value: string; figures?: boolean }) {
 return <>{linkify(value).map((part, i) => part.href ? <a key={i} href={part.href}>{part.text}</a>
  : figures ? <span key={i}>{splitFigures(part.text).map((f, j) => f.figure ? <strong key={j} className="pt-figure">{f.text}</strong> : f.text)}</span>
  : <span key={i}>{part.text}</span>)}</>;
}

/** A detail line with an optional bold answer-first lead-in (Pyramid). */
export function LeadLine({ value }: { value: string }) {
 const split = leadIn(value);
 return split ? <><strong className="pt-lead">{split.lead}</strong> <Text value={split.rest} /></> : <Text value={value} />;
}

export function Paper({ id, doc, children }: { id: PremiumId; doc: ResumeDoc; children: ReactNode }) {
 return <article className={`pt-paper pt-${id}`} data-template={id} dir={doc.direction} lang={doc.language} style={{ '--pt-accent': doc.accent } as CSSProperties} aria-label="Resume preview">{children}</article>;
}

export function ContactList({ contacts, className = 'pt-contacts', as: Tag = 'ul' }: { contacts: Contact[]; className?: string; as?: 'ul' | 'div' }) {
 if (!contacts.length) return null;
 const Item = Tag === 'ul' ? 'li' : 'span';
 return <Tag className={className}>{contacts.map(c => <Item key={c.kind} className={`pt-contact pt-contact-${c.kind}`}><bdi>{c.href && c.kind !== 'phone' ? <a href={c.href}>{c.text}</a> : c.text}</bdi></Item>)}</Tag>;
}

export function Bullets({ items, className = 'pt-bullets', render }: { items: string[]; className?: string; render?: (line: string) => React.ReactNode }) {
 if (!items.length) return null;
 return <ul className={className}>{items.map((line, i) => <li key={i}>{render ? render(line) : <Text value={line} />}</li>)}</ul>;
}

export function MetaValue({ meta }: { meta: Meta }) {
 return meta.href ? <a href={meta.href}>{meta.key === 'link' ? displayUrl(meta.value) : meta.value}</a> : <Text value={meta.value} />;
}
export function MetaLines({ meta, className }: { meta: Meta[]; className?: string }) {
 if (!meta.length) return null;
 return <dl className={className ? `pt-meta ${className}` : 'pt-meta'}>{meta.map((m, i) => <div key={i} className={`pt-meta-${m.key}`}><dt>{m.label}</dt><dd><MetaValue meta={m} /></dd></div>)}</dl>;
}

export function SkillList({ groups, className = 'pt-skills' }: { groups: SkillGroup[]; className?: string }) {
 // Grouped lines render as label/value rows; ungrouped skills as one inline run.
 const labelled = groups.some(g => g.label);
 if (!labelled) return <p className={`${className} pt-skills-inline`}>{groups.flatMap(g => g.items).map((item, i, all) => <span key={i}>{item}{i < all.length - 1 && <span className="pt-sep"> · </span>}</span>)}</p>;
 return <dl className={`${className} pt-skills-grouped`}>{groups.map((g, i) => <div key={i} className={g.label ? undefined : 'pt-unlabelled'}>{g.label && <dt>{g.label}</dt>}<dd>{g.items.join(', ')}</dd></div>)}</dl>;
}

export const join = (...values: string[]) => values.filter(Boolean).join(' · ');
export const entryHasBody = (e: DocEntry) => e.bullets.length > 0 || e.meta.length > 0;

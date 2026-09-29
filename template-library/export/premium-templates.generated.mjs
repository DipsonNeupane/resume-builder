// src/model.ts
var freeTemplates = [
  { id: "modern", label: "Modern", tagline: "Clean lines with an accent-led header", tier: "free", releasedAt: null },
  { id: "classic", label: "Classic", tagline: "Traditional type with balanced spacing", tier: "free", releasedAt: null },
  { id: "minimal", label: "Minimal", tagline: "Open spacing with quiet section dividers", tier: "free", releasedAt: null },
  { id: "compact", label: "Compact", tagline: "Tighter spacing for information-rich resumes", tier: "free", releasedAt: null },
  { id: "bold", label: "Bold", tagline: "High-contrast header and strong section markers", tier: "free", releasedAt: null },
  { id: "executive", label: "Executive", tagline: "Refined headings with restrained rules", tier: "free", releasedAt: null },
  { id: "ledger", label: "Ledger", tagline: "Structured bands and detailed section labels", tier: "free", releasedAt: null }
];
var premiumTemplates = [
  ["boardroom", "Boardroom", "Employer-grouped progression for senior leadership"],
  ["mandate", "Mandate", "Career overview for board and fractional leadership"],
  ["stackline", "Stackline", "Projects and technical stack first"],
  ["kernel", "Kernel", "Systems-heavy experience with precise structure"],
  ["casebook", "Casebook", "Selected work presented as editorial case studies"],
  ["atelier", "Atelier", "Recognition and client-led creative leadership"],
  ["scholar", "Scholar", "Research-first CV with numbered publications"],
  ["bench", "Bench", "Methods-forward scientific and research work"],
  ["charter", "Charter", "Credentials-first traditional register"],
  ["rounds", "Rounds", "Licensure and clinical setting first"],
  ["meridian", "Meridian", "Modern hierarchy with hanging section rails"],
  ["crossover", "Crossover", "Strengths and skills shown in context"],
  ["almanac", "Almanac", "Dense date-rail layout for long histories"],
  ["roster", "Roster", "Compact organization and outcome rows"],
  ["primer", "Primer", "Education and projects first for early careers"],
  ["pyramid", "Pyramid", "Answer-first consulting accomplishments"],
  ["quartile", "Quartile", "Data results and tools given clear emphasis"],
  ["waypoint", "Waypoint", "Continuous operations timeline"],
  ["cadence", "Cadence", "Product work nested beneath the role that shipped it"],
  ["plainsong", "Plainsong", "Black-only traditional hierarchy without decoration"]
].map(([id, label, tagline]) => ({ id, label, tagline, tier: "premium", releasedAt: null }));
var templates = [...freeTemplates, ...premiumTemplates];
var templateIds = templates.map((t) => t.id);
var premiumTemplateIds = premiumTemplates.map((t) => t.id);
var isExperienceSection = (section) => section.kind === "experience" || section.kind === void 0 && /^(?:work experience|professional experience|experience|work history|employment history)$/i.test(section.title.trim());

// template-library/document.ts
var bulletGlyph = /^[•●▪◦\-–*]\s*/;
var lines = (value) => value.split("\n").map((line) => line.trim()).filter(Boolean);
var roleRules = [
  ["publications", /publication|papers?\b|journal|preprint|patent|bibliograph/i],
  ["presentations", /presentation|talks?\b|conference|invited|lecture|poster/i],
  ["projects", /project|portfolio|selected work|case stud|open[- ]source|work samples?/i],
  ["certifications", /certif|licen[cs]|credential|accredit|admission|registration/i],
  ["awards", /award|honou?r|grant|fellowship|scholarship|prize|recognition|funding/i],
  ["teaching", /teaching|courses? taught|instruction/i],
  ["education", /education|academic background|degrees?|qualification|training|schooling/i],
  ["leadership", /board|advisory|leadership|governance|non-executive|appointments/i],
  ["volunteering", /volunteer|community|service|pro bono|activities|extracurricular/i]
];
function sectionRole(section) {
  if (isExperienceSection(section)) return "experience";
  const rule = roleRules.find(([, pattern]) => pattern.test(section.title));
  if (rule) return rule[0];
  return /experience|employment|career|positions|work history/i.test(section.title) ? "experience" : "other";
}
var metaKeys = {
  stack: "stack",
  "tech stack": "stack",
  tech: "stack",
  technologies: "stack",
  tools: "stack",
  methods: "methods",
  link: "link",
  links: "link",
  url: "link",
  repo: "link",
  repository: "link",
  demo: "link",
  website: "link",
  portfolio: "link",
  doi: "doi",
  authors: "authors",
  "co-authors": "authors",
  role: "role",
  client: "client",
  scope: "scope",
  outcome: "outcome"
};
var metaPattern = /^([A-Za-z][A-Za-z -]{0,18}):\s+(.+)$/;
var tlds = "com|org|net|io|dev|app|co|me|ai|edu|gov|ac|uk|de|fr|ca|au|in|jp|nl|se|no|es|it|ch|info|xyz|page|site|design|tech|us|eu|ly|to|sh|so|studio|pro|health|law|science|academy";
var urlPattern = new RegExp(`\\b(?:https?:\\/\\/[^\\s<>"]+|www\\.[^\\s<>"]+|(?:[a-z0-9-]+\\.)+(?:${tlds})\\/[^\\s<>"]*)`, "gi");
var trailing = /[.,;:!?)\]}'"]+$/;
function safeHref(raw) {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return void 0;
  if (/^doi:/i.test(value) || /^10\.\d{4,9}\//.test(value)) return `https://doi.org/${value.replace(/^doi:\s*/i, "")}`;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return void 0;
    return url.href;
  } catch {
    return void 0;
  }
}
function linkify(text) {
  const out = [];
  let last = 0;
  for (const match of text.matchAll(urlPattern)) {
    let url = match[0];
    const strip = url.match(trailing)?.[0] ?? "";
    if (strip.startsWith(")") && url.includes("(")) url = url.slice(0, url.length - strip.length + 1);
    else url = url.slice(0, url.length - strip.length);
    const start = match.index;
    const bare = !/^(?:https?:\/\/|www\.)/i.test(url);
    const href = bare && /[A-Z]/.test(url.split("/")[0]) ? void 0 : safeHref(url);
    if (!href) continue;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: url, href });
    last = start + url.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
var displayUrl = (value) => value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
function toEntry(item) {
  const bullets = [];
  const meta = [];
  for (const raw of lines(item.description)) {
    const line = raw.replace(bulletGlyph, "");
    const match = line.match(metaPattern);
    const key = match ? metaKeys[match[1].trim().toLowerCase()] : void 0;
    if (match && key) {
      const value = match[2].trim();
      meta.push({ label: match[1].trim(), key, value, href: key === "link" || key === "doi" ? safeHref(key === "doi" && !/^https?:/i.test(value) ? `doi:${value}` : value) : void 0 });
    } else if (line) bullets.push(line);
  }
  return { id: item.id, title: item.title.trim(), organization: item.organization.trim(), location: item.location.trim(), dates: item.dates.trim(), bullets, meta, short: !bullets.length && !meta.length };
}
var hasContent = (e) => Boolean(e.title || e.organization || e.location || e.dates || e.bullets.length || e.meta.length);
function splitList(value) {
  const items = [];
  let depth = 0, current = "";
  for (const char of value) {
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1);
    if (depth === 0 && ",;\u2022\xB7|\u060C".includes(char)) {
      items.push(current);
      current = "";
    } else current += char;
  }
  items.push(current);
  return items.map((item) => item.trim()).filter(Boolean);
}
function parseSkills(value) {
  const groups = [];
  for (const line of lines(value)) {
    const clean = line.replace(bulletGlyph, "");
    const grouped = clean.match(/^([^:,;]{1,40}):\s*(.+)$/);
    const items = splitList(grouped ? grouped[2] : clean);
    if (!items.length) continue;
    const label = grouped ? grouped[1].trim() : null;
    const previous = groups[groups.length - 1];
    if (!label && previous && previous.label === null) previous.items.push(...items);
    else groups.push({ label, items });
  }
  return groups;
}
function toDocument(resume) {
  const summaryLines = lines(resume.summary);
  const summaryIsList = summaryLines.length > 1 && summaryLines.every((line) => bulletGlyph.test(line));
  const website = resume.website.trim();
  const contacts = [];
  if (resume.email.trim()) contacts.push({ kind: "email", text: resume.email.trim(), href: `mailto:${resume.email.trim()}` });
  if (resume.phone.trim()) contacts.push({ kind: "phone", text: resume.phone.trim(), href: `tel:${resume.phone.replace(/[^\d+]/g, "")}` });
  if (resume.location.trim()) contacts.push({ kind: "location", text: resume.location.trim() });
  if (website) {
    const href = safeHref(website);
    contacts.push({ kind: "website", text: href ? displayUrl(website) : website, href });
  }
  const groups = parseSkills(resume.skills);
  return {
    name: resume.name.trim() || "Your name",
    headline: resume.headline.trim(),
    contacts,
    summary: summaryLines.length ? {
      heading: resume.profileHeading || "Profile",
      paragraphs: summaryIsList ? [] : summaryLines,
      bullets: summaryIsList ? summaryLines.map((line) => line.replace(bulletGlyph, "")) : []
    } : null,
    skills: groups.length ? { heading: resume.skillsHeading || "Skills & languages", groups } : null,
    sections: resume.sections.map((section) => ({ id: section.id, title: section.title.trim() || "Untitled section", role: sectionRole(section), entries: section.entries.map(toEntry).filter(hasContent) })).filter((section) => section.entries.length),
    accent: resume.accent,
    direction: resume.direction,
    language: resume.language,
    paper: resume.paper
  };
}
function orderSections(sections, order) {
  const rank = (s) => {
    const i = order.indexOf(s.role);
    return i === -1 ? order.length : i;
  };
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s);
}
function groupByOrganization(entries) {
  const groups = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && entry.organization && last.organization.toLowerCase() === entry.organization.toLowerCase()) last.entries.push(entry);
    else groups.push({ organization: entry.organization, location: entry.location, entries: [entry] });
  }
  return groups;
}
function leadIn(line) {
  const match = line.match(/^(.{2,70}?)(:\s+|\s+[—–]\s+)(.+)$/);
  if (!match || match[1].trim().split(/\s+/).length > 7 || /https?:\/\/|www\./i.test(match[1])) return null;
  return { lead: match[1] + match[2].trimEnd(), rest: match[3] };
}
var figurePattern = /(?:[$£€¥₹]\s?\d[\d,.]*\s?(?:k|K|m|M|bn|B|million|billion)?|\d[\d,.]*\s?(?:%|x\b|×|k\b|K\b|M\b|bn\b|B\b|million\b|billion\b|pp\b|bps\b)|\b\d{1,3}(?:,\d{3})+\b|\b(?!(?:19|20)\d{2}\b)\d{2,}(?:\.\d+)?\b)/g;
function figures(text) {
  const out = [];
  let last = 0;
  for (const match of text.matchAll(figurePattern)) {
    const start = match.index;
    if (start > last) out.push({ text: text.slice(last, start), figure: false });
    out.push({ text: match[0], figure: true });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), figure: false });
  return out;
}
function skillsInEntry(entry, skills) {
  if (!skills) return [];
  const haystack = ` ${[entry.title, entry.organization, ...entry.bullets, ...entry.meta.map((m) => m.value)].join(" ").toLowerCase()} `;
  const seen = /* @__PURE__ */ new Set();
  return skills.flatMap((g) => g.items).filter((item) => {
    const needle = item.toLowerCase().trim();
    if (needle.length < 2 || seen.has(needle)) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(haystack);
    if (found) seen.add(needle);
    return found;
  });
}
function namesEmployer(project, employer) {
  const name = employer.trim().toLowerCase();
  if (name.length < 3) return false;
  const text = `${project.organization} ${project.location}`.toLowerCase();
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

// template-library/templates/parts.tsx
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
function Text({ value, figures: figures2 = false }) {
  return /* @__PURE__ */ jsx(Fragment, { children: linkify(value).map((part, i) => part.href ? /* @__PURE__ */ jsx("a", { href: part.href, children: part.text }, i) : figures2 ? /* @__PURE__ */ jsx("span", { children: figures(part.text).map((f, j) => f.figure ? /* @__PURE__ */ jsx("strong", { className: "pt-figure", children: f.text }, j) : f.text) }, i) : /* @__PURE__ */ jsx("span", { children: part.text }, i)) });
}
function LeadLine({ value }) {
  const split = leadIn(value);
  return split ? /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("strong", { className: "pt-lead", children: split.lead }),
    " ",
    /* @__PURE__ */ jsx(Text, { value: split.rest })
  ] }) : /* @__PURE__ */ jsx(Text, { value });
}
function Paper({ id, doc, children }) {
  return /* @__PURE__ */ jsx("article", { className: `pt-paper pt-${id}`, "data-template": id, dir: doc.direction, lang: doc.language, style: { "--pt-accent": doc.accent }, "aria-label": "Resume preview", children });
}
function ContactList({ contacts, className = "pt-contacts", as: Tag = "ul" }) {
  if (!contacts.length) return null;
  const Item = Tag === "ul" ? "li" : "span";
  return /* @__PURE__ */ jsx(Tag, { className, children: contacts.map((c) => /* @__PURE__ */ jsx(Item, { className: `pt-contact pt-contact-${c.kind}`, children: /* @__PURE__ */ jsx("bdi", { children: c.href && c.kind !== "phone" ? /* @__PURE__ */ jsx("a", { href: c.href, children: c.text }) : c.text }) }, c.kind)) });
}
function Bullets({ items, className = "pt-bullets", render }) {
  if (!items.length) return null;
  return /* @__PURE__ */ jsx("ul", { className, children: items.map((line, i) => /* @__PURE__ */ jsx("li", { children: render ? render(line) : /* @__PURE__ */ jsx(Text, { value: line }) }, i)) });
}
function MetaValue({ meta }) {
  return meta.href ? /* @__PURE__ */ jsx("a", { href: meta.href, children: meta.key === "link" ? displayUrl(meta.value) : meta.value }) : /* @__PURE__ */ jsx(Text, { value: meta.value });
}
function MetaLines({ meta, className }) {
  if (!meta.length) return null;
  return /* @__PURE__ */ jsx("dl", { className: className ? `pt-meta ${className}` : "pt-meta", children: meta.map((m, i) => /* @__PURE__ */ jsxs("div", { className: `pt-meta-${m.key}`, children: [
    /* @__PURE__ */ jsx("dt", { children: m.label }),
    /* @__PURE__ */ jsx("dd", { children: /* @__PURE__ */ jsx(MetaValue, { meta: m }) })
  ] }, i)) });
}
function SkillList({ groups, className = "pt-skills" }) {
  const labelled = groups.some((g) => g.label);
  if (!labelled) return /* @__PURE__ */ jsx("p", { className: `${className} pt-skills-inline`, children: groups.flatMap((g) => g.items).map((item, i, all) => /* @__PURE__ */ jsxs("span", { children: [
    item,
    i < all.length - 1 && /* @__PURE__ */ jsx("span", { className: "pt-sep", children: " \xB7 " })
  ] }, i)) });
  return /* @__PURE__ */ jsx("dl", { className: `${className} pt-skills-grouped`, children: groups.map((g, i) => /* @__PURE__ */ jsxs("div", { className: g.label ? void 0 : "pt-unlabelled", children: [
    g.label && /* @__PURE__ */ jsx("dt", { children: g.label }),
    /* @__PURE__ */ jsx("dd", { children: g.items.join(", ") })
  ] }, i)) });
}
var join = (...values) => values.filter(Boolean).join(" \xB7 ");

// template-library/templates/almanac.tsx
import { Fragment as Fragment2, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function Line({ e }) {
  return /* @__PURE__ */ jsxs2("p", { className: "al-line", children: [
    e.title && /* @__PURE__ */ jsx2("strong", { className: "al-title", children: e.title }),
    e.organization && /* @__PURE__ */ jsxs2(Fragment2, { children: [
      e.title && /* @__PURE__ */ jsx2("span", { className: "al-comma", children: ", " }),
      /* @__PURE__ */ jsx2("span", { className: "al-org", children: /* @__PURE__ */ jsx2(Text, { value: e.organization }) })
    ] }),
    e.location && /* @__PURE__ */ jsxs2("span", { className: "al-loc", children: [
      " \xB7 ",
      /* @__PURE__ */ jsx2(Text, { value: e.location })
    ] })
  ] });
}
function Almanac({ doc }) {
  return /* @__PURE__ */ jsxs2(Paper, { id: "almanac", doc, children: [
    /* @__PURE__ */ jsxs2("header", { className: "al-header", children: [
      /* @__PURE__ */ jsxs2("div", { className: "al-identity", children: [
        /* @__PURE__ */ jsx2("h1", { children: doc.name }),
        doc.headline && /* @__PURE__ */ jsx2("p", { className: "al-headline", children: doc.headline })
      ] }),
      /* @__PURE__ */ jsx2(ContactList, { contacts: doc.contacts, className: "al-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs2("section", { className: "al-section al-summary", children: [
      /* @__PURE__ */ jsx2("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx2(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx2("p", { children: /* @__PURE__ */ jsx2(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs2("section", { className: "al-section al-skills", children: [
      /* @__PURE__ */ jsx2("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx2("p", { children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs2("span", { className: "al-skill-group", children: [
        g.label && /* @__PURE__ */ jsxs2("strong", { children: [
          g.label,
          ": "
        ] }),
        g.items.join(", "),
        i < doc.skills.groups.length - 1 && /* @__PURE__ */ jsx2("span", { className: "al-divider", children: " / " })
      ] }, i)) })
    ] }),
    doc.sections.map((section) => {
      const twoUp = section.entries.length > 1 && section.entries.every((e) => e.short);
      return /* @__PURE__ */ jsxs2("section", { className: "al-section", children: [
        /* @__PURE__ */ jsx2("h2", { children: section.title }),
        twoUp ? /* @__PURE__ */ jsx2("div", { className: "al-two-up", children: section.entries.map((e) => /* @__PURE__ */ jsxs2("div", { className: "al-cell", children: [
          /* @__PURE__ */ jsx2(Line, { e }),
          e.dates && /* @__PURE__ */ jsx2("p", { className: "al-cell-dates", children: e.dates })
        ] }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsxs2("div", { className: "al-entry", children: [
          /* @__PURE__ */ jsx2("p", { className: "al-when", children: e.dates }),
          /* @__PURE__ */ jsxs2("div", { className: "al-body", children: [
            /* @__PURE__ */ jsx2(Line, { e }),
            /* @__PURE__ */ jsx2(Bullets, { items: e.bullets }),
            /* @__PURE__ */ jsx2(MetaLines, { meta: e.meta })
          ] })
        ] }, e.id))
      ] }, section.id);
    })
  ] });
}

// template-library/templates/atelier.tsx
import { Fragment as Fragment3, jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function ClientEntry({ e }) {
  return /* @__PURE__ */ jsxs3("div", { className: "at-entry", children: [
    /* @__PURE__ */ jsxs3("div", { className: "at-head", children: [
      /* @__PURE__ */ jsx3("h3", { children: e.organization ? /* @__PURE__ */ jsx3(Text, { value: e.organization }) : e.title }),
      e.dates && /* @__PURE__ */ jsx3("span", { className: "at-dates", children: e.dates })
    ] }),
    e.organization && e.title && /* @__PURE__ */ jsxs3("p", { className: "at-role", children: [
      e.title,
      e.location && /* @__PURE__ */ jsxs3("span", { className: "at-loc", children: [
        " \u2014 ",
        /* @__PURE__ */ jsx3(Text, { value: e.location })
      ] })
    ] }),
    !e.organization && e.location && /* @__PURE__ */ jsx3("p", { className: "at-role", children: /* @__PURE__ */ jsx3(Text, { value: e.location }) }),
    /* @__PURE__ */ jsx3(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx3(MetaLines, { meta: e.meta })
  ] });
}
function Credit({ e }) {
  return /* @__PURE__ */ jsxs3("li", { className: "at-credit", children: [
    /* @__PURE__ */ jsx3("span", { className: "at-credit-year", children: e.dates }),
    /* @__PURE__ */ jsxs3("span", { className: "at-credit-body", children: [
      /* @__PURE__ */ jsx3("strong", { children: e.title }),
      e.organization && /* @__PURE__ */ jsxs3(Fragment3, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsx3(Text, { value: e.organization })
      ] }),
      e.location && /* @__PURE__ */ jsxs3(Fragment3, { children: [
        " \xB7 ",
        /* @__PURE__ */ jsx3(Text, { value: e.location })
      ] }),
      e.bullets.map((b, i) => /* @__PURE__ */ jsx3("span", { className: "at-credit-note", children: /* @__PURE__ */ jsx3(Text, { value: b }) }, i)),
      /* @__PURE__ */ jsx3(MetaLines, { meta: e.meta })
    ] })
  ] });
}
function Atelier({ doc }) {
  const sections = orderSections(doc.sections, ["awards", "experience", "projects", "education"]);
  return /* @__PURE__ */ jsxs3(Paper, { id: "atelier", doc, children: [
    /* @__PURE__ */ jsxs3("header", { className: "at-header", children: [
      /* @__PURE__ */ jsx3("h1", { children: doc.name }),
      /* @__PURE__ */ jsxs3("div", { className: "at-aside", children: [
        doc.headline && /* @__PURE__ */ jsx3("p", { className: "at-headline", children: doc.headline }),
        /* @__PURE__ */ jsx3(ContactList, { contacts: doc.contacts, className: "at-contacts" })
      ] })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs3("section", { className: "at-section at-profile", children: [
      /* @__PURE__ */ jsx3("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx3(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx3("p", { children: /* @__PURE__ */ jsx3(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs3("section", { className: `at-section at-role-${section.role}`, children: [
      /* @__PURE__ */ jsx3("h2", { children: section.title }),
      section.role === "awards" || section.role === "projects" ? /* @__PURE__ */ jsx3("ul", { className: "at-credits", children: section.entries.map((e) => /* @__PURE__ */ jsx3(Credit, { e }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsx3(ClientEntry, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs3("section", { className: "at-section at-skills", children: [
      /* @__PURE__ */ jsx3("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx3("p", { children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs3("span", { children: [
        g.label && /* @__PURE__ */ jsxs3("strong", { children: [
          g.label,
          " "
        ] }),
        g.items.join(" / "),
        i < doc.skills.groups.length - 1 && /* @__PURE__ */ jsx3("span", { className: "at-divider", children: " \xB7 " })
      ] }, i)) })
    ] })
  ] });
}

// template-library/templates/bench.tsx
import { Fragment as Fragment4, jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function Entry({ e }) {
  const methods = e.meta.filter((m) => m.key === "methods" || m.key === "stack");
  const rest = e.meta.filter((m) => m.key !== "methods" && m.key !== "stack");
  return /* @__PURE__ */ jsxs4("div", { className: "bn-entry", children: [
    /* @__PURE__ */ jsxs4("div", { className: "bn-head", children: [
      /* @__PURE__ */ jsx4("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx4("span", { className: "bn-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx4("p", { className: "bn-org", children: /* @__PURE__ */ jsx4(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx4(Bullets, { items: e.bullets }),
    methods.map((m, i) => /* @__PURE__ */ jsxs4("p", { className: "bn-methods", children: [
      /* @__PURE__ */ jsx4("span", { className: "bn-label", children: m.label }),
      " ",
      /* @__PURE__ */ jsx4(MetaValue, { meta: m })
    ] }, i)),
    /* @__PURE__ */ jsx4(MetaLines, { meta: rest })
  ] });
}
function Citation({ e }) {
  return /* @__PURE__ */ jsxs4("li", { className: "bn-cite", children: [
    /* @__PURE__ */ jsxs4("p", { children: [
      e.title && /* @__PURE__ */ jsxs4("span", { className: "bn-cite-title", children: [
        e.title,
        "."
      ] }),
      e.organization && /* @__PURE__ */ jsxs4(Fragment4, { children: [
        " ",
        /* @__PURE__ */ jsx4("cite", { children: /* @__PURE__ */ jsx4(Text, { value: e.organization }) })
      ] }),
      [e.location, e.dates].filter(Boolean).map((t, i) => /* @__PURE__ */ jsxs4("span", { children: [
        ", ",
        /* @__PURE__ */ jsx4(Text, { value: t })
      ] }, i)),
      "."
    ] }),
    e.bullets.map((b, i) => /* @__PURE__ */ jsx4("p", { className: "bn-cite-note", children: /* @__PURE__ */ jsx4(Text, { value: b }) }, i)),
    /* @__PURE__ */ jsx4(MetaLines, { meta: e.meta })
  ] });
}
function Bench({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "projects", "publications", "presentations", "education", "certifications", "awards"]);
  return /* @__PURE__ */ jsxs4(Paper, { id: "bench", doc, children: [
    /* @__PURE__ */ jsxs4("header", { className: "bn-header", children: [
      /* @__PURE__ */ jsx4("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx4("p", { className: "bn-headline", children: doc.headline }),
      /* @__PURE__ */ jsx4(ContactList, { contacts: doc.contacts, className: "bn-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs4("section", { className: "bn-section", children: [
      /* @__PURE__ */ jsx4("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx4(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx4("p", { children: /* @__PURE__ */ jsx4(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs4("section", { className: "bn-section", children: [
      /* @__PURE__ */ jsx4("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx4("div", { className: "bn-matrix", children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs4("div", { className: "bn-cell", children: [
        g.label && /* @__PURE__ */ jsx4("h3", { children: g.label }),
        /* @__PURE__ */ jsx4("p", { children: g.items.join(" \xB7 ") })
      ] }, i)) })
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs4("section", { className: `bn-section bn-role-${section.role}`, children: [
      /* @__PURE__ */ jsx4("h2", { children: section.title }),
      section.role === "publications" || section.role === "presentations" ? /* @__PURE__ */ jsx4("ol", { className: "bn-cites", children: section.entries.map((e) => /* @__PURE__ */ jsx4(Citation, { e }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsx4(Entry, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/cadence.tsx
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function Shipped({ e }) {
  const outcome = e.meta.filter((m) => m.key === "outcome");
  const rest = e.meta.filter((m) => m.key !== "outcome");
  return /* @__PURE__ */ jsxs5("div", { className: "cd-shipped", children: [
    /* @__PURE__ */ jsxs5("div", { className: "cd-head", children: [
      /* @__PURE__ */ jsx5("h4", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx5("span", { className: "cd-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx5("p", { className: "cd-org", children: /* @__PURE__ */ jsx5(Text, { value: join(e.organization, e.location) }) }),
    outcome.map((m, i) => /* @__PURE__ */ jsxs5("p", { className: "cd-outcome", children: [
      /* @__PURE__ */ jsx5("span", { className: "cd-label", children: m.label }),
      " ",
      /* @__PURE__ */ jsx5(MetaValue, { meta: m })
    ] }, i)),
    /* @__PURE__ */ jsx5(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx5(MetaLines, { meta: rest })
  ] });
}
function Role({ e, shipped, label }) {
  return /* @__PURE__ */ jsxs5("div", { className: "cd-role", children: [
    /* @__PURE__ */ jsxs5("div", { className: "cd-head", children: [
      /* @__PURE__ */ jsx5("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx5("span", { className: "cd-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx5("p", { className: "cd-org", children: /* @__PURE__ */ jsx5(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx5(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx5(MetaLines, { meta: e.meta }),
    shipped.length > 0 && /* @__PURE__ */ jsxs5("div", { className: "cd-nested", children: [
      label && /* @__PURE__ */ jsx5("p", { className: "cd-nested-label", children: label }),
      shipped.map((p) => /* @__PURE__ */ jsx5(Shipped, { e: p }, p.id))
    ] })
  ] });
}
function Cadence({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "projects", "education", "certifications", "awards"]);
  const roles = sections.filter((s) => s.role === "experience").flatMap((s) => s.entries);
  const projects = sections.filter((s) => s.role === "projects").flatMap((s) => s.entries);
  const projectTitle = new Map(sections.filter((s) => s.role === "projects").flatMap((s) => s.entries.map((p) => [p.id, s.title])));
  const home = /* @__PURE__ */ new Map();
  for (const p of projects) {
    const role = roles.find((r) => namesEmployer(p, r.organization));
    if (role) home.set(p.id, role.id);
  }
  const nested = (roleId) => projects.filter((p) => home.get(p.id) === roleId);
  return /* @__PURE__ */ jsxs5(Paper, { id: "cadence", doc, children: [
    /* @__PURE__ */ jsxs5("header", { className: "cd-header", children: [
      /* @__PURE__ */ jsx5("h1", { children: doc.name }),
      /* @__PURE__ */ jsxs5("div", { className: "cd-sub", children: [
        doc.headline && /* @__PURE__ */ jsx5("p", { className: "cd-headline", children: doc.headline }),
        /* @__PURE__ */ jsx5(ContactList, { contacts: doc.contacts, className: "cd-contacts" })
      ] })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs5("section", { className: "cd-section", children: [
      /* @__PURE__ */ jsx5("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx5(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx5("p", { children: /* @__PURE__ */ jsx5(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => {
      if (section.role === "projects") {
        const rest = section.entries.filter((p) => !home.has(p.id));
        return rest.length ? /* @__PURE__ */ jsxs5("section", { className: "cd-section cd-role-projects", children: [
          /* @__PURE__ */ jsx5("h2", { children: section.title }),
          rest.map((p) => /* @__PURE__ */ jsx5(Shipped, { e: p }, p.id))
        ] }, section.id) : null;
      }
      return /* @__PURE__ */ jsxs5("section", { className: `cd-section cd-role-${section.role}`, children: [
        /* @__PURE__ */ jsx5("h2", { children: section.title }),
        section.role === "experience" ? section.entries.map((e) => {
          const shipped = nested(e.id);
          return /* @__PURE__ */ jsx5(Role, { e, shipped, label: shipped[0] && projectTitle.get(shipped[0].id) }, e.id);
        }) : section.entries.map((e) => /* @__PURE__ */ jsx5(Role, { e, shipped: [] }, e.id))
      ] }, section.id);
    }),
    doc.skills && /* @__PURE__ */ jsxs5("section", { className: "cd-section", children: [
      /* @__PURE__ */ jsx5("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx5(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/charter.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function Entry2({ e }) {
  return /* @__PURE__ */ jsxs6("div", { className: "ch-entry", children: [
    /* @__PURE__ */ jsxs6("div", { className: "ch-row", children: [
      /* @__PURE__ */ jsx6("h3", { children: e.organization ? /* @__PURE__ */ jsx6(Text, { value: e.organization }) : e.title }),
      e.location && /* @__PURE__ */ jsx6("span", { className: "ch-loc", children: /* @__PURE__ */ jsx6(Text, { value: e.location }) })
    ] }),
    (e.organization ? e.title : "") || e.dates ? /* @__PURE__ */ jsxs6("div", { className: "ch-row ch-row-sub", children: [
      /* @__PURE__ */ jsx6("p", { className: "ch-title", children: e.organization ? e.title : "" }),
      e.dates && /* @__PURE__ */ jsx6("span", { className: "ch-dates", children: e.dates })
    ] }) : null,
    /* @__PURE__ */ jsx6(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx6(MetaLines, { meta: e.meta })
  ] });
}
function Charter({ doc }) {
  const sections = orderSections(doc.sections, ["certifications", "education", "experience", "publications", "leadership", "awards"]);
  return /* @__PURE__ */ jsxs6(Paper, { id: "charter", doc, children: [
    /* @__PURE__ */ jsxs6("header", { className: "ch-header", children: [
      /* @__PURE__ */ jsx6("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx6("p", { className: "ch-headline", children: doc.headline }),
      /* @__PURE__ */ jsx6(ContactList, { contacts: doc.contacts, className: "ch-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs6("section", { className: "ch-section", children: [
      /* @__PURE__ */ jsx6("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx6(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx6("p", { className: "ch-summary", children: /* @__PURE__ */ jsx6(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs6("section", { className: `ch-section ch-role-${section.role}`, children: [
      /* @__PURE__ */ jsx6("h2", { children: section.title }),
      section.role === "certifications" ? /* @__PURE__ */ jsx6("table", { className: "ch-register", children: /* @__PURE__ */ jsx6("tbody", { children: section.entries.map((e) => /* @__PURE__ */ jsxs6("tr", { children: [
        /* @__PURE__ */ jsx6("th", { scope: "row", children: e.title }),
        /* @__PURE__ */ jsxs6("td", { children: [
          /* @__PURE__ */ jsx6(Text, { value: [e.organization, e.location].filter(Boolean).join(", ") }),
          e.bullets.map((b, i) => /* @__PURE__ */ jsx6("span", { className: "ch-register-note", children: /* @__PURE__ */ jsx6(Text, { value: b }) }, i)),
          /* @__PURE__ */ jsx6(MetaLines, { meta: e.meta })
        ] }),
        /* @__PURE__ */ jsx6("td", { className: "ch-dates", children: e.dates })
      ] }, e.id)) }) }) : section.entries.map((e) => /* @__PURE__ */ jsx6(Entry2, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs6("section", { className: "ch-section", children: [
      /* @__PURE__ */ jsx6("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx6(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/crossover.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function Entry3({ e, skills, label }) {
  const used = skillsInEntry(e, skills);
  return /* @__PURE__ */ jsxs7("div", { className: "cx-entry", children: [
    /* @__PURE__ */ jsxs7("div", { className: "cx-head", children: [
      /* @__PURE__ */ jsx7("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx7("span", { className: "cx-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx7("p", { className: "cx-org", children: /* @__PURE__ */ jsx7(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx7(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx7(MetaLines, { meta: e.meta }),
    used.length > 0 && /* @__PURE__ */ jsxs7("p", { className: "cx-used", children: [
      /* @__PURE__ */ jsx7("span", { className: "cx-used-label", children: label }),
      " ",
      used.join(" \xB7 ")
    ] })
  ] });
}
function Crossover({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "projects", "volunteering", "education", "certifications"]);
  const groups = doc.skills?.groups;
  return /* @__PURE__ */ jsxs7(Paper, { id: "crossover", doc, children: [
    /* @__PURE__ */ jsxs7("header", { className: "cx-header", children: [
      /* @__PURE__ */ jsx7("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx7("p", { className: "cx-headline", children: doc.headline }),
      /* @__PURE__ */ jsx7(ContactList, { contacts: doc.contacts, className: "cx-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs7("section", { className: "cx-section cx-summary", children: [
      /* @__PURE__ */ jsx7("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx7(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx7("p", { children: /* @__PURE__ */ jsx7(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs7("section", { className: "cx-section cx-strengths", children: [
      /* @__PURE__ */ jsx7("h2", { children: doc.skills.heading }),
      doc.skills.groups.some((g) => g.label) ? /* @__PURE__ */ jsx7("div", { className: "cx-grid", children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs7("div", { className: "cx-cell", children: [
        g.label && /* @__PURE__ */ jsx7("h3", { children: g.label }),
        /* @__PURE__ */ jsx7("p", { children: g.items.join(", ") })
      ] }, i)) }) : /* @__PURE__ */ jsx7("ul", { className: "cx-grid cx-grid-items", children: doc.skills.groups.flatMap((g) => g.items).map((item, i) => /* @__PURE__ */ jsx7("li", { children: item }, i)) })
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs7("section", { className: "cx-section", children: [
      /* @__PURE__ */ jsx7("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx7(Entry3, { e, skills: section.role === "experience" || section.role === "projects" || section.role === "volunteering" ? groups : void 0, label: doc.skills?.heading ?? "" }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/kernel.tsx
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function Entry4({ e }) {
  const stack = e.meta.filter((m) => m.key === "stack" || m.key === "methods");
  const other = e.meta.filter((m) => m.key !== "stack" && m.key !== "methods");
  return /* @__PURE__ */ jsxs8("div", { className: "kn-entry", children: [
    /* @__PURE__ */ jsxs8("div", { className: "kn-main", children: [
      /* @__PURE__ */ jsx8("h3", { children: e.title }),
      (e.organization || e.location) && /* @__PURE__ */ jsxs8("p", { className: "kn-org", children: [
        e.organization && /* @__PURE__ */ jsx8(Text, { value: e.organization }),
        e.organization && e.location && /* @__PURE__ */ jsx8("span", { className: "kn-sep", children: " / " }),
        e.location && /* @__PURE__ */ jsx8("span", { className: "kn-loc", children: /* @__PURE__ */ jsx8(Text, { value: e.location }) })
      ] }),
      stack.length > 0 && /* @__PURE__ */ jsx8("p", { className: "kn-stack", children: stack.flatMap((m) => m.value.split(/\s*,\s*/)).filter(Boolean).map((item, i) => /* @__PURE__ */ jsx8("code", { children: item }, i)) }),
      /* @__PURE__ */ jsx8(Bullets, { items: e.bullets }),
      other.length > 0 && /* @__PURE__ */ jsx8("p", { className: "kn-meta", children: other.map((m, i) => /* @__PURE__ */ jsxs8("span", { children: [
        /* @__PURE__ */ jsx8("span", { className: "kn-meta-label", children: m.label }),
        " ",
        /* @__PURE__ */ jsx8(MetaValue, { meta: m })
      ] }, i)) })
    ] }),
    /* @__PURE__ */ jsx8("p", { className: "kn-when", children: e.dates })
  ] });
}
function Kernel({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "projects", "education", "certifications", "publications", "awards"]);
  const groups = doc.skills?.groups ?? [];
  return /* @__PURE__ */ jsxs8(Paper, { id: "kernel", doc, children: [
    /* @__PURE__ */ jsxs8("header", { className: "kn-header", children: [
      /* @__PURE__ */ jsxs8("div", { children: [
        /* @__PURE__ */ jsx8("h1", { children: doc.name }),
        doc.headline && /* @__PURE__ */ jsx8("p", { className: "kn-headline", children: doc.headline })
      ] }),
      /* @__PURE__ */ jsx8(ContactList, { contacts: doc.contacts, className: "kn-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs8("section", { className: "kn-section", children: [
      /* @__PURE__ */ jsx8("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx8(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx8("p", { className: "kn-summary", children: /* @__PURE__ */ jsx8(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs8("section", { className: "kn-section", children: [
      /* @__PURE__ */ jsx8("h2", { children: doc.skills.heading }),
      groups.some((g) => g.label) ? /* @__PURE__ */ jsx8("dl", { className: "kn-matrix", children: groups.map((g, i) => /* @__PURE__ */ jsxs8("div", { children: [
        g.label && /* @__PURE__ */ jsx8("dt", { children: g.label }),
        /* @__PURE__ */ jsx8("dd", { children: g.items.join(", ") })
      ] }, i)) }) : /* @__PURE__ */ jsx8("ul", { className: "kn-matrix-list", children: groups.flatMap((g) => g.items).map((item, i) => /* @__PURE__ */ jsx8("li", { children: item }, i)) })
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs8("section", { className: `kn-section kn-role-${section.role}`, children: [
      /* @__PURE__ */ jsx8("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx8(Entry4, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/mandate.tsx
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function Detail({ e }) {
  return /* @__PURE__ */ jsxs9("div", { className: "md-entry", children: [
    /* @__PURE__ */ jsxs9("div", { className: "md-head", children: [
      /* @__PURE__ */ jsxs9("h3", { children: [
        e.title,
        e.organization && /* @__PURE__ */ jsxs9("span", { className: "md-org", children: [
          " ",
          /* @__PURE__ */ jsx9(Text, { value: e.organization })
        ] })
      ] }),
      e.dates && /* @__PURE__ */ jsx9("span", { className: "md-dates", children: e.dates })
    ] }),
    e.location && /* @__PURE__ */ jsx9("p", { className: "md-where", children: /* @__PURE__ */ jsx9(Text, { value: e.location }) }),
    /* @__PURE__ */ jsx9(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx9(MetaLines, { meta: e.meta })
  ] });
}
function Overview({ entries }) {
  return /* @__PURE__ */ jsx9("table", { className: "md-overview", "aria-label": "Career overview", children: /* @__PURE__ */ jsx9("tbody", { children: entries.map((e) => /* @__PURE__ */ jsxs9("tr", { children: [
    /* @__PURE__ */ jsx9("td", { className: "md-ov-dates", children: e.dates }),
    /* @__PURE__ */ jsx9("td", { className: "md-ov-role", children: e.title }),
    /* @__PURE__ */ jsx9("td", { className: "md-ov-org", children: /* @__PURE__ */ jsx9(Text, { value: e.organization }) })
  ] }, e.id)) }) });
}
function Appointments({ section }) {
  return /* @__PURE__ */ jsxs9("section", { className: "md-section md-appointments", children: [
    /* @__PURE__ */ jsx9("h2", { children: section.title }),
    /* @__PURE__ */ jsx9("ul", { children: section.entries.map((e) => /* @__PURE__ */ jsxs9("li", { children: [
      /* @__PURE__ */ jsxs9("div", { className: "md-appt", children: [
        /* @__PURE__ */ jsx9("span", { className: "md-appt-role", children: e.title }),
        e.organization && /* @__PURE__ */ jsx9("span", { className: "md-appt-org", children: /* @__PURE__ */ jsx9(Text, { value: e.organization }) }),
        e.dates && /* @__PURE__ */ jsx9("span", { className: "md-appt-dates", children: e.dates })
      ] }),
      e.location && /* @__PURE__ */ jsx9("p", { className: "md-where", children: /* @__PURE__ */ jsx9(Text, { value: e.location }) }),
      /* @__PURE__ */ jsx9(Bullets, { items: e.bullets }),
      /* @__PURE__ */ jsx9(MetaLines, { meta: e.meta })
    ] }, e.id)) })
  ] });
}
function Mandate({ doc }) {
  const sections = orderSections(doc.sections, ["leadership", "experience", "education", "certifications", "awards"]);
  const roles = doc.sections.filter((s) => s.role === "experience").flatMap((s) => s.entries);
  return /* @__PURE__ */ jsxs9(Paper, { id: "mandate", doc, children: [
    /* @__PURE__ */ jsxs9("header", { className: "md-header", children: [
      /* @__PURE__ */ jsx9("h1", { children: doc.name }),
      /* @__PURE__ */ jsxs9("div", { className: "md-masthead", children: [
        doc.headline && /* @__PURE__ */ jsx9("p", { className: "md-headline", children: doc.headline }),
        /* @__PURE__ */ jsx9(ContactList, { contacts: doc.contacts, className: "md-contacts" })
      ] })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs9("section", { className: "md-section md-summary", children: [
      /* @__PURE__ */ jsx9("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx9(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx9("p", { children: /* @__PURE__ */ jsx9(Text, { value: p }) }, i))
    ] }),
    roles.length > 1 && /* @__PURE__ */ jsx9(Overview, { entries: roles }),
    sections.map((section) => section.role === "leadership" ? /* @__PURE__ */ jsx9(Appointments, { section }, section.id) : /* @__PURE__ */ jsxs9("section", { className: `md-section md-role-${section.role}`, children: [
      /* @__PURE__ */ jsx9("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx9(Detail, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs9("section", { className: "md-section", children: [
      /* @__PURE__ */ jsx9("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx9(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/plainsong.tsx
import { Fragment as Fragment5, jsx as jsx10, jsxs as jsxs10 } from "react/jsx-runtime";
function Entry5({ e }) {
  return /* @__PURE__ */ jsxs10("div", { className: "ps-entry", children: [
    /* @__PURE__ */ jsxs10("p", { className: "ps-line", children: [
      /* @__PURE__ */ jsx10("strong", { children: e.title }),
      e.organization && /* @__PURE__ */ jsxs10(Fragment5, { children: [
        e.title && ", ",
        /* @__PURE__ */ jsx10(Text, { value: e.organization })
      ] }),
      e.location && /* @__PURE__ */ jsxs10("span", { className: "ps-loc", children: [
        ", ",
        /* @__PURE__ */ jsx10(Text, { value: e.location })
      ] }),
      e.dates && /* @__PURE__ */ jsxs10("span", { className: "ps-dates", children: [
        " ",
        e.dates
      ] })
    ] }),
    /* @__PURE__ */ jsx10(Bullets, { items: e.bullets, className: "ps-list" }),
    /* @__PURE__ */ jsx10(MetaLines, { meta: e.meta })
  ] });
}
function Plainsong({ doc }) {
  return /* @__PURE__ */ jsxs10(Paper, { id: "plainsong", doc, children: [
    /* @__PURE__ */ jsxs10("header", { className: "ps-header", children: [
      /* @__PURE__ */ jsx10("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx10("p", { className: "ps-headline", children: doc.headline }),
      /* @__PURE__ */ jsx10(ContactList, { contacts: doc.contacts, className: "ps-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs10("section", { className: "ps-section", children: [
      /* @__PURE__ */ jsx10("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx10(Bullets, { items: doc.summary.bullets, className: "ps-list" }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx10("p", { children: /* @__PURE__ */ jsx10(Text, { value: p }) }, i))
    ] }),
    doc.sections.map((section) => /* @__PURE__ */ jsxs10("section", { className: "ps-section", children: [
      /* @__PURE__ */ jsx10("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx10(Entry5, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs10("section", { className: "ps-section", children: [
      /* @__PURE__ */ jsx10("h2", { children: doc.skills.heading }),
      doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs10("p", { children: [
        g.label && /* @__PURE__ */ jsxs10("strong", { children: [
          g.label,
          ": "
        ] }),
        g.items.join(", ")
      ] }, i))
    ] })
  ] });
}

// template-library/templates/primer.tsx
import { jsx as jsx11, jsxs as jsxs11 } from "react/jsx-runtime";
function Entry6({ e }) {
  return /* @__PURE__ */ jsxs11("div", { className: "pr-entry", children: [
    /* @__PURE__ */ jsxs11("div", { className: "pr-head", children: [
      /* @__PURE__ */ jsx11("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx11("span", { className: "pr-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx11("p", { className: "pr-org", children: /* @__PURE__ */ jsx11(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx11(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx11(MetaLines, { meta: e.meta })
  ] });
}
function Primer({ doc }) {
  const sections = orderSections(doc.sections, ["education", "projects", "experience", "volunteering", "leadership", "awards", "certifications"]);
  return /* @__PURE__ */ jsxs11(Paper, { id: "primer", doc, children: [
    /* @__PURE__ */ jsxs11("header", { className: "pr-header", children: [
      /* @__PURE__ */ jsx11("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx11("p", { className: "pr-headline", children: doc.headline }),
      /* @__PURE__ */ jsx11(ContactList, { contacts: doc.contacts, className: "pr-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs11("section", { className: "pr-section pr-summary", children: [
      /* @__PURE__ */ jsx11("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx11(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx11("p", { children: /* @__PURE__ */ jsx11(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs11("section", { className: `pr-section pr-role-${section.role}`, children: [
      /* @__PURE__ */ jsx11("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx11(Entry6, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs11("section", { className: "pr-section pr-skills", children: [
      /* @__PURE__ */ jsx11("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx11("ul", { className: "pr-skill-list", children: doc.skills.groups.flatMap((g) => g.label ? [`${g.label}: ${g.items.join(", ")}`] : g.items).map((item, i) => /* @__PURE__ */ jsx11("li", { children: item }, i)) })
    ] })
  ] });
}

// template-library/templates/pyramid.tsx
import { jsx as jsx12, jsxs as jsxs12 } from "react/jsx-runtime";
function Entry7({ e }) {
  const first = e.organization || e.title;
  const second = e.organization ? e.title : "";
  return /* @__PURE__ */ jsxs12("div", { className: "py-entry", children: [
    /* @__PURE__ */ jsxs12("div", { className: "py-row", children: [
      /* @__PURE__ */ jsx12("h3", { children: /* @__PURE__ */ jsx12(Text, { value: first }) }),
      e.location && /* @__PURE__ */ jsx12("span", { className: "py-loc", children: /* @__PURE__ */ jsx12(Text, { value: e.location }) })
    ] }),
    (second || e.dates) && /* @__PURE__ */ jsxs12("div", { className: "py-row py-row-sub", children: [
      /* @__PURE__ */ jsx12("p", { className: "py-title", children: second }),
      e.dates && /* @__PURE__ */ jsx12("span", { className: "py-dates", children: e.dates })
    ] }),
    /* @__PURE__ */ jsx12(Bullets, { items: e.bullets, render: (line) => /* @__PURE__ */ jsx12(LeadLine, { value: line }) }),
    /* @__PURE__ */ jsx12(MetaLines, { meta: e.meta })
  ] });
}
function Pyramid({ doc }) {
  const sections = orderSections(doc.sections, ["education", "experience", "leadership", "projects", "volunteering", "awards", "certifications"]);
  return /* @__PURE__ */ jsxs12(Paper, { id: "pyramid", doc, children: [
    /* @__PURE__ */ jsxs12("header", { className: "py-header", children: [
      /* @__PURE__ */ jsx12("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx12("p", { className: "py-headline", children: doc.headline }),
      /* @__PURE__ */ jsx12(ContactList, { contacts: doc.contacts, className: "py-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs12("section", { className: "py-section", children: [
      /* @__PURE__ */ jsx12("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx12(Bullets, { items: doc.summary.bullets, render: (line) => /* @__PURE__ */ jsx12(LeadLine, { value: line }) }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx12("p", { children: /* @__PURE__ */ jsx12(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs12("section", { className: "py-section", children: [
      /* @__PURE__ */ jsx12("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx12(Entry7, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs12("section", { className: "py-section py-additional", children: [
      /* @__PURE__ */ jsx12("h2", { children: doc.skills.heading }),
      doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs12("p", { children: [
        g.label && /* @__PURE__ */ jsxs12("strong", { children: [
          g.label,
          ": "
        ] }),
        g.items.join("; ")
      ] }, i))
    ] })
  ] });
}

// template-library/templates/quartile.tsx
import { jsx as jsx13, jsxs as jsxs13 } from "react/jsx-runtime";
function Entry8({ e }) {
  return /* @__PURE__ */ jsxs13("div", { className: "qt-entry", children: [
    /* @__PURE__ */ jsxs13("div", { className: "qt-head", children: [
      /* @__PURE__ */ jsx13("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx13("span", { className: "qt-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx13("p", { className: "qt-org", children: /* @__PURE__ */ jsx13(Text, { value: join(e.organization, e.location) }) }),
    e.bullets.length > 0 && /* @__PURE__ */ jsx13("ul", { className: "pt-bullets", children: e.bullets.map((b, i) => /* @__PURE__ */ jsx13("li", { children: /* @__PURE__ */ jsx13(Text, { value: b, figures: true }) }, i)) }),
    e.meta.length > 0 && /* @__PURE__ */ jsx13("p", { className: "qt-meta", children: e.meta.map((m, i) => /* @__PURE__ */ jsxs13("span", { children: [
      /* @__PURE__ */ jsx13("span", { className: "qt-meta-label", children: m.label }),
      " ",
      /* @__PURE__ */ jsx13(MetaValue, { meta: m })
    ] }, i)) })
  ] });
}
function Quartile({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "projects", "publications", "education", "certifications", "awards"]);
  return /* @__PURE__ */ jsxs13(Paper, { id: "quartile", doc, children: [
    /* @__PURE__ */ jsxs13("header", { className: "qt-header", children: [
      /* @__PURE__ */ jsx13("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx13("p", { className: "qt-headline", children: doc.headline }),
      /* @__PURE__ */ jsx13(ContactList, { contacts: doc.contacts, className: "qt-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs13("section", { className: "qt-section", children: [
      /* @__PURE__ */ jsx13("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx13("ul", { className: "pt-bullets", children: doc.summary.bullets.map((b, i) => /* @__PURE__ */ jsx13("li", { children: /* @__PURE__ */ jsx13(Text, { value: b, figures: true }) }, i)) }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx13("p", { children: /* @__PURE__ */ jsx13(Text, { value: p, figures: true }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs13("section", { className: "qt-section", children: [
      /* @__PURE__ */ jsx13("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx13("table", { className: "qt-tools", children: /* @__PURE__ */ jsx13("tbody", { children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs13("tr", { children: [
        g.label ? /* @__PURE__ */ jsx13("th", { scope: "row", children: g.label }) : /* @__PURE__ */ jsx13("td", { className: "qt-nolabel" }),
        /* @__PURE__ */ jsx13("td", { children: g.items.map((item, j) => /* @__PURE__ */ jsxs13("span", { className: "qt-tool", children: [
          item,
          j < g.items.length - 1 && ", "
        ] }, j)) })
      ] }, i)) }) })
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs13("section", { className: `qt-section qt-role-${section.role}`, children: [
      /* @__PURE__ */ jsx13("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx13(Entry8, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/roster.tsx
import { jsx as jsx14, jsxs as jsxs14 } from "react/jsx-runtime";
function Row({ e }) {
  const oneLine = e.bullets.length <= 1 && !e.meta.length;
  return /* @__PURE__ */ jsxs14("div", { className: `ro-row${oneLine ? " ro-row-short" : ""}`, children: [
    /* @__PURE__ */ jsx14("p", { className: "ro-org", children: e.organization ? /* @__PURE__ */ jsx14(Text, { value: e.organization }) : /* @__PURE__ */ jsx14(Text, { value: e.location }) }),
    /* @__PURE__ */ jsxs14("p", { className: "ro-role", children: [
      e.title,
      e.organization && e.location && /* @__PURE__ */ jsxs14("span", { className: "ro-loc", children: [
        " \xB7 ",
        /* @__PURE__ */ jsx14(Text, { value: e.location })
      ] })
    ] }),
    /* @__PURE__ */ jsx14("p", { className: "ro-dates", children: e.dates }),
    oneLine ? e.bullets.map((b, i) => /* @__PURE__ */ jsx14("p", { className: "ro-outcome", children: /* @__PURE__ */ jsx14(Text, { value: b }) }, i)) : /* @__PURE__ */ jsxs14("div", { className: "ro-detail", children: [
      /* @__PURE__ */ jsx14(Bullets, { items: e.bullets }),
      /* @__PURE__ */ jsx14(MetaLines, { meta: e.meta })
    ] })
  ] });
}
function Roster({ doc }) {
  return /* @__PURE__ */ jsxs14(Paper, { id: "roster", doc, children: [
    /* @__PURE__ */ jsxs14("header", { className: "ro-header", children: [
      /* @__PURE__ */ jsx14("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx14("p", { className: "ro-headline", children: doc.headline }),
      /* @__PURE__ */ jsx14(ContactList, { contacts: doc.contacts, className: "ro-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs14("section", { className: "ro-section", children: [
      /* @__PURE__ */ jsx14("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx14(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx14("p", { children: /* @__PURE__ */ jsx14(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs14("section", { className: "ro-section ro-skills", children: [
      /* @__PURE__ */ jsx14("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx14("p", { children: doc.skills.groups.map((g, i) => /* @__PURE__ */ jsxs14("span", { children: [
        g.label && /* @__PURE__ */ jsxs14("strong", { children: [
          g.label,
          ": "
        ] }),
        g.items.join(", "),
        i < doc.skills.groups.length - 1 ? "; " : ""
      ] }, i)) })
    ] }),
    doc.sections.map((section) => /* @__PURE__ */ jsxs14("section", { className: "ro-section", children: [
      /* @__PURE__ */ jsx14("h2", { children: section.title }),
      /* @__PURE__ */ jsx14("div", { className: "ro-table", children: section.entries.map((e) => /* @__PURE__ */ jsx14(Row, { e }, e.id)) })
    ] }, section.id))
  ] });
}

// template-library/templates/rounds.tsx
import { jsx as jsx15, jsxs as jsxs15 } from "react/jsx-runtime";
function Entry9({ e }) {
  return /* @__PURE__ */ jsxs15("div", { className: "rd-entry", children: [
    /* @__PURE__ */ jsxs15("div", { className: "rd-head", children: [
      /* @__PURE__ */ jsx15("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx15("span", { className: "rd-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsxs15("p", { className: "rd-setting", children: [
      e.organization && /* @__PURE__ */ jsx15("span", { className: "rd-org", children: /* @__PURE__ */ jsx15(Text, { value: e.organization }) }),
      e.organization && e.location && /* @__PURE__ */ jsx15("span", { className: "rd-sep", children: " \xB7 " }),
      e.location && /* @__PURE__ */ jsx15("span", { className: "rd-unit", children: /* @__PURE__ */ jsx15(Text, { value: e.location }) })
    ] }),
    /* @__PURE__ */ jsx15(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx15(MetaLines, { meta: e.meta })
  ] });
}
function Credentials({ section }) {
  return /* @__PURE__ */ jsxs15("section", { className: "rd-section rd-credentials", children: [
    /* @__PURE__ */ jsx15("h2", { children: section.title }),
    /* @__PURE__ */ jsx15("table", { className: "rd-table", children: /* @__PURE__ */ jsx15("tbody", { children: section.entries.map((e) => /* @__PURE__ */ jsxs15("tr", { children: [
      /* @__PURE__ */ jsx15("th", { scope: "row", children: e.title }),
      /* @__PURE__ */ jsxs15("td", { children: [
        /* @__PURE__ */ jsx15(Text, { value: [e.organization, e.location].filter(Boolean).join(" \xB7 ") }),
        e.bullets.map((b, i) => /* @__PURE__ */ jsx15("span", { className: "rd-note", children: /* @__PURE__ */ jsx15(Text, { value: b }) }, i)),
        /* @__PURE__ */ jsx15(MetaLines, { meta: e.meta })
      ] }),
      /* @__PURE__ */ jsx15("td", { className: "rd-dates", children: e.dates })
    ] }, e.id)) }) })
  ] });
}
function Rounds({ doc }) {
  const sections = orderSections(doc.sections, ["certifications", "experience", "education"]);
  return /* @__PURE__ */ jsxs15(Paper, { id: "rounds", doc, children: [
    /* @__PURE__ */ jsxs15("header", { className: "rd-header", children: [
      /* @__PURE__ */ jsx15("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx15("p", { className: "rd-headline", children: doc.headline }),
      /* @__PURE__ */ jsx15(ContactList, { contacts: doc.contacts, className: "rd-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs15("section", { className: "rd-section rd-summary", children: [
      /* @__PURE__ */ jsx15("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx15(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx15("p", { children: /* @__PURE__ */ jsx15(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => section.role === "certifications" ? /* @__PURE__ */ jsx15(Credentials, { section }, section.id) : /* @__PURE__ */ jsxs15("section", { className: `rd-section rd-role-${section.role}`, children: [
      /* @__PURE__ */ jsx15("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx15(Entry9, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs15("section", { className: "rd-section rd-skills", children: [
      /* @__PURE__ */ jsx15("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx15(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/waypoint.tsx
import { jsx as jsx16, jsxs as jsxs16 } from "react/jsx-runtime";
function Stop({ e }) {
  const scope = e.meta.filter((m) => m.key === "scope");
  const rest = e.meta.filter((m) => m.key !== "scope");
  return /* @__PURE__ */ jsxs16("div", { className: "wp-stop", children: [
    (e.dates || e.location) && /* @__PURE__ */ jsxs16("p", { className: "wp-when", children: [
      e.dates,
      e.dates && e.location && /* @__PURE__ */ jsx16("span", { className: "wp-sep", children: " \xB7 " }),
      e.location && /* @__PURE__ */ jsx16(Text, { value: e.location })
    ] }),
    /* @__PURE__ */ jsxs16("h3", { children: [
      e.title,
      e.organization && /* @__PURE__ */ jsxs16("span", { className: "wp-org", children: [
        ", ",
        /* @__PURE__ */ jsx16(Text, { value: e.organization })
      ] })
    ] }),
    scope.map((m, i) => /* @__PURE__ */ jsxs16("p", { className: "wp-scope", children: [
      /* @__PURE__ */ jsx16("span", { className: "wp-label", children: m.label }),
      " ",
      /* @__PURE__ */ jsx16(MetaValue, { meta: m })
    ] }, i)),
    /* @__PURE__ */ jsx16(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx16(MetaLines, { meta: rest })
  ] });
}
function Entry10({ e }) {
  return /* @__PURE__ */ jsxs16("div", { className: "wp-entry", children: [
    /* @__PURE__ */ jsxs16("div", { className: "wp-head", children: [
      /* @__PURE__ */ jsx16("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx16("span", { className: "wp-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx16("p", { className: "wp-org-line", children: /* @__PURE__ */ jsx16(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx16(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx16(MetaLines, { meta: e.meta })
  ] });
}
function Waypoint({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "leadership", "certifications", "education", "projects"]);
  return /* @__PURE__ */ jsxs16(Paper, { id: "waypoint", doc, children: [
    /* @__PURE__ */ jsxs16("header", { className: "wp-header", children: [
      /* @__PURE__ */ jsx16("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx16("p", { className: "wp-headline", children: doc.headline }),
      /* @__PURE__ */ jsx16(ContactList, { contacts: doc.contacts, className: "wp-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs16("section", { className: "wp-section", children: [
      /* @__PURE__ */ jsx16("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx16(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx16("p", { children: /* @__PURE__ */ jsx16(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs16("section", { className: `wp-section wp-role-${section.role}`, children: [
      /* @__PURE__ */ jsx16("h2", { children: section.title }),
      section.role === "experience" ? /* @__PURE__ */ jsx16("div", { className: "wp-timeline", children: section.entries.map((e) => /* @__PURE__ */ jsx16(Stop, { e }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsx16(Entry10, { e }, e.id))
    ] }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs16("section", { className: "wp-section", children: [
      /* @__PURE__ */ jsx16("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx16(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/boardroom.tsx
import { jsx as jsx17, jsxs as jsxs17 } from "react/jsx-runtime";
function Experience({ section }) {
  return /* @__PURE__ */ jsxs17("section", { className: "br-section br-experience", children: [
    /* @__PURE__ */ jsx17("h2", { className: "br-label", children: section.title }),
    groupByOrganization(section.entries).map((group, g) => {
      const sharedLocation = group.entries.every((e) => e.location === group.entries[0].location);
      return /* @__PURE__ */ jsxs17("div", { className: "br-employer", children: [
        group.organization && /* @__PURE__ */ jsxs17("div", { className: "br-employer-head", children: [
          /* @__PURE__ */ jsx17("h3", { children: group.organization }),
          sharedLocation && group.location && /* @__PURE__ */ jsx17("span", { children: group.location })
        ] }),
        group.entries.map((e) => /* @__PURE__ */ jsxs17("div", { className: "br-role", children: [
          /* @__PURE__ */ jsxs17("div", { className: "br-role-head", children: [
            /* @__PURE__ */ jsx17("h4", { children: e.title }),
            e.dates && /* @__PURE__ */ jsx17("span", { className: "br-dates", children: e.dates })
          ] }),
          (!sharedLocation || !group.organization) && e.location && /* @__PURE__ */ jsx17("p", { className: "br-where", children: e.location }),
          /* @__PURE__ */ jsx17(Bullets, { items: e.bullets }),
          /* @__PURE__ */ jsx17(MetaLines, { meta: e.meta })
        ] }, e.id))
      ] }, g);
    })
  ] });
}
function Entry11({ e }) {
  return /* @__PURE__ */ jsxs17("div", { className: "br-entry", children: [
    /* @__PURE__ */ jsxs17("div", { className: "br-role-head", children: [
      /* @__PURE__ */ jsx17("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx17("span", { className: "br-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx17("p", { className: "br-where", children: join(e.organization, e.location) }),
    /* @__PURE__ */ jsx17(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx17(MetaLines, { meta: e.meta })
  ] });
}
function Boardroom({ doc }) {
  const sections = orderSections(doc.sections, ["experience", "leadership", "education", "certifications", "awards"]);
  const labelled = doc.skills?.groups.some((g) => g.label);
  return /* @__PURE__ */ jsxs17(Paper, { id: "boardroom", doc, children: [
    /* @__PURE__ */ jsxs17("header", { className: "br-header", children: [
      /* @__PURE__ */ jsxs17("div", { className: "br-identity", children: [
        /* @__PURE__ */ jsx17("h1", { children: doc.name }),
        doc.headline && /* @__PURE__ */ jsx17("p", { className: "br-headline", children: doc.headline })
      ] }),
      /* @__PURE__ */ jsx17(ContactList, { contacts: doc.contacts, className: "br-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs17("section", { className: "br-section br-summary", children: [
      /* @__PURE__ */ jsx17("h2", { className: "br-label", children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx17("ol", { className: "br-highlights", children: doc.summary.bullets.map((line, i) => /* @__PURE__ */ jsx17("li", { children: /* @__PURE__ */ jsx17(Text, { value: line }) }, i)) }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx17("p", { className: "br-lede", children: /* @__PURE__ */ jsx17(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs17("section", { className: "br-section br-expertise", children: [
      /* @__PURE__ */ jsx17("h2", { className: "br-label", children: doc.skills.heading }),
      labelled ? /* @__PURE__ */ jsx17(SkillList, { groups: doc.skills.groups }) : /* @__PURE__ */ jsx17("ul", { className: "br-expertise-grid", children: doc.skills.groups.flatMap((g) => g.items).map((item, i) => /* @__PURE__ */ jsx17("li", { children: item }, i)) })
    ] }),
    sections.map((section) => section.role === "experience" ? /* @__PURE__ */ jsx17(Experience, { section }, section.id) : /* @__PURE__ */ jsxs17("section", { className: "br-section", children: [
      /* @__PURE__ */ jsx17("h2", { className: "br-label", children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx17(Entry11, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/casebook.tsx
import { jsx as jsx18, jsxs as jsxs18 } from "react/jsx-runtime";
function Card({ e, index }) {
  const links = e.meta.filter((m) => m.key === "link" && m.href);
  const rest = e.meta.filter((m) => !(m.key === "link" && m.href));
  return /* @__PURE__ */ jsxs18("div", { className: "cb-card", children: [
    /* @__PURE__ */ jsx18("span", { className: "cb-index", children: String(index + 1).padStart(2, "0") }),
    /* @__PURE__ */ jsx18("h3", { children: e.title }),
    (e.organization || e.location || e.dates) && /* @__PURE__ */ jsx18("p", { className: "cb-for", children: /* @__PURE__ */ jsx18(Text, { value: join(e.organization, e.location, e.dates) }) }),
    /* @__PURE__ */ jsx18(Bullets, { items: e.bullets, className: "cb-notes" }),
    /* @__PURE__ */ jsx18(MetaLines, { meta: rest }),
    links.map((m, i) => /* @__PURE__ */ jsx18("p", { className: "cb-link", children: /* @__PURE__ */ jsx18("a", { href: m.href, children: m.value.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "") }) }, i))
  ] });
}
function Row2({ e }) {
  return /* @__PURE__ */ jsxs18("div", { className: "cb-row", children: [
    /* @__PURE__ */ jsxs18("div", { className: "cb-row-head", children: [
      /* @__PURE__ */ jsx18("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx18("span", { className: "cb-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx18("p", { className: "cb-org", children: /* @__PURE__ */ jsx18(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx18(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx18(MetaLines, { meta: e.meta })
  ] });
}
function Section({ section }) {
  const cards = section.role === "projects";
  return /* @__PURE__ */ jsxs18("section", { className: `cb-section cb-role-${section.role}`, children: [
    /* @__PURE__ */ jsx18("h2", { children: section.title }),
    cards ? /* @__PURE__ */ jsx18("div", { className: `cb-cards${section.entries.length === 1 ? " cb-cards-single" : ""}`, children: section.entries.map((e, i) => /* @__PURE__ */ jsx18(Card, { e, index: i }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsx18(Row2, { e }, e.id))
  ] });
}
function Casebook({ doc }) {
  const sections = orderSections(doc.sections, ["projects", "experience"]);
  const lastCore = sections.reduce((at, s, i) => s.role === "projects" || s.role === "experience" ? i : at, -1);
  const skills = doc.skills && /* @__PURE__ */ jsxs18("section", { className: "cb-section cb-capabilities", children: [
    /* @__PURE__ */ jsx18("h2", { children: doc.skills.heading }),
    doc.skills.groups.some((g) => g.label) ? /* @__PURE__ */ jsx18(SkillList, { groups: doc.skills.groups }) : /* @__PURE__ */ jsx18("ul", { className: "cb-capability-list", children: doc.skills.groups.flatMap((g) => g.items).map((item, i) => /* @__PURE__ */ jsx18("li", { children: item }, i)) })
  ] }, "skills");
  const body = sections.map((section) => /* @__PURE__ */ jsx18(Section, { section }, section.id));
  if (skills) body.splice(lastCore + 1, 0, skills);
  return /* @__PURE__ */ jsxs18(Paper, { id: "casebook", doc, children: [
    /* @__PURE__ */ jsxs18("header", { className: "cb-header", children: [
      /* @__PURE__ */ jsx18("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx18("p", { className: "cb-headline", children: doc.headline }),
      /* @__PURE__ */ jsx18(ContactList, { contacts: [...doc.contacts.filter((c) => c.kind === "website"), ...doc.contacts.filter((c) => c.kind !== "website")], className: "cb-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs18("section", { className: "cb-section cb-statement", children: [
      /* @__PURE__ */ jsx18("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx18(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx18("p", { children: /* @__PURE__ */ jsx18(Text, { value: p }) }, i))
    ] }),
    body
  ] });
}

// template-library/templates/meridian.tsx
import { jsx as jsx19, jsxs as jsxs19 } from "react/jsx-runtime";
function Entry12({ e }) {
  return /* @__PURE__ */ jsxs19("div", { className: "me-entry", children: [
    /* @__PURE__ */ jsxs19("div", { className: "me-head", children: [
      /* @__PURE__ */ jsx19("h3", { children: e.title }),
      e.dates && /* @__PURE__ */ jsx19("span", { className: "me-dates", children: e.dates })
    ] }),
    (e.organization || e.location) && /* @__PURE__ */ jsx19("p", { className: "me-org", children: /* @__PURE__ */ jsx19(Text, { value: join(e.organization, e.location) }) }),
    /* @__PURE__ */ jsx19(Bullets, { items: e.bullets }),
    /* @__PURE__ */ jsx19(MetaLines, { meta: e.meta })
  ] });
}
function Meridian({ doc }) {
  return /* @__PURE__ */ jsxs19(Paper, { id: "meridian", doc, children: [
    /* @__PURE__ */ jsxs19("header", { className: "me-header", children: [
      /* @__PURE__ */ jsxs19("div", { className: "me-identity", children: [
        /* @__PURE__ */ jsx19("h1", { children: doc.name }),
        doc.headline && /* @__PURE__ */ jsx19("p", { className: "me-headline", children: doc.headline })
      ] }),
      /* @__PURE__ */ jsx19(ContactList, { contacts: doc.contacts, className: "me-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs19("section", { className: "me-section me-summary", children: [
      /* @__PURE__ */ jsx19("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx19(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx19("p", { children: /* @__PURE__ */ jsx19(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs19("section", { className: "me-section me-skills", children: [
      /* @__PURE__ */ jsx19("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx19(SkillList, { groups: doc.skills.groups })
    ] }),
    doc.sections.map((section) => /* @__PURE__ */ jsxs19("section", { className: "me-section", children: [
      /* @__PURE__ */ jsx19("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx19(Entry12, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/scholar.tsx
import { Fragment as Fragment6, jsx as jsx20, jsxs as jsxs20 } from "react/jsx-runtime";
var citationRoles = /* @__PURE__ */ new Set(["publications", "presentations"]);
function Citation2({ e }) {
  const tail = [e.location, e.dates].filter(Boolean);
  return /* @__PURE__ */ jsxs20("li", { className: "sc-cite", children: [
    /* @__PURE__ */ jsxs20("p", { children: [
      e.title && /* @__PURE__ */ jsxs20("span", { className: "sc-cite-title", children: [
        "\u201C",
        e.title,
        ".\u201D"
      ] }),
      e.organization && /* @__PURE__ */ jsxs20(Fragment6, { children: [
        " ",
        /* @__PURE__ */ jsx20("cite", { children: /* @__PURE__ */ jsx20(Text, { value: e.organization }) }),
        tail.length ? "," : "."
      ] }),
      tail.length > 0 && /* @__PURE__ */ jsxs20(Fragment6, { children: [
        " ",
        tail.map((t, i) => /* @__PURE__ */ jsxs20("span", { children: [
          /* @__PURE__ */ jsx20(Text, { value: t }),
          i < tail.length - 1 ? ", " : "."
        ] }, i))
      ] })
    ] }),
    e.bullets.map((line, i) => /* @__PURE__ */ jsx20("p", { className: "sc-cite-note", children: /* @__PURE__ */ jsx20(Text, { value: line }) }, i)),
    /* @__PURE__ */ jsx20(MetaLines, { meta: e.meta, className: "sc-cite-meta" })
  ] });
}
function Entry13({ e }) {
  return /* @__PURE__ */ jsxs20("div", { className: "sc-entry", children: [
    /* @__PURE__ */ jsx20("p", { className: "sc-when", children: e.dates }),
    /* @__PURE__ */ jsxs20("div", { className: "sc-body", children: [
      /* @__PURE__ */ jsxs20("p", { className: "sc-line", children: [
        e.title && /* @__PURE__ */ jsx20("strong", { children: e.title }),
        e.title && e.organization && ", ",
        e.organization && /* @__PURE__ */ jsx20("em", { children: /* @__PURE__ */ jsx20(Text, { value: e.organization }) }),
        e.location && /* @__PURE__ */ jsxs20("span", { className: "sc-loc", children: [
          ", ",
          /* @__PURE__ */ jsx20(Text, { value: e.location })
        ] })
      ] }),
      /* @__PURE__ */ jsx20(Bullets, { items: e.bullets, className: "sc-notes" }),
      /* @__PURE__ */ jsx20(MetaLines, { meta: e.meta })
    ] })
  ] });
}
function Section2({ section }) {
  return /* @__PURE__ */ jsxs20("section", { className: `sc-section sc-role-${section.role}`, children: [
    /* @__PURE__ */ jsx20("h2", { children: section.title }),
    citationRoles.has(section.role) ? /* @__PURE__ */ jsx20("ol", { className: "sc-cites", children: section.entries.map((e) => /* @__PURE__ */ jsx20(Citation2, { e }, e.id)) }) : section.entries.map((e) => /* @__PURE__ */ jsx20(Entry13, { e }, e.id))
  ] });
}
function Scholar({ doc }) {
  const sections = orderSections(doc.sections, ["education", "experience", "publications", "awards", "teaching", "presentations", "projects", "leadership", "volunteering", "certifications"]);
  return /* @__PURE__ */ jsxs20(Paper, { id: "scholar", doc, children: [
    /* @__PURE__ */ jsxs20("header", { className: "sc-header", children: [
      /* @__PURE__ */ jsx20("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx20("p", { className: "sc-headline", children: doc.headline }),
      /* @__PURE__ */ jsx20(ContactList, { contacts: doc.contacts, className: "sc-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs20("section", { className: "sc-section", children: [
      /* @__PURE__ */ jsx20("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx20(Bullets, { items: doc.summary.bullets, className: "sc-notes" }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx20("p", { className: "sc-summary", children: /* @__PURE__ */ jsx20(Text, { value: p }) }, i))
    ] }),
    sections.map((section) => /* @__PURE__ */ jsx20(Section2, { section }, section.id)),
    doc.skills && /* @__PURE__ */ jsxs20("section", { className: "sc-section", children: [
      /* @__PURE__ */ jsx20("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx20(SkillList, { groups: doc.skills.groups })
    ] })
  ] });
}

// template-library/templates/stackline.tsx
import { jsx as jsx21, jsxs as jsxs21 } from "react/jsx-runtime";
function MetaRow({ meta }) {
  if (!meta.length) return null;
  return /* @__PURE__ */ jsx21("p", { className: "sl-meta", children: meta.map((m, i) => /* @__PURE__ */ jsxs21("span", { className: `sl-meta-item sl-${m.key}`, children: [
    /* @__PURE__ */ jsx21("span", { className: "sl-meta-label", children: m.label }),
    " ",
    /* @__PURE__ */ jsx21(MetaValue, { meta: m })
  ] }, i)) });
}
function Entry14({ e }) {
  return /* @__PURE__ */ jsxs21("div", { className: "sl-entry", children: [
    /* @__PURE__ */ jsxs21("div", { className: "sl-head", children: [
      /* @__PURE__ */ jsxs21("h3", { children: [
        e.title,
        e.title && e.organization && /* @__PURE__ */ jsx21("span", { className: "sl-at", children: " \u2014 " }),
        e.organization && /* @__PURE__ */ jsx21("span", { className: "sl-org", children: /* @__PURE__ */ jsx21(Text, { value: e.organization }) })
      ] }),
      e.dates && /* @__PURE__ */ jsx21("span", { className: "sl-dates", children: e.dates })
    ] }),
    e.location && /* @__PURE__ */ jsx21("p", { className: "sl-location", children: /* @__PURE__ */ jsx21(Text, { value: e.location }) }),
    /* @__PURE__ */ jsx21(MetaRow, { meta: e.meta }),
    /* @__PURE__ */ jsx21(Bullets, { items: e.bullets })
  ] });
}
function Stackline({ doc }) {
  const sections = orderSections(doc.sections, ["projects", "experience", "education", "certifications", "publications", "awards"]);
  return /* @__PURE__ */ jsxs21(Paper, { id: "stackline", doc, children: [
    /* @__PURE__ */ jsxs21("header", { className: "sl-header", children: [
      /* @__PURE__ */ jsx21("h1", { children: doc.name }),
      doc.headline && /* @__PURE__ */ jsx21("p", { className: "sl-headline", children: doc.headline }),
      /* @__PURE__ */ jsx21(ContactList, { contacts: doc.contacts, className: "sl-contacts" })
    ] }),
    doc.summary && /* @__PURE__ */ jsxs21("section", { className: "sl-section", children: [
      /* @__PURE__ */ jsx21("h2", { children: doc.summary.heading }),
      doc.summary.bullets.length ? /* @__PURE__ */ jsx21(Bullets, { items: doc.summary.bullets }) : doc.summary.paragraphs.map((p, i) => /* @__PURE__ */ jsx21("p", { className: "sl-summary", children: /* @__PURE__ */ jsx21(Text, { value: p }) }, i))
    ] }),
    doc.skills && /* @__PURE__ */ jsxs21("section", { className: "sl-section sl-stack", children: [
      /* @__PURE__ */ jsx21("h2", { children: doc.skills.heading }),
      /* @__PURE__ */ jsx21(SkillList, { groups: doc.skills.groups })
    ] }),
    sections.map((section) => /* @__PURE__ */ jsxs21("section", { className: `sl-section sl-role-${section.role}`, children: [
      /* @__PURE__ */ jsx21("h2", { children: section.title }),
      section.entries.map((e) => /* @__PURE__ */ jsx21(Entry14, { e }, e.id))
    ] }, section.id))
  ] });
}

// template-library/templates/index.tsx
import { jsx as jsx22 } from "react/jsx-runtime";
var premiumRenderers = {
  boardroom: Boardroom,
  mandate: Mandate,
  stackline: Stackline,
  kernel: Kernel,
  casebook: Casebook,
  atelier: Atelier,
  scholar: Scholar,
  bench: Bench,
  charter: Charter,
  plainsong: Plainsong,
  rounds: Rounds,
  meridian: Meridian,
  crossover: Crossover,
  almanac: Almanac,
  roster: Roster,
  primer: Primer,
  pyramid: Pyramid,
  quartile: Quartile,
  waypoint: Waypoint,
  cadence: Cadence
};
function PremiumResume({ id, resume }) {
  const Renderer = premiumRenderers[id];
  if (!Renderer) throw new Error(`Premium template "${id}" has no renderer yet`);
  return /* @__PURE__ */ jsx22(Renderer, { doc: toDocument(resume) });
}
export {
  PremiumResume,
  premiumRenderers
};

import type { Resume } from '../model';
import React from 'react';
export function ResumePreview({ resume }: { resume: Resume }) {
    const summaryLines = resume.summary.split('\n').map(line => line.trim()).filter(Boolean);
    const summaryIsList = summaryLines.length > 1 && summaryLines.every(line => /^[•●▪◦\-]\s*/.test(line));
    return React.createElement("article", { className: `resume-paper ${resume.template}`, dir: resume.direction, lang: resume.language, style: { '--resume-accent': resume.accent }, "aria-label": "Resume preview" },
        React.createElement("header", { className: "resume-header" },
            React.createElement("h1", null, resume.name || 'Your name'),
            resume.headline && React.createElement("p", { className: "resume-headline" }, resume.headline),
            React.createElement("div", { className: "resume-contact" }, [resume.email, resume.phone, resume.location, resume.website].filter(Boolean).map((value, i) => React.createElement("span", { key: i }, value)))),
        resume.summary && React.createElement("section", null,
            React.createElement("h2", null, resume.profileHeading || 'Profile'),
            summaryIsList ? React.createElement("ul", null, summaryLines.map((line, index) => React.createElement("li", { key: index }, line.replace(/^[•●▪◦\-]\s*/, '')))) : React.createElement("p", { style: { whiteSpace: 'pre-line' } }, resume.summary)),
        resume.sections.filter(section => section.entries.some(item => item.title || item.organization || item.description)).map(section => React.createElement("section", { key: section.id },
            React.createElement("h2", null, section.title),
            section.entries.map(item => React.createElement("div", { className: "resume-entry", key: item.id },
                React.createElement("div", { className: "entry-heading" },
                    React.createElement("h3", null, item.title),
                    React.createElement("span", null, item.dates)),
                React.createElement("div", { className: "entry-company" }, [item.organization, item.location].filter(Boolean).join(' · ')),
                item.description && React.createElement("ul", null, item.description.split('\n').filter(Boolean).map((line, i) => React.createElement("li", { key: i }, line.replace(/^[•\-]\s*/, '')))))))),
        resume.skills && React.createElement("section", null,
            React.createElement("h2", null, resume.skillsHeading || 'Skills & languages'),
            React.createElement("p", null, resume.skills)));
}

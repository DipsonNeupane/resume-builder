# ResumeBuild'r - AI Coding Agent Instructions

## Project Overview
ResumeBuild'r is a web application designed to help users create, manage, and export professional resumes. This is a new project with an evolving architecture.

## Tech Stack
- **Frontend**: React with TypeScript (assumed primary UI framework)
- **Backend**: Node.js/Express or equivalent REST API
- **Database**: TBD (will store user data, resume templates, export history)
- **Styling**: TBD (Tailwind CSS or CSS-in-JS recommended for consistency)

## Key Architectural Patterns

### Directory Structure (when established)
- `/src` - Source code root
- `/src/components` - Reusable UI components (form fields, preview panels, buttons)
- `/src/pages` - Page-level components (editor, dashboard, templates)
- `/src/services` - API clients and business logic (resume generator, export handlers)
- `/src/hooks` - Custom React hooks for state management and side effects
- `/src/types` - TypeScript interfaces (resume data models, API responses)
- `/backend` or `/api` - Server code (routes, controllers, database models)

### Common Workflows

#### Local Development
```bash
# Frontend development
npm run dev          # Start dev server (usually port 3000)
npm run build        # Production build
npm run test         # Run tests

# Backend (if separate)
npm run server       # Start API server (usually port 5000)
```

#### Testing
- Unit tests in `__tests__` or `.test.ts` files adjacent to source
- Integration tests for API endpoints and data flows
- Run: `npm test` or `npm run test:watch`

#### Building for Production
- Frontend: `npm run build` creates optimized bundle
- Backend: Compile/bundle as needed for deployment
- Environment: Use `.env.local` for secrets, `.env` for shared config

## Resume Data Model
The core data structure likely includes:
- **Personal Info**: Name, email, phone, location, summary
- **Experience**: Job title, company, dates, descriptions
- **Education**: School, degree, graduation date
- **Skills**: List of technical/professional skills
- **Projects**: Personal or portfolio projects with descriptions

Store as structured JSON, validate on client and server.

## Common Patterns to Follow

### React Component Structure
```typescript
// Separate concerns: UI rendering vs. business logic
// Use hooks for state, side effects, and custom logic
// Example: ResumeEditor component
export function ResumeEditor({ resumeId }: Props) {
  const [resume, setResume] = useState(initialResume);
  const updateField = (path: string, value: any) => setResume(...);
  return <form>{/* form fields */}</form>;
}
```

### API Communication
- Use a centralized API client (e.g., `services/api.ts`)
- Standardize error handling and request/response formats
- Include loading and error states in components

### TypeScript
- Define types for API responses, component props, and state shapes
- Use strict mode: `strict: true` in `tsconfig.json`
- Avoid `any`; use discriminated unions for complex types

## Key Considerations

1. **Resume Export**: Likely need PDF/DOCX generation. Research libraries early (e.g., `pdfkit`, `docx`, or server-side tools).
2. **User Authentication**: Will require login/signup flow when user management is added.
3. **Real-time Sync**: Consider if resume changes should auto-save to backend.
4. **Template System**: Maintain separation between resume data and presentation (template).
5. **Accessibility**: Resume editor should be fully keyboard navigable and WCAG compliant.

## Development Guidelines

- **Commit Messages**: Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
- **Code Reviews**: PR checklist includes tests, TypeScript strict mode compliance, accessibility checks
- **Performance**: Resume editor handles potentially large documents; lazy load components, memoize expensive renders
- **Error Handling**: Provide user-friendly error messages; log technical details server-side

## Notes for AI Agents
- When adding features, update this file if introducing new patterns or conventions
- Reference file paths and line numbers in your changes
- Test export functionality thoroughly (PDF/DOCX generation is critical path)
- Keep resume data validation centralized to prevent inconsistencies

## Implemented local beta
- React/TypeScript with Vite; `npm run dev`, `npm run build`, and `npm test` are implemented.
- Resume schema and backup validation live in `src/model.ts`; rendering lives in `src/components/ResumePreview.tsx`.
- Draft storage uses localStorage, with JSON backup import/export. No server, authentication, payments, or AI is connected yet.
- Browser print styles provide A4/Letter PDF output. Do not claim a dedicated PDF download or DOCX export until implemented.
- Preserve global scope: flexible section titles, international contact formats, Unicode content, and right-to-left layout. Current UI is English.
- Playwright tests cover persistence, invalid imports, mobile overflow, and print output.

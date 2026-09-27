// Application-facing compatibility boundary. The policy lives in the self-contained
// Vercel middleware entry so the packaged runtime cannot lose a source-tree import.
export {
 initialPage,
 isPublicAttributionLocation,
 isPublicLocation,
 isPublicPath,
 noindex,
 notFoundHtml,
 privateMetadata,
 productionOrigin,
 publicAnchors,
 publicPages,
 requestSeo,
 websiteSchema,
} from '../../middleware';
export type { AppPage } from '../../middleware';

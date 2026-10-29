import { expect, type Page } from '@playwright/test';

/** Home → "Build my master resume". A blank draft passes the intended "Start your master
 * resume" introduction first; an existing draft opens the editor directly, and an already-open editor is left as is. */
export async function openEditorFromHome(page: Page, which: 'first' | 'last' = 'first') {
 const build = page.getByRole('button', { name: 'Build my master resume', exact: true });
 const start = page.getByRole('button', { name: 'Start building', exact: true });
 const editor = page.getByRole('textbox', { name: 'Full name', exact: true });
 // Reloading the editor keeps you in the editor, so there may be no home button to press.
 await expect(build.first().or(editor)).toBeVisible();
 if (await editor.isVisible()) return;
 await (which === 'first' ? build.first() : build.last()).click();
 await expect(start.or(editor)).toBeVisible();
 if (await start.isVisible()) await start.click();
}

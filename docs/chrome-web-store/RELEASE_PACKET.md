# ResumeStride Job Capture — Chrome Web Store release packet

Updated September 29, 2026 for extension version **0.2.1**. This packet prepares an update to the
published 0.2.0 item. It does not authorize upload, submission, or publication.

## Listing

- **Name:** ResumeStride Job Capture
- **Category:** Productivity
- **Language:** English
- **Website:** https://resumestride.com/
- **Privacy policy:** https://resumestride.com/privacy.html
- **Support:** support@resumestride.com
- **Short description:** Save jobs from around the web to ResumeStride, with details added when safely available.
- **Single purpose:** Save one individual job opportunity chosen by the user into that user's ResumeStride Saved Jobs.

### Detailed description

Save a job you find outside ResumeStride without copying a long description first. Open an
individual job page, click ResumeStride Job Capture, and choose **Save to ResumeStride**. The job's
normalized source URL enters the same Saved Jobs workflow as jobs found inside ResumeStride.

The extension safely recognizes individual job URLs on LinkedIn, Indeed, ZipRecruiter,
Greenhouse, Lever, Ashby, and compatible Workday pages. It can also recognize company career pages
with reliable JobPosting metadata. When reliable public details are available, ResumeStride adds
the title, company, location, and description. Otherwise it saves the job URL with details pending;
it does not scrape restricted content or bypass sign-in, CAPTCHAs, anti-bot controls, or other
access restrictions.

Search results ask you to open the individual job page. Ordinary pages report **No job detected
on this page**. An explicit manual URL fallback requires the user to confirm that the current page
really is a job posting. Repeating the same normalized job URL returns **Already saved** instead of
creating a duplicate.

A ResumeStride account is required to save. Match, evidence, job-specific resume versions,
tailoring, and exports remain normal ResumeStride features and are not recreated in the extension.
The extension does not guarantee job availability, employer accuracy, ATS success, hiring
probability, or an employment outcome.

### Version 0.2.1 release notes

Redesigns capture as universal job saving: URL saving is the reliable baseline and enrichment is
optional. Adds safe individual-job recognition for LinkedIn, Indeed, and ZipRecruiter without
scraping restricted content; preserves enrichment for Greenhouse, Lever, Ashby, compatible Workday,
and JobPosting pages; adds duplicate-aware Saved and Already saved states; protects against non-job
pages; replaces the tall review form with a compact Patina panel; and removes the unused `storage`
and `alarms` permissions.

## Permission justifications

- **activeTab:** Temporarily inspect only the page the user chooses by clicking the extension, to
  decide whether it plausibly represents an individual job and attach safe available details.
- **scripting:** Run the packaged detector in that chosen tab and the packaged save bridge in the
  official ResumeStride tab.
- **https://resumestride.com/*:** Reach only the official web app for the user-requested save. The
  runtime further restricts the destination to the exact approved HTTPS origin and path.

No permanent job-board or all-sites permission is requested. Version 0.2.1 does not request
`storage`, `alarms`, `tabs`, `history`, `cookies`, `webRequest`, clipboard, authentication, or AI
permissions.

## Privacy and data-use disclosures

Conservatively disclose **website content**, **user-provided content**, and the active job URL under
Chrome's applicable browsing-activity category. Possible job data includes the normalized source
URL, source/domain, save time, and—only where safely available—title, company, location,
description, workplace/employment/salary fields, and provenance.

Data is used only for the user-requested Saved Jobs and related ResumeStride features. It is not
sold, used for personalized advertising, or used for creditworthiness. Transfer is encrypted. The
public privacy policy contains the Chrome Web Store Limited Use commitment. The extension contains
no service-role, AI-provider, billing, or other secret credentials and receives no ResumeStride
authentication token, resume content, account identity, or payment information.

## Reviewer instructions

1. Open a current individual job page and click the toolbar action. No job-board host permission
   should be requested.
2. On LinkedIn, Indeed, or ZipRecruiter, verify that **Save to ResumeStride** is available on a
   recognized detail URL even when no job text is extracted.
3. On Greenhouse, Lever, Ashby, compatible Workday, or a reliable JobPosting page, verify that
   available details accompany the URL.
4. Choose **Save to ResumeStride**. In the official app tab, sign in if needed. The popup should
   report **Saved** and offer **Open in ResumeStride**.
5. Repeat the same normalized URL and verify **Already saved** with no duplicate Saved Job.
6. Open a search-results page and verify **Open the individual job page**. Open an ordinary site
   and verify **No job detected on this page**.
7. Repeat with the supplied Free and Pro reviewer accounts. Saving, ownership isolation, and
   duplicate handling do not require a paid provider call.

Reviewer credentials belong only in the dashboard's private reviewer field. Never place them in
this repository, listing text, screenshots, or support email.

## Release artifact

- **ZIP:** `dist/resumestride-extension.zip`
- **Unpacked acceptance build:** `dist/extension/`
- **SHA-256:** `176575d4f9ab5b6afcf972669c45929c55b5e01c7211d366c48b88dc23542f69`
- **Packaged files:** 14
- **Unpacked bytes:** 49,457
- **Archive bytes:** 25,041
- **Required small promo:** `assets/small-promo-440x280.png`
- **Optional marquee:** `assets/marquee-1400x560.png`
- **Store screenshots:** capture the genuine installed 0.2.1 popup and production app; never use a mockup.

The checksum is valid only while package files remain unchanged. Rebuild, verify, and replace this
inventory after any runtime, manifest, popup, or icon change. Do not upload or submit without owner
approval.

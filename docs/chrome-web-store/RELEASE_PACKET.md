# APWICO Job Capture — Chrome Web Store release packet

Updated October 31, 2026 for extension version **0.2.4**. This packet prepares an update to the
published 0.2.3 item. It does not authorize upload, submission, or publication.

## Listing

- **Name:** APWICO Job Capture
- **Category:** Productivity
- **Language:** English
- **Website:** https://apwico.com/
- **Privacy policy:** https://apwico.com/privacy.html
- **Support:** support@apwico.com
- **Short description:** Save jobs from around the web to APWICO, with details added when safely available.
- **Single purpose:** Save one individual job opportunity chosen by the user into that user's APWICO Saved Jobs.

### Detailed description

Save a job you find outside APWICO without copying a long description first. Open an
individual job page, click APWICO Job Capture, and choose **Save to APWICO**. The job's
normalized source URL enters the same Saved Jobs workflow as jobs found inside APWICO.

The extension safely recognizes individual job URLs on LinkedIn, Indeed, ZipRecruiter,
Greenhouse, Lever, Ashby, and compatible Workday pages. It can also recognize company career pages
with reliable JobPosting metadata. When reliable public details are available, APWICO adds
the title, company, location, and description. Otherwise it saves the job URL with details pending;
it does not scrape restricted content or bypass sign-in, CAPTCHAs, anti-bot controls, or other
access restrictions.

Search results ask you to open the individual job page. Ordinary pages report **No job detected
on this page**. An explicit manual URL fallback requires the user to confirm that the current page
really is a job posting. Repeating the same normalized job URL returns **Already saved** instead of
creating a duplicate.

An APWICO account is required to save. Match, evidence, job-specific resume versions,
tailoring, and exports remain normal APWICO features and are not recreated in the extension.
The extension does not guarantee job availability, employer accuracy, ATS success, hiring
probability, or an employment outcome.

### Version 0.2.4 release notes

Updates the extension's name, messages, and production destination to APWICO. Restricts the
production host permission to `https://apwico.com/*`. Job detection, URL validation, and the
account-owned save flow are unchanged.

## Permission justifications

- **activeTab:** Temporarily inspect only the page the user chooses by clicking the extension, to
  decide whether it plausibly represents an individual job and attach safe available details.
- **scripting:** Run the packaged detector in that chosen tab and the packaged save bridge in the
  official APWICO tab.
- **https://apwico.com/*:** Reach only the official web app for the user-requested save. The
  runtime further restricts the destination to the exact approved HTTPS origin and path.

No permanent job-board or all-sites permission is requested. Version 0.2.4 does not request
`storage`, `alarms`, `tabs`, `history`, `cookies`, `webRequest`, clipboard, authentication, or AI
permissions.

## Privacy and data-use disclosures

Conservatively disclose **website content**, **user-provided content**, and the active job URL under
Chrome's applicable browsing-activity category. Possible job data includes the normalized source
URL, source/domain, save time, and—only where safely available—title, company, location,
description, workplace/employment/salary fields, and provenance.

Data is used only for the user-requested Saved Jobs and related APWICO features. It is not
sold, used for personalized advertising, or used for creditworthiness. Transfer is encrypted. The
public privacy policy contains the Chrome Web Store Limited Use commitment. The extension contains
no service-role, AI-provider, billing, or other secret credentials and receives no APWICO
authentication token, resume content, account identity, or payment information.

## Reviewer instructions

1. Open a current individual job page and click the toolbar action. No job-board host permission
   should be requested.
2. On LinkedIn, Indeed, or ZipRecruiter, verify that **Save to APWICO** is available on a
   recognized detail URL even when no job text is extracted.
3. On Greenhouse, Lever, Ashby, compatible Workday, or a reliable JobPosting page, verify that
   available details accompany the URL.
4. Choose **Save to APWICO**. In the official app tab, sign in if needed. The popup should
   report **Saved** and offer **Open in APWICO**.
5. Repeat the same normalized URL and verify **Already saved** with no duplicate Saved Job.
6. Open a search-results page and verify **Open the individual job page**. Open an ordinary site
   and verify **No job detected on this page**.
7. Repeat with the supplied Free and Pro reviewer accounts. Saving, ownership isolation, and
   duplicate handling do not require a paid provider call.

Reviewer credentials belong only in the dashboard's private reviewer field. Never place them in
this repository, listing text, screenshots, or support email.

## Release artifact

- **ZIP:** `dist/apwico-extension.zip`
- **Unpacked acceptance build:** `dist/extension/`
- **SHA-256:** `21c7660e1ef3ae072b548833531618a2022f47cee88793492ad3a4069c98b8f8`
- **Packaged files:** 14
- **Unpacked bytes:** 49,538
- **Archive bytes:** 25,148
- **Required small promo:** `assets/small-promo-440x280.png`
- **Optional marquee:** `assets/marquee-1400x560.png`
- **Store screenshots:** capture the genuine installed 0.2.4 popup and production app; never use a mockup.

The checksum is valid only while package files remain unchanged. Rebuild, verify, and replace this
inventory after any runtime, manifest, popup, or icon change. Do not upload or submit without owner
approval.

# AstraLogs Supabase setup

AstraLogs uses Supabase Auth and PostgreSQL for username/password accounts, named logbooks, groups, invitations, accomplishment records, and daily time records. No email address is requested. Usernames are mapped internally to synthetic Auth email identities; users will not receive email from this app.

## 1. Create and configure a Supabase project

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key).
3. Paste those values into `js/supabase-config.js`. The browser key is public by design; never use a service-role or secret key in this app.
4. Open the Supabase SQL Editor and run `supabase/schema.sql`. It creates the logbook and time-record tables, AI integration settings, and the atomic daily report quota function, and updates existing group membership and accomplishment records for the current data model. When updating an existing deployment, rerun the latest schema so database functions and policies stay in sync with the app.
5. In **Authentication → Settings**, enable public sign-ups and turn off **Confirm email**. Without this setting, Supabase requires an email confirmation and username-only registration cannot complete.
6. Deploy this static app over HTTPS (or use a local HTTP server while developing). Do not open `index.html` directly as a `file://` URL for sign-in.

## 2. Publish and install as an app

AstraLogs is an installable Progressive Web App (PWA) hosted on Cloudflare Pages. The app must be served over HTTPS; Cloudflare provides that automatically.

Live app: https://astralogs.pages.dev/

This project now uses Cloudflare Pages Functions for private API routes. The existing drag-and-drop ZIP contains only the static app and does not deploy Functions. From the repository root, deploy with Wrangler so it packages the `functions/` directory:

```powershell
npx wrangler pages deploy . --project-name astralogs
```

Use the existing Pages project name if it differs. Wrangler requires Node.js and access to the Cloudflare account. The app can remain on Cloudflare Pages; no Vercel deployment is needed.

After deployment, each person opens the site once to install it:

- **iPhone/iPad:** Open the site in Safari, tap **Share**, then **Add to Home Screen**. Launch AstraLogs from the new icon afterward.
- **Android:** Open the site in Chrome and choose **Install app** (or **Add to Home screen**) from the browser menu. The AstraLogs sidebar also offers an install button when the browser supports a direct prompt.
- **Desktop:** Use the browser's install icon or menu, or the AstraLogs sidebar's **Install app** button.

The app caches its static interface for launch, but sign-in and Supabase data still require an internet connection. Users need the published address for the initial installation and for sharing the app with new devices.

The illustrated [iPhone and iPad installation guide](https://astralogs.pages.dev/ios-install.html) shows each step.

## 3. Register and sign in

Select **Create account** and choose a username (3–30 letters, numbers, periods, underscores, or hyphens) and password (at least 8 characters). The username remains your login ID; your profile nickname is used for team and accomplishment displays. Create your first named collection from **Collections**; it can be private or shared with one of your groups.

## 4. Accomplishments, collections, and groups

- An accomplishment is one individual record of work.
- Collections (called logbooks in the database) organize related accomplishment records. Each user can create multiple named collections.
- A private collection is listed for its owner; a teammate selected on an accomplishment can also see that entry and its collection listing, but not other entries.
- When creating a collection, its owner can assign one group they belong to. Collections continue to be shared with that group, while newly submitted accomplishments are visible only to the submitter and the selected interns. Older accomplishments retain their existing collection access.
- The collection owner manages the collection itself and can choose the assigned group when creating it.
- The Dashboard shows recent accomplishments across accessible collections and recent daily time records.
- Time Records store one row per person and date, with Morning In/Out and Afternoon In/Out punches. Quick punches use the current local date and time; manual punches can add or correct a date and time.
- Time records are private to their owner and cannot be shared with groups. On the Time Records page, each record can be edited (date and punch times) or deleted.
- Create as many groups as needed from **Team**. Each group has a unique five-character alphanumeric invite code that members can share; entering it sends a join request that the group owner must approve. Group owners can remove other members with the **×** control. Username invitations remain available and must be accepted before joining.
- Apply the latest `supabase/schema.sql` before using group codes or member removal. It refreshes older codes to the five-character format and replaces any outdated code-format constraint; share the newly displayed codes afterward.
- Users can belong to multiple groups. Invitations and team-member views are scoped to the selected group.
- Existing group accomplishment records are migrated into a collection shared with their original group. Existing user-only records are migrated into a private collection.
- Row-level security enforces collection and group access. The browser uses only the publishable/anon key; never expose a service-role key.
- Existing records in a browser's old local storage are not migrated automatically; export or copy any records you need before switching.
- There is no email-based password reset for these username-only accounts. Users who forget passwords need an administrator to reset them in Supabase Auth.

The frontend loads the Supabase JavaScript client from jsDelivr, so users need network access to that CDN as well as to Supabase. For Auth, AstraLogs maps usernames to syntactically valid addresses under the reserved `example.com` domain; these are internal identifiers, not real email addresses. Email confirmation must remain disabled because users cannot receive mail at these addresses. Existing accounts created by the earlier `users.accomplishment.invalid` format are tried as a compatibility fallback when signing in.

## 5. AI reports and templates

Run the latest `supabase/schema.sql` in the Supabase SQL Editor before using AI integrations. It creates private AI settings and report-usage tables, the private `report-templates` Storage bucket, and per-user Storage access policies. Browser roles have no access to the encrypted settings table; Pages Functions use a server-only Supabase service-role key and always scope access to the authenticated user. Uploaded templates use the authenticated browser session and are restricted to their owner's folder.

In **Cloudflare Pages → Settings → Variables and Secrets**, add these values for the Production environment (and Preview if you use it):

- `SUPABASE_URL` — the project URL.
- `SUPABASE_ANON_KEY` — the publishable/anon key, used only to validate the user's Supabase session.
- `SUPABASE_SERVICE_ROLE_KEY` — the legacy Supabase service-role secret. Store as a secret; never add it to browser code.
- `ENCRYPTION_KEY` — a base64-encoded random 32-byte master key. Generate one in PowerShell with:

  ```powershell
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  [Convert]::ToBase64String($bytes)
  $rng.Dispose()
  ```

  Save the value securely and set it as a Cloudflare secret. Do not rotate or lose it without first re-encrypting every saved provider key; existing keys cannot be decrypted with a different master key.
Set the provider, editable model name, program, and API key in **Integrations** inside AstraLogs. The API key is sent to a Pages Function for encryption and is never returned to the browser.

Use the Integrations screen to save and test a provider key. Edit the report prompt there (up to 4,000 characters); `{entries}` is required, and unknown variables are warned about and left unreplaced. Choose **Save prompt** to store changes or **Reset to default** to restore the built-in prompt. The server always applies its fixed system instructions and JSON output contract. Upload a `.docx` or `.xlsx` template (up to 2 MB), test it, and choose whether reports use it or the default printable HTML format. Template rendering uses browser libraries loaded from pinned CDN versions; uploaded template contents and generated reports are not sent to those library hosts.

On **Collections → Accomplishments**, select entries and generate a report. AstraLogs displays a loading screen, then opens a results page where you can review or edit the output, copy it, download it, or print it. No email recipient is needed. Generation is limited to 10 attempts per user per UTC day; failed provider attempts also count toward this limit.

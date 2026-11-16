# AstraLogs Supabase setup

AstraLogs uses Supabase Auth and PostgreSQL for username/password accounts, named logbooks, groups, invitations, accomplishment records, and daily time records. No email address is requested. Usernames are mapped internally to synthetic Auth email identities; users will not receive email from this app.

## 1. Create and configure a Supabase project

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key).
3. Paste those values into `js/supabase-config.js`. The browser key is public by design; never use a service-role or secret key in this app.
4. Open the Supabase SQL Editor and run `supabase/schema.sql`. It creates the logbook and time-record tables and updates existing group membership and accomplishment records for the current model. When updating an existing deployment, rerun the latest schema so database functions and policies stay in sync with the app.
5. In **Authentication → Settings**, enable public sign-ups and turn off **Confirm email**. Without this setting, Supabase requires an email confirmation and username-only registration cannot complete.
6. Deploy this static app over HTTPS (or use a local HTTP server while developing). Do not open `index.html` directly as a `file://` URL for sign-in.

## 2. Publish and install as an app

AstraLogs is an installable Progressive Web App (PWA). Cloudflare Pages is a good free static host; Vercel's Hobby plan is another option. The app must be served over HTTPS; the host provides that automatically.

Live app: https://astralogs.pages.dev/

For the current Cloudflare setup, use **Workers & Pages → Create application → Get started → Drag and drop your files**, then upload `AstraLogs-PWA-deploy.zip`. This package includes the ignored local Supabase browser config, which contains a publishable key. Cloudflare Direct Upload projects cannot later be converted to Git-integrated projects; choose Git integration instead if automatic deploys are required.

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

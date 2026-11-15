# AstraLogs Supabase setup

AstraLogs uses Supabase Auth and PostgreSQL for username/password accounts, named logbooks, groups, invitations, accomplishment records, and daily time records. No email address is requested. Usernames are mapped internally to synthetic Auth email identities; users will not receive email from this app.

## 1. Create and configure a Supabase project

1. Create a Supabase project.
2. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key).
3. Paste those values into `js/supabase-config.js`. The browser key is public by design; never use a service-role or secret key in this app.
4. Open the Supabase SQL Editor and run `supabase/schema.sql`. It creates the logbook and time-record tables and updates existing group membership and accomplishment records for the current model. When updating an existing deployment, rerun the latest schema so database functions and policies stay in sync with the app.
5. In **Authentication → Settings**, enable public sign-ups and turn off **Confirm email**. Without this setting, Supabase requires an email confirmation and username-only registration cannot complete.
6. Deploy this static app over HTTPS (or use a local HTTP server while developing). Do not open `index.html` directly as a `file://` URL for sign-in.

## 2. Register and sign in

Select **Create account** and choose a username (3–30 letters, numbers, periods, underscores, or hyphens) and password (at least 8 characters). The app creates an Auth account without collecting an email, then uses the username as the initial profile name. Create your first named collection from **Collections**; it can be private or shared with one of your groups.

## 3. Accomplishments, collections, and groups

- An accomplishment is one individual record of work.
- Collections (called logbooks in the database) organize related accomplishment records. Each user can create multiple named collections.
- A private collection is visible only to its owner.
- When creating a collection, its owner can assign one group they belong to. Every accepted member of that group can view and edit accomplishments in that collection. Other collections remain private unless explicitly shared.
- The collection owner manages the collection itself and can choose the assigned group when creating it.
- The Dashboard shows recent accomplishments across accessible collections and recent daily time records.
- Time Records store one row per person and date, with Morning In/Out and Afternoon In/Out punches. Quick punches use the current local date and time; manual punches can add or correct a date and time.
- Time records are private by default. A person may choose a group when recording the first punch of a date; that day's record is then visible to members of that group and includes the person's profile name. Private records are visible only to their owner and omit the name from the table.
- Create as many groups as needed from **Team**. A username invitation must be accepted before the person becomes a group member.
- Users can belong to multiple groups. Invitations and team-member views are scoped to the selected group.
- Existing group accomplishment records are migrated into a collection shared with their original group. Existing user-only records are migrated into a private collection.
- Row-level security enforces collection and group access. The browser uses only the publishable/anon key; never expose a service-role key.
- Existing records in a browser's old local storage are not migrated automatically; export or copy any records you need before switching.
- There is no email-based password reset for these username-only accounts. Users who forget passwords need an administrator to reset them in Supabase Auth.

The frontend loads the Supabase JavaScript client from jsDelivr, so users need network access to that CDN as well as to Supabase. For Auth, AstraLogs maps usernames to syntactically valid addresses under the reserved `example.com` domain; these are internal identifiers, not real email addresses. Email confirmation must remain disabled because users cannot receive mail at these addresses. Existing accounts created by the earlier `users.accomplishment.invalid` format are tried as a compatibility fallback when signing in.

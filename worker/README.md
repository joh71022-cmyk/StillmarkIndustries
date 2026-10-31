# Publish service (keeps the GitHub token on a server, not in browsers)

A website on GitHub Pages cannot keep a secret by itself, so this tiny free service does it.

How it works for you:
- **First time only:** open the mod panel > PUBLISH. A box asks for your GitHub token once. It is saved on the service
  and never comes back to any browser.
- **Every time after:** the PUBLISH tab is just one **PUBLISH** button. No token, no extra passphrase.
  The mod code you already type after `mod pas` is what the service checks.

Friends who are mods only need the mod code. They never see the token. Change the code (see below) to lock someone out.

## One-time setup (about 10 minutes, free, no card)

1. Make a free account at https://dash.cloudflare.com
2. **Workers & Pages** > **Create** > **Create Worker**. Name it `hollowblade-publish`, click **Deploy**.
3. Click **Edit code**, delete what is there, paste in all of `worker.js` from this folder, click **Deploy**.
4. Make the storage: **Storage & Databases** > **KV** > **Create a namespace** named `hollowblade-store`.
5. Back in your worker: **Settings** > **Bindings** > **Add** > **KV namespace**.
   Variable name must be exactly `STORE`, pick `hollowblade-store`, save.
6. Still in **Settings** > **Variables and Secrets**, add:

   | Type   | Name             | Value |
   |--------|------------------|-------|
   | Secret | `MOD_PASSCODE`   | the mod code. Make it long (see tips). It is what you type after `mod pas` |
   | Text   | `REPO`           | `joh71022-cmyk/StillmarkIndustries` |
   | Text   | `ALLOWED_ORIGIN` | `https://joh71022-cmyk.github.io` |

7. Deploy again if it asks. Copy the worker's address, it looks like
   `https://hollowblade-publish.yourname.workers.dev`.
8. Open your site > mod panel > **PUBLISH**. Under "USE A PUBLISH SERVICE" paste the address and click **USE THIS SERVICE**.
   (To make it the same for every browser, send the address to whoever maintains the site so it is built in.)
9. The panel now shows the one-time token box. Paste your GitHub token (fine-grained, **Contents: Read and write**,
   only this repo). It is checked with GitHub and saved. Done.

## Tips

- **Use a long mod code.** Wrong guesses are slowed down, and after 20 wrong tries everything locks for 10 minutes,
  but a long code (for example `gears-and-blades-are-sharp-2026`) is far stronger than 6 digits.
  A code with no spaces works after `mod pas`. If you change `MOD_PASSCODE`, type the new one after `mod pas`.
- **Token expired or revoked:** the panel notices and shows the token box again. Paste a new one.
- **Remove the token from the service:** PUBLISH tab > **CHANGE TOKEN**.
- **What the service allows:** only `site-data.js` and pictures inside `uploads/`. It cannot touch anything else in the repo.
- The service only accepts requests from your site (`ALLOWED_ORIGIN`) and from `localhost` for testing.
- Prefer pasting the token in Cloudflare instead? Add it as a Secret called `GITHUB_TOKEN` and skip step 9.

## Game downloads (file uploads)

The page builder can store a game file for people to download, with no itch.io needed.
The mod panel sends the file to `POST /upload`, and the service streams it into a GitHub Release called
**downloads** in your repo. Visitors download it from GitHub's servers straight from your page.

- Limit: **95 MB per file** (Cloudflare's free plan allows 100 MB per request). For bigger files paste a link instead.
- Allowed types: zip, 7z, rar, exe, msi, apk, dmg, pkg, deb, appimage, tar, gz, pdf, txt, mp3, ogg, wav, mp4, webm, png, jpg, gif and a few more. Web page and script files are refused on purpose.
- Uploading a file with the same name replaces the old one.
- Needs the same token as publishing (**Contents: Read and write** covers releases too).
- After changing `worker.js`, redeploy it (`wrangler deploy`, or paste the new code into the Cloudflare editor).

## Polls and star ratings (public voting)

Poll and Star Rating elements let visitors vote. Their votes go to this service (`GET /poll`, `POST /poll/vote`);
no mod code is needed to vote.

- **One vote per person.** The service keeps only a private fingerprint of the visitor's address, never the address itself.
- **Only real polls.** A vote is accepted only if the poll exists in your published `site-data.js`, so nobody can make up polls.
- **Goes live on publish.** A poll shows "not live yet" until you publish the page it is on.
- **Reset votes.** In the builder, "RESET VOTES" starts a fresh count (use it if you change the options).
- **Closing date.** Optional. After it, the poll shows results and refuses new votes.
- **Limits (free plan).** Each vote uses 2 of Cloudflare KV's 1,000 free writes per day, so about 500 votes a day.
  Two votes at the very same instant can occasionally count as one. That is fine for a community site.
- Like the upload feature, polls need the `STORE` KV binding.

## Fast publishing (live in seconds)

A website on GitHub Pages normally takes 30-90 seconds to rebuild after every change. To avoid that wait, the
service keeps a **live copy** of your site content in its KV storage and serves it at `/site-data.js`.
Every page loads that first, and falls back to the copy saved in GitHub if the service is unreachable.

- Publishing writes the live copy first (visitors see changes within about 10 seconds; the mod panel sees them at once),
  then saves the permanent copy in GitHub as a backup. Pictures are saved in parallel and load from GitHub's file server.
- **Hand-editing `site-data.js` on GitHub?** The live copy will not notice. In the mod panel open PUBLISH and click
  **SYNC FROM GITHUB**, which copies the GitHub version into the live copy.
- Costs: one KV read per page view (cached 10 seconds), well inside the free plan for a small site.

## GIFs and video files

- **GIFs** keep their animation: they are uploaded as they are (not shrunk) and used as a picture link.
- **Video**: upload an **MP4 or WebM** (up to 95 MB) in a Video element; it plays on the page, optionally on
  silent repeat like a GIF. Other formats (MOV, AVI, MKV) do not play in browsers, so convert them first.
- Both are stored in the **downloads** GitHub release, like game downloads.

## Community (forum, comments, reviews)

Needs a Cloudflare D1 database bound as `DB`. Without it the rest of the service still works and the community shows "offline".

1. `wrangler d1 create stillmark-community`
2. Add to wrangler.toml: `[[d1_databases]]` with `binding = "DB"`, the database name and the id it printed.
3. `wrangler d1 execute stillmark-community --remote --file=schema.sql`
4. `wrangler deploy` (worker.js imports community.js, so keep both files together).

Visitors have no accounts. People are told apart only by a private fingerprint (a hash of their address plus the mod code), used for rate limits, one like per person, and bans. Moderate from the mod panel's COMMUNITY tab. Add a COMMENTS, FORUM or LATEST THREADS block in the page builder; the forum itself is community.html.

### Member accounts
Name and password only (no email, so nothing third-party). Passwords are stored as salted PBKDF2 hashes, login sessions last 30 days, and a forgotten password is reset by a moderator (mod panel > COMMUNITY > MEMBERS > NEW PASSWORD). A registered name cannot be used by guests. Members can add a picture, an about-me, a contact (only moderators see it) and join the early access list; moderators can filter that list and download it as a CSV.
For a database made before accounts existed, run `migrate-accounts.sql` once, then `schema.sql` again (see the file's comments). accounts.js must be deployed next to worker.js and community.js.

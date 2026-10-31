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
   | Text   | `REPO`           | `joh71022-cmyk/HOLLOWBLADEINDUSTRIES` |
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

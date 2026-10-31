# Publish service (keeps the GitHub token secret)

The mod panel normally needs a GitHub token to publish. A token is dangerous to hand around, so this
small free service holds it instead. The token is stored as a **secret** on Cloudflare and never reaches
a browser. Mods only need a **publish passphrase**, which can change the site's content and nothing else
(the service only accepts `site-data.js` and pictures in `uploads/`).

## One-time setup (about 10 minutes, free)

1. Make a free account at https://dash.cloudflare.com (no card needed).
2. Go to **Workers & Pages** > **Create** > **Create Worker**. Name it `hollowblade-publish` and click **Deploy**.
3. Click **Edit code**. Delete what is there, paste in the whole of `worker.js` from this folder, then **Deploy**.
4. Open the worker's **Settings** > **Variables and Secrets** and add these four:

   | Type   | Name           | Value |
   |--------|----------------|-------|
   | Secret | `GITHUB_TOKEN` | your fine-grained GitHub token (Contents: Read and write, only this repo) |
   | Secret | `MOD_PASSCODE` | a long publish passphrase you invent (several random words is great) |
   | Text   | `REPO`         | `joh71022-cmyk/HOLLOWBLADEINDUSTRIES` |
   | Text   | `ALLOWED_ORIGIN` | `https://joh71022-cmyk.github.io` |

   Paste the token ONLY into that secret box. Never into chat, a file, or the website.
5. Deploy again if it asks. Copy the worker's address (looks like
   `https://hollowblade-publish.yourname.workers.dev`).
6. In the mod panel open **PUBLISH**, paste the address under "USE A PUBLISH SERVICE", and click **USE THIS SERVICE**.
   (Or give the address to whoever maintains the site so it can be built in for everyone.)

From then on, publishing only asks for the publish passphrase.

## Good to know

- **Changing the passphrase / kicking someone out:** change the `MOD_PASSCODE` secret. Old passphrase stops working at once.
- **Token expired:** make a new token on GitHub and replace only the `GITHUB_TOKEN` secret. Nothing else changes.
- **Wrong passphrase attempts** are slowed down by a second each, so use a long passphrase.
- The service allows requests only from your site (`ALLOWED_ORIGIN`) and `localhost` for testing.

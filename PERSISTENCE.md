# Fixing data loss on Render (persistent storage via GitHub)

## The problem
Render's free tier uses an ephemeral disk. Every time the container restarts
(a new deploy, or waking up after being asleep for a while), any file the
server wrote to disk — including `data.json`, your list of sites — gets reset.
That's why your sites disappeared after leaving your PC off for a while: the
service went to sleep, then came back on a fresh container with a fresh
(empty) disk.

## The fix
The server now stores its data as a file **inside your GitHub repo** via the
GitHub API, instead of (only) on Render's local disk. GitHub is free, never
resets, and you already have an account. Local disk is still used as a fast
read cache, but GitHub is the actual source of truth for every write.

## Setup

### 1. Create a GitHub Personal Access Token
Go to GitHub → Settings → Developer settings → Personal access tokens →
**Fine-grained tokens** → Generate new token.
- **Repository access**: only select your `killer` repo (least privilege).
- **Permissions** → Repository permissions → **Contents**: set to **Read and write**.
- Generate, then copy the token — you won't be able to see it again.

(A classic token with the `repo` scope also works, but the fine-grained,
repo-scoped token above is safer since it can't touch your other repos.)

### 2. Add environment variables on Render
In your Render service → **Environment** tab, add:

| Key | Value |
|---|---|
| `GITHUB_TOKEN` | the token you just generated |
| `GITHUB_REPO` | `Hani19982017/killer` (your `owner/repo`) |
| `GITHUB_FILE_PATH` | `server/data.json` — since your repo has the server code inside a `server/` folder, this is the correct path relative to the repo root. If you restructure later, update this to match. |
| `GITHUB_BRANCH` | `main` |

Keep your existing `ADMIN_TOKEN` variable as-is.

### 3. Redeploy
Render redeploys automatically when you save environment variable changes.
Check the **Logs** tab — on startup you should see:
```
Storage backend: GitHub (Hani19982017/killer, file: server/data.json)
Loaded 0 site(s).
```
(0 is expected the first time, since the sites you had were lost when the
disk reset — you'll need to re-add them once, through Electron, as before.)

### 4. Verify persistence
1. Add a test site through Electron.
2. Check `server/data.json` in your GitHub repo — refresh the page, you
   should see a new commit updating that file with the site's data.
3. On Render, manually trigger a redeploy (Manual Deploy → Deploy latest commit).
4. After it finishes, refresh Electron — the test site should still be there.

## Note on re-adding your existing sites
Because the previous local-disk data is gone, any WordPress/Shopify/static
sites you'd already wired up with an old `id`/`key` pair will now get a
`404 unknown site` response (the server fails open, so those sites stay
visible/online — they just won't respond to future on/off toggles). You'll
need to re-add each one through Electron and re-download/re-install its
config file with the new `id`/`key`, following the same steps as before.

# dmto portfolio

A static site (built with [Eleventy](https://www.11ty.dev/)) with a built-in
admin panel ([Sveltia CMS](https://github.com/sveltia/sveltia-cms)) at
`/admin`. Hosting is free on GitHub Pages; the only recurring cost is your
domain registration itself.

Nothing on the public site links to `/admin` — visitors won't stumble onto
it. It isn't secret, though: what actually protects your content is that
saving a change requires signing in with a GitHub account that has write
access to this repo.

## How it fits together

- **Eleventy** turns the Markdown files in `src/` into the HTML pages that
  get published.
- **Sveltia CMS** (`/admin`) is a friendly form-based editor. When you save
  something there, it commits the change directly to this GitHub repo.
- **GitHub Actions** (`.github/workflows/deploy.yml`) notices that commit,
  rebuilds the site, and publishes it — usually live within a minute.
  This applies whether the commit came from the CMS or from you pushing
  code changes.

So the full loop is: edit in `/admin` → commit → Action rebuilds → site
updates. You never manually "publish" anything.

## One-time setup

### 1. Create the GitHub repository

1. On GitHub, create a new **public** repository (public is required for
   free GitHub Pages hosting on a personal account).
2. Push this project to it:
   ```
   cd dmto-portfolio
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
   git push -u origin main
   ```

### 2. Point the CMS at your repo

Open `admin/config.yml` and change:
```yaml
backend:
  name: github
  repo: YOUR-GITHUB-USERNAME/YOUR-REPO-NAME
```
to your actual username and repo name, then commit and push that change.

### 3. Turn on GitHub Pages

In your repo: **Settings → Pages → Build and deployment → Source**, choose
**GitHub Actions**. That's it — the workflow already in this repo
(`.github/workflows/deploy.yml`) will build and deploy automatically on
your next push. Watch progress under the **Actions** tab. Once it finishes,
your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/`.

This URL puts the site in a subfolder (`/YOUR-REPO-NAME/`) rather than at
a domain's root, so the workflow currently builds with Eleventy's
`--pathprefix` flag to make every internal link and asset path account
for that subfolder. **Once you connect a custom domain (next step),
remove that flag** — open `.github/workflows/deploy.yml`, find the
`Build the site` step, and change:
```
run: npx eleventy --pathprefix=/YOUR-REPO-NAME/
```
to:
```
run: npm run build
```
then commit and push. A custom domain serves the site at its own root, so
the prefix would otherwise leave every link one folder off.

### 4. Connect your custom domain

1. Buy the domain wherever you like (GoDaddy, etc.).
2. In your repo: **Settings → Pages → Custom domain**, type your domain
   (e.g. `junedoe.com`), and save. (Because this repo publishes via
   GitHub Actions, you do this here in Settings — not by adding a CNAME
   file to the repo.)
3. At your domain registrar, add the DNS records GitHub asks for:
   - For an apex domain (`junedoe.com`): four **A** records pointing to
     GitHub Pages' IP addresses.
   - For a `www` subdomain: a **CNAME** record pointing to
     `YOUR-USERNAME.github.io`.
   - GitHub's own instructions (linked from that same Settings → Pages
     screen) list the exact current IPs and record types — use those, as
     they're the authoritative source.
4. DNS can take anywhere from a few minutes to a few hours to propagate.
   Once GitHub verifies it, tick **Enforce HTTPS**.

### 5. Create your GitHub access token (for logging into /admin)

1. On GitHub: **Settings (your account) → Developer settings → Personal
   access tokens → Fine-grained tokens → Generate new token**.
2. Give it a name, set **Repository access** to **Only select
   repositories** → choose this repo.
3. Under **Permissions → Repository permissions**, set **Contents** to
   **Read and write**.
4. Generate it and copy the token somewhere safe (GitHub only shows it
   once — a password manager is a good place for it).

You won't need to touch the Cloudflare/OAuth-proxy setup some Decap/Sveltia
tutorials mention — that's only necessary if multiple people need to log
in. As the sole editor, the token above is all you need.

## Day-to-day use

1. Go to `https://your-domain.com/admin` (or the `github.io` URL if you
   haven't connected a domain yet).
2. Click **Sign In with Token**, paste the token from step 5 above.
3. You'll see three sections:
   - **Projects** — add, edit, reorder, or delete project pages. Each has
     a title, category, date, description, and a gallery (drag in
     images — they're uploaded straight into the repo).
   - **Pages → About** — your bio, education, publications, skills.
   - **Pages → Contact** — your note, email, phone, Instagram link.
4. Hit **Save** (technically **Publish**, top right of the entry). Within
   about a minute, the change is live.

## Working on it locally

```
npm install
npm start
```
This runs the site at `http://localhost:8080` with live-reload, so you can
see CSS/template changes instantly. `npm run build` produces the same
`_site/` output the live workflow builds — useful for checking your work
before pushing.

## Where things live

```
src/
  index.njk            → homepage (loops over every project automatically)
  about.md              → About page content (edit here or via /admin)
  contact.md             → Contact page content (edit here or via /admin)
  projects/
    projects.json         → default template settings for every project
    example-project.md    → a sample project; edit or delete freely
  _includes/layouts/       → the templates that control page structure
  assets/css/style.css    → the entire visual design, in one file
  assets/js/main.js        → the gallery click-to-enlarge behaviour
admin/
  index.html, config.yml   → the /admin panel and what it can edit
.github/workflows/deploy.yml → builds + publishes on every push
```

Every template file has comments at the top explaining what it does — a
good place to start if you want to change the layout later.

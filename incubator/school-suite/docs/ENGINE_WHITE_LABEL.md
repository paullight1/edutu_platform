# Reproducible brand overlay for both school ERP source checkouts

The two upstream repositories are pinned as submodules under upstream/. This overlay **does not remove upstream licenses** or copy source into the Edutu application. It is a development customization experiment on top of isolated checkouts.

## 1. Retrieve both engines

From the Edutu repository root, on the SchoolSuite development branch:

    git submodule update --init --recursive -- incubator/school-suite/upstream/skuul incubator/school-suite/upstream/gegok12

## 2. Brand each engine independently

For Skuul (first integration candidate):

    python3 incubator/school-suite/scripts/brand_upstream.py --engine skuul --name "Evolve Academy" --initials EA --accent "#e67436" --currency NGN --timezone Africa/Lagos

For GegoK12 (separate comparison engine):

    python3 incubator/school-suite/scripts/brand_upstream.py --engine gegok12 --name "Evolve Academy" --initials EA --accent "#e67436" --currency NGN --timezone Africa/Lagos

A small, generated SVG school monogram is created at public/brand/school-logo.svg. Branding is configured through each Laravel environment where supported, with targeted, fail-fast template edits to remove *display* hardcoding from known login/logo surfaces.

Important: changing this checkout leaves an intentionally **dirty submodule working tree**. You must move reviewed modifications into a separately maintained fork or patch queue to ship a durable branded ERP. Parent-repo Git commits do not automatically record edits inside a submodule.

Do not run the script on production; it refuses an APP_ENV=production environment. For a live school, install a release tag in a new disposable environment and complete the upstream setup/recovery/security checks. Avoid Skuul V2 -> V3 in-place migrations. Remove GegoK12’s public installer after setup. Do not commit .env, API keys, school records or credentials.

## Known limits

- This first overlay covers app names, Skuul logo/favicon and login copy, and GegoK12 login logo/favicon. Other upstream screens/assets may still reference their original product.
- It does not install PHP, databases or app dependencies and does not validate full user journeys.
- A production SaaS must manage branding per verified tenant, not by changing one global .env for every school.
- Skuul is a Laravel/Livewire system with server-side session authorization. It does not expose a general open student-record REST API from the inspected v3.1.2 routes. Any portal bridge must implement a verified backend adapter rather than scraping pages or connecting directly to database tables.
- Preserve MIT copyright and license notices and record upstream updates.

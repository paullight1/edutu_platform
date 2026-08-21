-- Authoritative scholarship-source bootstrap.
--
-- Aggregators remain useful discovery inputs, but official issuers receive the
-- highest crawl tier so the engine can discover and verify programmes closer
-- to the source. ON CONFLICT DO NOTHING preserves any administrator-tuned row.

insert into public.scraping_sources (
  name,
  url,
  description,
  category,
  tier,
  priority,
  enabled,
  config
)
values
  (
    'DAAD Scholarship Database',
    'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/',
    'Official DAAD scholarship database for international students and researchers.',
    'scholarship',
    1,
    1,
    true,
    '{"item_selector":"article, .search-result, .result-list li, .list-group-item","title_selector":"h2, h3, h4, .headline","link_selector":"a[href]","content_selectors":["main","article",".content"]}'::jsonb
  ),
  (
    'Chevening Scholarships',
    'https://www.chevening.org/scholarships/',
    'Official UK Government Chevening scholarship programme pages.',
    'scholarship',
    1,
    2,
    true,
    '{"item_selector":"article, .card, .listing-item, main section","title_selector":"h2, h3, h4","link_selector":"a[href*=''scholarship''], a[href*=''apply''], a[href]","content_selectors":["main","article",".content"]}'::jsonb
  ),
  (
    'Erasmus Mundus Joint Masters',
    'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters',
    'Official European Commission Erasmus Mundus Joint Masters scholarship information.',
    'scholarship',
    1,
    3,
    true,
    '{"item_selector":"article, main section, .ecl-card","title_selector":"h2, h3, h4","link_selector":"a[href]","content_selectors":["main","article"]}'::jsonb
  ),
  (
    'Commonwealth Scholarships',
    'https://cscuk.fcdo.gov.uk/about-us/scholarships-and-fellowships/',
    'Official Commonwealth Scholarship Commission scholarship and fellowship programmes.',
    'scholarship',
    1,
    4,
    true,
    '{"item_selector":"article, main section, .entry-content section","title_selector":"h2, h3, h4, h5","link_selector":"a[href]","content_selectors":["main","article",".entry-content"]}'::jsonb
  )
on conflict (url) do nothing;

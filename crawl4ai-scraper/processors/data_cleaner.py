import re
from datetime import datetime, timedelta
from typing import Any, Optional

SOURCE_BRAND_RE = re.compile(
    r'\b(?:dixcoverhubx|dixcover\s*hubx|opportunities\s*circle|oya\s*opportunities|scholars4dev|global\s*scholar\s*desk|scholarship\s*portal|jobs\.smartyacad\.com)\b',
    re.I,
)
SCRAPER_ARTIFACT_RE = re.compile(
    r'\b(?:by\s+admin|posted\s+by|written\s+by|read\s+more|continue\s+reading|leave\s+a\s+comment|comments?|share\s+this|related\s+posts?)\b',
    re.I,
)


class DataCleaner:
    def __init__(self):
        self.currency_map = {
            '$': 'USD',
            '€': 'EUR',
            '£': 'GBP',
            '¥': 'JPY',
            '₹': 'INR',
            'A$': 'AUD',
            'C$': 'CAD',
        }

    def clean(self, item: dict[str, Any]) -> dict[str, Any]:
        cleaned = {
            'title': self._clean_title(item.get('title', '')),
            'organization': self._clean_organization(item.get('organization', '')),
            'category': self._clean_category(item.get('category', 'General')),
            'deadline': self._clean_deadline(item.get('deadline')),
            'location': self._clean_location(item.get('location', 'Worldwide')),
            'description': self._clean_description(item.get('description', '')),
            'requirements': self._clean_list(item.get('requirements', [])),
            'benefits': self._clean_list(item.get('benefits', [])),
            'applicationProcess': [],
            'applyUrl': self._clean_url(item.get('apply_url', '')),
            'amount': self._clean_amount(item.get('amount')),
            'currency': self._detect_currency(item.get('amount', '')),
            'source': item.get('source', 'Unknown'),
            'source_url': item.get('source_url'),
            'match': self._calculate_match(item),
        }

        cleaned['difficulty'] = self._assess_difficulty(item)
        cleaned['aiTags'] = self._generate_tags(item)
        cleaned['canonicalCategory'] = self._canonical_category({**item, **cleaned})

        return cleaned

    def _clean_title(self, title: str) -> str:
        if not title:
            return "Untitled Scholarship"
        title = re.sub(r'\s+', ' ', title)
        title = title.strip()
        title = re.sub(r'^[▸\-\*>•✓✔]+\s*', '', title)
        title = re.sub(r'\s*[▸\-\*>•✓✔]+$', '', title)
        return title[:200]

    def _clean_organization(self, org: str) -> str:
        if not org:
            return "Unknown Organization"
        org = re.sub(r'^\s*by\s+', '', org, flags=re.I)
        org = self._scrub_scraper_artifacts(org)
        if not org or SOURCE_BRAND_RE.search(org):
            return "Program Organizer"
        return org[:100]

    def _clean_category(self, category: str) -> str:
        if not category:
            return "General"
        category = category.strip().title()
        valid = ["Computer Science", "Engineering", "Business", "Medical", "Arts", "Law", "Science", "Education", "General"]
        return category if category in valid else "General"

    def _clean_deadline(self, deadline: Optional[str]) -> Optional[str]:
        if not deadline:
            return None

        try:
            dt = datetime.strptime(deadline, '%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass

        return None

    def _clean_location(self, location: str) -> str:
        if not location:
            return "Worldwide"

        location = location.strip()

        remote_patterns = ['remote', 'online', 'virtual', 'worldwide', 'anywhere', 'global']
        if any(p in location.lower() for p in remote_patterns):
            return "Remote"

        if len(location) > 50:
            location = location[:50]

        return location

    def _clean_description(self, desc: str) -> str:
        if not desc:
            return ""
        desc = re.sub(r'\s+', ' ', desc)
        desc = desc.strip()
        desc = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', desc)
        return self._scrub_scraper_artifacts(desc)[:5000]

    def _clean_list(self, items: list) -> list[str]:
        if not isinstance(items, list):
            items = [items]

        cleaned = []
        for item in items:
            if isinstance(item, str):
                item = self._scrub_scraper_artifacts(item.strip())
                if item and len(item) > 2 and not self._is_scraper_artifact(item):
                    cleaned.append(item[:500])

        return cleaned[:20]

    def _clean_url(self, url: str) -> str:
        if not url:
            return ""

        url = url.strip()

        if not url.startswith(('http://', 'https://')):
            return ""

        return url[:500]

    def _normalize_url(self, url: str) -> str:
        clean = self._clean_url(url)
        if not clean:
            return ""
        return clean.split('?')[0].split('#')[0].rstrip('/').lower()

    def _scrub_scraper_artifacts(self, text: str) -> str:
        if not text:
            return ""
        text = re.sub(r'\bBy\s+Admin\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b', ' ', text)
        text = re.sub(r'\bBy\s+Admin\b', ' ', text, flags=re.I)
        text = re.sub(r'\b(?:posted|written)\s+by\s+[^.]{1,60}', ' ', text, flags=re.I)
        text = SOURCE_BRAND_RE.sub('the official organizer', text)
        text = SCRAPER_ARTIFACT_RE.sub(' ', text)
        text = re.sub(r'\s+([,.;:])', r'\1', text)
        text = re.sub(r'\s{2,}', ' ', text)
        return text.strip()

    def _is_scraper_artifact(self, text: str) -> bool:
        return bool(SOURCE_BRAND_RE.search(text) or SCRAPER_ARTIFACT_RE.search(text))

    def _clean_amount(self, amount: Optional[str]) -> Optional[int]:
        if not amount:
            return None

        amount_str = str(amount)
        numbers = re.findall(r'[\d,]+(?:\.\d{2})?', amount_str)
        if not numbers:
            return None

        number_str = numbers[0].replace(',', '')
        try:
            value = float(number_str)
            return int(value)
        except ValueError:
            return None

    def _detect_currency(self, amount: Optional[str]) -> str:
        if not amount:
            return "USD"

        amount_str = str(amount)
        for symbol, currency in self.currency_map.items():
            if symbol in amount_str:
                return currency

        return "USD"

    def _calculate_match(self, item: dict[str, Any]) -> int:
        score = 50

        if item.get('title'):
            title_lower = item['title'].lower()
            if any(w in title_lower for w in ['scholarship', 'fellowship', 'grant', 'award']):
                score += 20

        if item.get('amount'):
            score += 10

        if item.get('deadline'):
            score += 10

        if item.get('apply_url'):
            score += 10

        return min(100, score)

    def _assess_difficulty(self, item: dict[str, Any]) -> str:
        difficulty_indicators = {
            'Easy': ['high school', 'undergraduate', 'freshman', 'sophomore'],
            'Medium': ['graduate', 'master', 'gpa', '3.0', '2.5'],
            'Hard': ['phd', 'doctoral', 'research', 'postdoc', 'fellowship'],
        }

        text = f"{item.get('title', '')} {item.get('description', '')}".lower()

        for diff, indicators in difficulty_indicators.items():
            if any(ind in text for ind in indicators):
                return diff

        return "Medium"

    def _generate_tags(self, item: dict[str, Any]) -> list[str]:
        tags = []

        title_desc = f"{item.get('title', '')} {item.get('description', '')} {item.get('category', '')}".lower()

        if 'women' in title_desc or 'female' in title_desc:
            tags.append('Women')
        if 'minority' in title_desc or 'underrepresented' in title_desc:
            tags.append('Minority')
        if 'first generation' in title_desc:
            tags.append('First Generation')
        if 'international' in title_desc or 'overseas' in title_desc:
            tags.append('International')
        if 'stem' in title_desc:
            tags.append('STEM')
        if 'study abroad' in title_desc:
            tags.append('Study Abroad')
        if 'renewable' in title_desc:
            tags.append('Renewable')

        if item.get('deadline'):
            try:
                dt = datetime.strptime(item['deadline'], '%Y-%m-%d')
                days_until = (dt - datetime.now()).days
                if days_until > 30:
                    tags.append('Open')
                elif days_until > 0:
                    tags.append('Closing Soon')
                else:
                    tags.append('Expired')
            except:
                pass

        return list(set(tags))[:5]

    def _canonical_category(self, item: dict[str, Any]) -> str:
        category_keywords = {
            'scholarships': [
                'scholarship', 'scholarships', 'scholar', 'scholars', 'grant', 'grants',
                'bursary', 'bursaries', 'tuition', 'financial aid', 'fully funded',
                'funded', 'funding', 'stipend', 'award',
            ],
            'careers': [
                'career', 'careers', 'internship', 'internships', 'intern', 'job', 'jobs',
                'employment', 'vacancy', 'vacancies', 'role', 'roles', 'graduate trainee',
                'trainee', 'apprenticeship', 'apprentice',
            ],
            'leadership': [
                'leadership', 'leader', 'leaders', 'fellowship', 'fellowships', 'fellow',
                'mentorship', 'mentor', 'ambassador', 'volunteer', 'community',
                'changemaker', 'civic', 'social impact',
            ],
            'global_programs': [
                'global', 'international', 'worldwide', 'abroad', 'exchange', 'conference',
                'summit', 'bootcamp', 'accelerator', 'program', 'programme', 'remote',
            ],
        }
        priority = ['scholarships', 'careers', 'leadership', 'global_programs']
        text_parts = [
            item.get('title', ''),
            item.get('organization', ''),
            item.get('category', ''),
            item.get('location', ''),
            item.get('description', ''),
            ' '.join(item.get('requirements', []) or []),
            ' '.join(item.get('benefits', []) or []),
            ' '.join(item.get('aiTags', []) or []),
        ]
        text = ' '.join(str(part) for part in text_parts if part).lower()

        scores = {}
        for category, keywords in category_keywords.items():
            score = 0
            for keyword in keywords:
                if keyword in text:
                    score += 2 if ' ' in keyword else 1
            if score:
                scores[category] = score

        if not scores:
            return 'other'

        return sorted(scores.items(), key=lambda item: (-item[1], priority.index(item[0])))[0][0]

    def is_valid(self, item: dict[str, Any]) -> bool:
        if not item.get('title') or len(item['title']) < 5:
            return False

        if item['title'] == "Untitled Scholarship":
            return False

        if item.get('deadline'):
            try:
                dt = datetime.strptime(item['deadline'], '%Y-%m-%d')
                if dt < datetime.now() - timedelta(days=1):
                    return False
            except:
                pass

        return True

    def deduplicate(self, items: list[dict[str, Any]], existing_urls: set[str]) -> list[dict[str, Any]]:
        unique_items = []
        seen_titles = set()

        for item in items:
            title_key = item.get('title', '').lower().strip()
            url = self._normalize_url(item.get('applyUrl', ''))

            if url and url in existing_urls:
                continue

            if title_key in seen_titles:
                continue

            if self.is_valid(item):
                unique_items.append(item)
                seen_titles.add(title_key)
                if url:
                    existing_urls.add(url)

        return unique_items

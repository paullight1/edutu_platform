import re
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag


class ScholarshipExtractor:
    AMOUNT_PATTERNS = [
        r'\$[\d,]+(?:\.\d{2})?',
        r'USD\s*[\d,]+',
        r'€[\d,]+',
        r'£[\d,]+',
        r'[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP)',
    ]

    DATE_PATTERNS = [
        (r'(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})', '%m/%d/%Y'),
        (r'(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})', '%m/%d/%Y'),
        (r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', '%B %d, %Y'),
        (r'(\d{1,2})\s+(\w+)\s+(\d{4})', '%d %B %Y'),
    ]

    NOISE_TEXT_RE = re.compile(
        r'^(?:advertisement|advertorial|sponsored content|share this(?: post)?|privacy policy|cookie policy|read more|apply now|click here|subscribe|join our whatsapp).?$',
        re.I,
    )
    NOISE_CLASS_RE = re.compile(
        r'advert|promo|sponsor|social|share|related|newsletter|cookie|privacy|nav|menu|sidebar|footer',
        re.I,
    )

    def __init__(self):
        self._amount_regex = re.compile('|'.join(self.AMOUNT_PATTERNS), re.IGNORECASE)
        self._email_regex = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self._url_regex = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+')

    def extract_from_html(
        self,
        html: str,
        source: str,
        source_url: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        soup = BeautifulSoup(html, 'html.parser')

        items: list[dict[str, Any]] = []
        cards = soup.find_all(
            ['article', 'div', 'li'],
            class_=re.compile(r'scholarship|opportunity|post|listing|item', re.I),
        )

        if not cards:
            cards = soup.find_all(['article', 'div'], recursive=True)

        for card in cards[:50]:
            item = self._extract_card(card, source, source_url)
            if item and item.get('title'):
                items.append(item)

        if not items:
            text = soup.get_text('\n', strip=True)
            main_title = soup.find('h1')
            if main_title:
                items.append({
                    'title': main_title.get_text(' ', strip=True),
                    'organization': source,
                    'source': source,
                    'source_url': source_url,
                    'description': text[:5000] if text else '',
                })

        return items

    def _extract_card(
        self,
        card: Tag,
        source: str,
        source_url: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        title_elem = card.find(
            ['h1', 'h2', 'h3', 'h4'],
            class_=re.compile(r'title|name', re.I),
        )
        if not title_elem:
            title_elem = card.find(['h1', 'h2', 'h3', 'h4'])
        if not title_elem:
            title_elem = card.find('a')

        title = title_elem.get_text(' ', strip=True) if title_elem else ''
        if not title or len(title) < 5:
            return None

        link = self._find_apply_link(card)
        apply_url = urljoin(source_url or '', str(link.get('href', ''))) if link else ''

        card_text = card.get_text('\n', strip=True)
        description = self._extract_description(card)

        return {
            'title': title,
            'apply_url': apply_url,
            'amount': self._extract_amount(card_text),
            'deadline': self._extract_deadline(card_text),
            'description': description,
            'requirements': self._extract_requirements(card),
            'benefits': self._extract_benefits(card),
            'application_process': self._extract_application_process(card),
            'organization': self._extract_organization(card, source),
            'source': source,
            'source_url': source_url,
            'location': self._extract_location(card),
            'category': self._categorize(title, description),
        }

    def _find_apply_link(self, card: Tag) -> Optional[Tag]:
        links = card.find_all('a', href=True)
        for link in links:
            label = link.get_text(' ', strip=True)
            href = str(link.get('href', ''))
            if re.search(r'\b(?:apply|application|register|submit)\b', f'{label} {href}', re.I):
                return link
        return links[0] if links else None

    def _extract_amount(self, text: str) -> Optional[str]:
        match = self._amount_regex.search(text)
        return match.group(0) if match else None

    def _extract_deadline(self, text: str) -> Optional[str]:
        deadline_patterns = [
            r'deadline[:\s]*([^\n]+)',
            r'due[:\s]*([^\n]+)',
            r'application\s+close[s]?[:\s]*([^\n]+)',
            r'last\s+date[:\s]*([^\n]+)',
            r'closes?\s+(?:on\s+)?([^\n]+)',
        ]

        for pattern in deadline_patterns:
            match = re.search(pattern, text, re.I)
            if match:
                parsed = self._parse_date(match.group(1).strip())
                if parsed:
                    return parsed
        return None

    def _parse_date(self, date_str: str) -> Optional[str]:
        value = re.sub(r'\s+', ' ', date_str.strip())
        if not value:
            return None

        numeric = re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b', value)
        if numeric:
            month, day, year = numeric.groups()
            year_value = int(year)
            if year_value < 100:
                year_value += 2000
            try:
                return datetime(year_value, int(month), int(day)).strftime('%Y-%m-%d')
            except ValueError:
                pass

        month_first = re.search(
            r'\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b',
            value,
            re.I,
        )
        if month_first:
            month_name, day, year = month_first.groups()
            for fmt in ('%B %d %Y', '%b %d %Y'):
                try:
                    return datetime.strptime(
                        f'{month_name} {day} {year}',
                        fmt,
                    ).strftime('%Y-%m-%d')
                except ValueError:
                    continue

        day_first = re.search(
            r'\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})\b',
            value,
            re.I,
        )
        if day_first:
            day, month_name, year = day_first.groups()
            for fmt in ('%d %B %Y', '%d %b %Y'):
                try:
                    return datetime.strptime(
                        f'{day} {month_name} {year}',
                        fmt,
                    ).strftime('%Y-%m-%d')
                except ValueError:
                    continue

        months = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2,
            'mar': 3, 'march': 3, 'apr': 4, 'april': 4, 'may': 5,
            'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
            'aug': 8, 'august': 8, 'sep': 9, 'sept': 9,
            'september': 9, 'oct': 10, 'october': 10,
            'nov': 11, 'november': 11, 'dec': 12, 'december': 12,
        }
        lower = value.lower()
        for month_name, month_num in months.items():
            if re.search(rf'\b{re.escape(month_name)}\b', lower):
                year_match = re.search(r'20\d{2}', value)
                if year_match:
                    return f"{year_match.group(0)}-{month_num:02d}-01"
        return None

    def _clean_content_container(self, container: Tag) -> Tag:
        clone_soup = BeautifulSoup(str(container), 'html.parser')
        clone = clone_soup.find()
        if clone is None:
            return container

        for node in clone.find_all(['script', 'style', 'nav', 'aside', 'footer', 'form', 'noscript']):
            node.decompose()
        for node in clone.find_all(class_=self.NOISE_CLASS_RE):
            node.decompose()
        return clone

    def _meaningful_text(self, value: str) -> bool:
        text = re.sub(r'\s+', ' ', value).strip()
        return len(text) >= 15 and not self.NOISE_TEXT_RE.match(text)

    def _extract_description(self, card: Tag) -> str:
        content = card.find(
            ['article', 'section', 'div'],
            class_=re.compile(r'desc|summary|content|body|overview', re.I),
        )
        root = self._clean_content_container(content or card)

        paragraphs: list[str] = []
        seen: set[str] = set()
        for paragraph in root.find_all('p'):
            text = re.sub(r'\s+', ' ', paragraph.get_text(' ', strip=True)).strip()
            key = re.sub(r'[^a-z0-9]+', ' ', text.lower()).strip()
            if not self._meaningful_text(text) or not key or key in seen:
                continue
            seen.add(key)
            paragraphs.append(text)

        if paragraphs:
            return '\n\n'.join(paragraphs)[:5000]

        lines: list[str] = []
        for line in root.get_text('\n', strip=True).split('\n'):
            text = re.sub(r'\s+', ' ', line).strip()
            if self._meaningful_text(text):
                lines.append(text)
        return '\n\n'.join(lines[:12])[:5000]

    def _extract_section_items(
        self,
        card: Tag,
        class_pattern: re.Pattern,
        heading_pattern: re.Pattern,
        limit: int = 8,
    ) -> list[str]:
        section = card.find(['div', 'section', 'ul', 'ol'], class_=class_pattern)
        if section:
            items = [
                re.sub(r'\s+', ' ', item.get_text(' ', strip=True)).strip()
                for item in section.find_all('li')
            ]
            items = [item for item in items if item and not self.NOISE_TEXT_RE.match(item)]
            if items:
                return items[:limit]

        for heading in card.find_all(['h2', 'h3', 'h4', 'h5', 'strong', 'b']):
            label = heading.get_text(' ', strip=True)
            if not heading_pattern.search(label):
                continue

            items: list[str] = []
            sibling = heading.find_next_sibling()
            while sibling is not None:
                if isinstance(sibling, Tag) and sibling.name in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
                    break
                if isinstance(sibling, Tag):
                    for item in sibling.find_all('li'):
                        text = re.sub(r'\s+', ' ', item.get_text(' ', strip=True)).strip()
                        if text and not self.NOISE_TEXT_RE.match(text):
                            items.append(text)
                    if sibling.name == 'li':
                        text = re.sub(r'\s+', ' ', sibling.get_text(' ', strip=True)).strip()
                        if text and not self.NOISE_TEXT_RE.match(text):
                            items.append(text)
                sibling = sibling.find_next_sibling()
                if len(items) >= limit:
                    break
            if items:
                return items[:limit]
        return []

    def _extract_requirements(self, card: Tag) -> list[str]:
        items = self._extract_section_items(
            card,
            re.compile(r'requir|elig|criter', re.I),
            re.compile(r'eligibility|requirements?|who can apply|criteria', re.I),
        )
        if items:
            return items

        text = card.get_text(' ', strip=True)
        fallback: list[str] = []
        gpa_match = re.search(r'gpa[:\s]*(\d+\.?\d*)', text, re.I)
        if gpa_match:
            fallback.append(f"Minimum GPA: {gpa_match.group(1)}")
        year_match = re.search(r'(\d+(?:st|nd|rd|th)\s+year)', text, re.I)
        if year_match:
            fallback.append(year_match.group(1))
        return fallback

    def _extract_benefits(self, card: Tag) -> list[str]:
        return self._extract_section_items(
            card,
            re.compile(r'benefit|award|cover|fund', re.I),
            re.compile(r'benefits?|award|funding|what is covered|what you(?:\'|’)ll gain', re.I),
        )

    def _extract_application_process(self, card: Tag) -> list[str]:
        return self._extract_section_items(
            card,
            re.compile(r'application|apply|process|steps?', re.I),
            re.compile(r'how to apply|application (?:process|procedure|steps?|instructions)', re.I),
        )

    def _extract_organization(self, card: Tag, default: str) -> str:
        org_elem = card.find(
            ['span', 'div', 'p'],
            class_=re.compile(r'organiz|provider|school|university', re.I),
        )
        return org_elem.get_text(' ', strip=True) if org_elem else default

    def _extract_location(self, card: Tag) -> str:
        loc_elem = card.find(
            ['span', 'div', 'p'],
            class_=re.compile(r'location|place', re.I),
        )
        if loc_elem:
            return loc_elem.get_text(' ', strip=True)

        text = card.get_text('\n', strip=True)
        match = re.search(r'(?:based\s+in|location[:\s]*)([^\n]+)', text, re.I)
        return match.group(1).strip() if match else "Worldwide"

    def _categorize(self, title: str, description: str) -> str:
        text = f"{title} {description}".lower()
        categories = {
            "Computer Science": ["computer science", "computer", "software", "programming", "coding", "tech", "it", "data science"],
            "Engineering": ["engineering", "engineer", "mechanical", "electrical", "civil"],
            "Business": ["business", "mba", "entrepreneurship", "finance", "accounting"],
            "Medical": ["medical", "medicine", "health", "nursing", "pharmacy"],
            "Arts": ["art", "design", "music", "film", "creative", "writing"],
            "Law": ["law", "legal", "jurisprudence"],
            "Science": ["science", "physics", "chemistry", "biology", "mathematics"],
            "Education": ["education", "teaching", "teacher"],
            "General": [],
        }
        for category, keywords in categories.items():
            if keywords and any(keyword in text for keyword in keywords):
                return category
        return "General"

    def extract_from_markdown(self, markdown: str, source: str) -> dict[str, Any]:
        lines = markdown.split('\n')
        title = ''
        amount = None
        deadline = None

        for line in lines[:20]:
            if line.strip() and not title:
                if line.startswith('#'):
                    title = line.lstrip('#').strip()
                elif len(line.strip()) > 10:
                    title = line.strip()

            amount_match = self._amount_regex.search(line)
            if amount_match and not amount:
                amount = amount_match.group(0)

            deadline_match = re.search(r'deadline[:\s]*([^\n]+)', line, re.I)
            if deadline_match and not deadline:
                deadline = self._parse_date(deadline_match.group(1))

        return {
            'title': title,
            'amount': amount,
            'deadline': deadline,
            'description': '\n'.join(lines[:50]),
            'organization': source,
            'source': source,
        }

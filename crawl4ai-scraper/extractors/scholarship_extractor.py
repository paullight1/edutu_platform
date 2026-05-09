import re
from datetime import datetime
from typing import Any, Optional
from bs4 import BeautifulSoup


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
        (r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', '%B %d, %Y'),
    ]

    def __init__(self):
        self._amount_regex = re.compile('|'.join(self.AMOUNT_PATTERNS), re.IGNORECASE)
        self._email_regex = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self._url_regex = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+')

    def extract_from_html(self, html: str, source: str) -> list[dict[str, Any]]:
        soup = BeautifulSoup(html, 'html.parser')

        items = []
        cards = soup.find_all(['article', 'div', 'li'], class_=re.compile(r'scholarship|opportunity|post|listing|item', re.I))

        if not cards:
            cards = soup.find_all(['article', 'div'], recursive=True)

        for card in cards[:50]:
            item = self._extract_card(card, source)
            if item and item.get('title'):
                items.append(item)

        if not items:
            text = soup.get_text()
            main_title = soup.find('h1')
            if main_title:
                items.append({
                    'title': main_title.get_text(strip=True),
                    'organization': source,
                    'source': source,
                    'description': text[:500] if text else '',
                })

        return items

    def _extract_card(self, card: BeautifulSoup, source: str) -> Optional[dict[str, Any]]:
        title_elem = card.find(['h1', 'h2', 'h3', 'h4'], class_=re.compile(r'title|name', re.I))
        if not title_elem:
            title_elem = card.find('a')

        title = title_elem.get_text(strip=True) if title_elem else ''

        if not title or len(title) < 5:
            return None

        link = card.find('a', href=True)
        apply_url = link['href'] if link else ''

        amount = self._extract_amount(card.get_text())
        deadline = self._extract_deadline(card.get_text())
        description = self._extract_description(card)
        requirements = self._extract_requirements(card)
        benefits = self._extract_benefits(card)

        return {
            'title': title,
            'apply_url': apply_url,
            'amount': amount,
            'deadline': deadline,
            'description': description,
            'requirements': requirements,
            'benefits': benefits,
            'organization': self._extract_organization(card, source),
            'source': source,
            'location': self._extract_location(card),
            'category': self._categorize(title, description),
        }

    def _extract_amount(self, text: str) -> Optional[str]:
        match = self._amount_regex.search(text)
        if match:
            return match.group(0)
        return None

    def _extract_deadline(self, text: str) -> Optional[str]:
        text_lower = text.lower()
        deadline_patterns = [
            r'deadline[:\s]*([^\n]+)',
            r'due[:\s]*([^\n]+)',
            r'application\s+close[s]?[:\s]*([^\n]+)',
            r'last\s+date[:\s]*([^\n]+)',
            r'closes?\s+(?:on\s+)?([^\n]+)',
        ]

        for pattern in deadline_patterns:
            match = re.search(pattern, text_lower, re.I)
            if match:
                date_str = match.group(1).strip()
                parsed = self._parse_date(date_str)
                if parsed:
                    return parsed

        return None

    def _parse_date(self, date_str: str) -> Optional[str]:
        date_str = date_str.strip()

        for pattern, fmt in self.DATE_PATTERNS:
            try:
                match = re.search(pattern, date_str, re.I)
                if match:
                    groups = match.groups()
                    if len(groups) == 3:
                        reconstructed = ' '.join(groups)
                        try:
                            dt = datetime.strptime(reconstructed, fmt)
                            return dt.strftime('%Y-%m-%d')
                        except ValueError:
                            try:
                                alt_fmt = fmt.replace('Y', 'y')
                                dt = datetime.strptime(reconstructed, alt_fmt)
                                return dt.strftime('%Y-%m-%d')
                            except ValueError:
                                pass
            except Exception:
                pass

        months = {
            'jan': 1, 'january': 1, 'feb': 2, 'february': 2, 'mar': 3, 'march': 3,
            'apr': 4, 'april': 4, 'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
            'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9, 'oct': 10,
            'october': 10, 'nov': 11, 'november': 11, 'dec': 12, 'december': 12
        }

        for month_name, month_num in months.items():
            if month_name in date_str.lower():
                year_match = re.search(r'20\d{2}', date_str)
                if year_match:
                    return f"{year_match.group(0)}-{month_num:02d}-01"

        return None

    def _extract_description(self, card: BeautifulSoup) -> str:
        desc_elem = card.find(['p', 'div'], class_=re.compile(r'desc|summary|content', re.I))
        if desc_elem:
            return desc_elem.get_text(strip=True)[:1000]

        paragraphs = card.find_all('p')
        if paragraphs:
            text = ' '.join(p.get_text(strip=True) for p in paragraphs[:3])
            return text[:1000]

        return card.get_text(strip=True)[:1000]

    def _extract_requirements(self, card: BeautifulSoup) -> list[str]:
        reqs = []
        req_section = card.find(['div', 'ul'], class_=re.compile(r'requir|elig|criter', re.I))
        if req_section:
            items = req_section.find_all('li')
            reqs = [item.get_text(strip=True) for item in items[:5]]

        if not reqs:
            text = card.get_text()
            gpa_match = re.search(r'gpa[:\s]*(\d+\.?\d*)', text, re.I)
            if gpa_match:
                reqs.append(f"Minimum GPA: {gpa_match.group(1)}")

            year_match = re.search(r'(\d+(?:st|nd|rd|th)\s+year)', text, re.I)
            if year_match:
                reqs.append(year_match.group(1))

        return reqs

    def _extract_benefits(self, card: BeautifulSoup) -> list[str]:
        benefits = []
        benefit_section = card.find(['div', 'ul'], class_=re.compile(r'benefit|award|cover', re.I))
        if benefit_section:
            items = benefit_section.find_all('li')
            benefits = [item.get_text(strip=True) for item in items[:5]]
        return benefits

    def _extract_organization(self, card: BeautifulSoup, default: str) -> str:
        org_elem = card.find(['span', 'div', 'p'], class_=re.compile(r'organiz|provider|school|university', re.I))
        if org_elem:
            return org_elem.get_text(strip=True)
        return default

    def _extract_location(self, card: BeautifulSoup) -> str:
        loc_elem = card.find(['span', 'div', 'p'], class_=re.compile(r'location|place', re.I))
        if loc_elem:
            return loc_elem.get_text(strip=True)

        text = card.get_text()
        us_match = re.search(r'(?:based\s+in|location[:\s]*)([^\n]+)', text, re.I)
        if us_match:
            return us_match.group(1).strip()

        return "Worldwide"

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
            if not keywords:
                continue
            if any(kw in text for kw in keywords):
                return category

        return "General"

    def extract_from_markdown(self, markdown: str, source: str) -> dict[str, Any]:
        lines = markdown.split('\n')
        title = ''
        description = ''
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

        description = '\n'.join(lines[:50])

        return {
            'title': title,
            'amount': amount,
            'deadline': deadline,
            'description': description,
            'organization': source,
            'source': source,
        }

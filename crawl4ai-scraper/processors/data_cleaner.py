import html
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

BLOCK_TAG_RE = re.compile(
    r'</?(?:article|aside|blockquote|br|div|footer|h[1-6]|header|li|main|nav|ol|p|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>',
    re.I,
)
OTHER_TAG_RE = re.compile(r'<[^>]+>')
CONTROL_CHAR_RE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]')
BULLET_PREFIX_RE = re.compile(r'^\s*(?:[-–—•●▪◦*✓✔☑→›»]+|\d+[.)]|[a-z][.)])\s*', re.I)
RAW_URL_RE = re.compile(r'(?:https?://|www\.)\S+', re.I)

NOISE_LINE_PATTERNS = [
    re.compile(r'^(?:advertisement|advertorial|sponsored(?:\s+content)?|promoted(?:\s+content)?)\.?$', re.I),
    re.compile(r'^(?:apply\s*(?:now|here|online)?|click\s+here(?:\s+to\s+apply)?|register\s*(?:now|here)?|start\s+(?:your\s+)?application|visit\s+(?:the\s+)?(?:official\s+)?(?:site|website|portal)|view\s+(?:details|more)|read\s+more|continue\s+reading)\s*[.!»›→-]*$', re.I),
    re.compile(r'^(?:share(?:\s+this(?:\s+(?:post|article|opportunity))?)?|share\s+on\s+.+|related\s+(?:posts?|articles?|opportunities)|you\s+may\s+also\s+like|leave\s+a\s+comment|comments?)\s*[.!:-]*$', re.I),
    re.compile(r'^(?:subscribe|sign\s+up)(?:\s+to|\s+for)?\s+(?:our\s+)?(?:newsletter|mailing\s+list|updates?).*$', re.I),
    re.compile(r'^(?:follow|join)\s+(?:us|our)\s+(?:on\s+)?(?:facebook|instagram|linkedin|x|twitter|tiktok|youtube|whatsapp|telegram)(?:\s+(?:channel|group|community))?.*$', re.I),
    re.compile(r'^(?:join\s+(?:our\s+)?(?:whatsapp|telegram)(?:\s+(?:channel|group|community))?).*$', re.I),
    re.compile(r'^(?:home|about(?:\s+us)?|contact(?:\s+us)?|privacy\s+policy|cookie\s+policy|terms(?:\s+(?:and|&)\s+conditions|\s+of\s+(?:use|service))?|sitemap|login|log\s+in|sign\s+in|menu)(?:\s*[|•·/,:-]\s*(?:home|about(?:\s+us)?|contact(?:\s+us)?|privacy\s+policy|terms|sitemap|login|menu))*$', re.I),
    re.compile(r'^(?:all\s+rights\s+reserved|copyright\s+©?|©)\b.*$', re.I),
    re.compile(r'^(?:by\s+admin|posted\s+by|written\s+by)(?:\s+.+)?$', re.I),
    re.compile(r'^(?:source|photo\s+credit|image\s+credit)\s*:\s*(?:https?://|www\.).+$', re.I),
    re.compile(r'^https?://\S+$', re.I),
    re.compile(r'^www\.\S+$', re.I),
]

SECTION_HEADINGS = {
    'requirements': re.compile(
        r'^(?:eligibility|eligibility\s+criteria|requirements?|who\s+can\s+apply|applicant\s+criteria)\s*:?$',
        re.I,
    ),
    'benefits': re.compile(
        r'^(?:benefits?|what\s+you(?:\'|’)ll\s+gain|award|funding|what\s+is\s+covered)\s*:?$',
        re.I,
    ),
    'application_process': re.compile(
        r'^(?:how\s+to\s+apply|application\s+(?:process|procedure|steps?)|application\s+instructions)\s*:?$',
        re.I,
    ),
}
GENERIC_SECTION_HEADING_RE = re.compile(
    r'^(?:about(?:\s+the\s+(?:opportunity|programme|program))?|overview|description|deadline|important\s+dates?|key\s+information|program(?:me)?\s+details)\s*:?$',
    re.I,
)


class DataCleaner:
    CONTENT_FORMAT_VERSION = 'opportunity-content-v2'

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
        raw_description = str(item.get('description') or '')
        extracted_sections, narrative_source = self._parse_labeled_sections(raw_description)
        description, description_metrics = self._clean_description_with_metrics(narrative_source)

        requirements = self._clean_list(item.get('requirements'))
        if not requirements:
            requirements = self._clean_list(extracted_sections['requirements'])

        benefits = self._clean_list(item.get('benefits'))
        if not benefits:
            benefits = self._clean_list(extracted_sections['benefits'])

        application_process = self._clean_list(
            item.get('applicationProcess') or item.get('application_process'),
        )
        if not application_process:
            application_process = self._clean_list(
                extracted_sections['application_process'],
            )
        summary = self._build_summary(item.get('summary'), description)
        quality_score = self._content_quality_score(
            summary,
            description,
            requirements,
            benefits,
            application_process,
        )

        cleaned = {
            'title': self._clean_title(item.get('title', '')),
            'summary': summary,
            'organization': self._clean_organization(item.get('organization', '')),
            'category': self._clean_category(item.get('category', 'General')),
            'deadline': self._clean_deadline(item.get('deadline')),
            'location': self._clean_location(item.get('location', 'Worldwide')),
            'description': description,
            'requirements': requirements,
            'benefits': benefits,
            'applicationProcess': application_process,
            'applyUrl': self._clean_url(item.get('apply_url') or item.get('applyUrl') or ''),
            'amount': self._clean_amount(item.get('amount')),
            'currency': self._detect_currency(item.get('amount', '')),
            'source': item.get('source', 'Unknown'),
            'source_url': item.get('source_url'),
            'match': self._calculate_match(item),
            'quality_score': quality_score,
            'content_cleaning': {
                'version': self.CONTENT_FORMAT_VERSION,
                'removed_noise': description_metrics['removed_noise'],
                'removed_duplicates': description_metrics['removed_duplicates'],
                'paragraph_count': description_metrics['paragraph_count'],
                'needs_review': quality_score < 65,
            },
        }

        cleaned['difficulty'] = self._assess_difficulty({**item, **cleaned})
        cleaned['aiTags'] = self._generate_tags({**item, **cleaned})
        cleaned['canonicalCategory'] = self._canonical_category({**item, **cleaned})

        return cleaned

    def _clean_title(self, title: str) -> str:
        if not title:
            return "Untitled Scholarship"
        title = re.sub(r'\s+', ' ', str(title)).strip()
        title = re.sub(r'^[▸\-\*>•✓✔]+\s*', '', title)
        title = re.sub(r'\s*[▸\-\*>•✓✔]+$', '', title)
        return title[:200]

    def _clean_organization(self, org: str) -> str:
        if not org:
            return "Unknown Organization"
        org = re.sub(r'^\s*by\s+', '', str(org), flags=re.I)
        org = self._scrub_scraper_artifacts(org)
        if not org or SOURCE_BRAND_RE.search(org):
            return "Program Organizer"
        return org[:100]

    def _clean_category(self, category: str) -> str:
        if not category:
            return "General"
        category = str(category).strip().title()
        valid = ["Computer Science", "Engineering", "Business", "Medical", "Arts", "Law", "Science", "Education", "General"]
        return category if category in valid else "General"

    def _clean_deadline(self, deadline: Optional[str]) -> Optional[str]:
        if not deadline:
            return None

        try:
            dt = datetime.strptime(str(deadline), '%Y-%m-%d')
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass

        return None

    def _clean_location(self, location: str) -> str:
        if not location:
            return "Worldwide"

        location = re.sub(r'\s+', ' ', str(location)).strip()

        remote_patterns = ['remote', 'online', 'virtual', 'worldwide', 'anywhere', 'global']
        if any(p in location.lower() for p in remote_patterns):
            return "Remote"

        return location[:50]

    def _prepare_text(self, value: str) -> str:
        text = html.unescape(str(value or ''))
        text = CONTROL_CHAR_RE.sub('', text)
        text = BLOCK_TAG_RE.sub('\n', text)
        text = OTHER_TAG_RE.sub(' ', text)
        return text.replace('\r\n', '\n').replace('\r', '\n')

    def _section_for_heading(self, text: str) -> Optional[str]:
        for key, pattern in SECTION_HEADINGS.items():
            if pattern.match(text.strip()):
                return key
        return None

    def _parse_labeled_sections(self, description: str) -> tuple[dict[str, list[str]], str]:
        sections = {
            'requirements': [],
            'benefits': [],
            'application_process': [],
        }
        narrative_lines: list[str] = []
        active_section: Optional[str] = None

        for raw_line in self._prepare_text(description).split('\n'):
            line = raw_line.strip()
            if not line:
                continue

            section = self._section_for_heading(line)
            if section:
                active_section = section
                continue
            if GENERIC_SECTION_HEADING_RE.match(line):
                active_section = None
                continue

            is_list_item = bool(BULLET_PREFIX_RE.match(line))
            if active_section and is_list_item:
                sections[active_section].append(BULLET_PREFIX_RE.sub('', line).strip())
                continue

            # A normal prose line ends a bullet section and remains part of the
            # narrative. This avoids swallowing paragraphs after a short list.
            if active_section and not is_list_item:
                active_section = None
            narrative_lines.append(line)

        return sections, '\n'.join(narrative_lines)

    def _is_noise_line(self, text: str) -> bool:
        value = text.strip()
        if not value:
            return True
        if self._section_for_heading(value) or GENERIC_SECTION_HEADING_RE.match(value):
            return True
        return any(pattern.match(value) for pattern in NOISE_LINE_PATTERNS)

    def _clean_inline_noise(self, text: str) -> tuple[str, int]:
        removed = 0
        value = text

        patterns = [
            re.compile(r'\bBy\s+Admin\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b', re.I),
            re.compile(r'\b(?:posted|written)\s+by\s+[^.!?\n]{1,80}[.!?]?', re.I),
            re.compile(r'\b(?:read\s+more|continue\s+reading|share\s+this(?:\s+(?:post|article))?|related\s+posts?)\b', re.I),
            re.compile(r'\b(?:join|follow)\s+(?:our|us\s+on)\s+(?:whatsapp|telegram|facebook|instagram|linkedin|twitter|x)(?:\s+(?:channel|group|community))?[^.!?\n]*[.!?]?', re.I),
        ]
        for pattern in patterns:
            value, count = pattern.subn(' ', value)
            removed += count
        value, count = RAW_URL_RE.subn(' ', value)
        removed += count
        value = re.sub(r'\s+([,.;:!?])', r'\1', value)
        value = re.sub(r'\s{2,}', ' ', value).strip()
        return value, removed

    def _content_key(self, text: str) -> str:
        value = re.sub(r'\b(?:the|a|an)\b', ' ', text.lower())
        return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', value)).strip()

    def _split_sentences(self, text: str) -> list[str]:
        value = re.sub(r'\s+', ' ', text).strip()
        if not value:
            return []
        return [part.strip() for part in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9“"\'])', value) if part.strip()]

    def _group_sentences(self, sentences: list[str]) -> list[str]:
        paragraphs: list[str] = []
        current: list[str] = []
        current_length = 0

        for sentence in sentences:
            next_length = current_length + len(sentence) + (1 if current else 0)
            if current and (len(current) >= 2 or next_length > 320):
                paragraphs.append(' '.join(current))
                current = []
                current_length = 0
            current.append(sentence)
            current_length += len(sentence) + (1 if len(current) > 1 else 0)

        if current:
            paragraphs.append(' '.join(current))
        return paragraphs

    def _clean_description_with_metrics(self, desc: str) -> tuple[str, dict[str, int]]:
        if not desc:
            return "", {
                'removed_noise': 0,
                'removed_duplicates': 0,
                'paragraph_count': 0,
            }

        prepared = self._prepare_text(desc)
        raw_units: list[str] = []
        for raw_line in prepared.split('\n'):
            line = raw_line.strip()
            if not line:
                continue
            if re.search(r'\s[|·]\s', line) and len(line) < 180:
                raw_units.extend(part.strip() for part in re.split(r'\s*[|·]\s*', line))
            else:
                raw_units.append(line)

        seen: set[str] = set()
        units: list[str] = []
        removed_noise = 0
        removed_duplicates = 0

        for raw_unit in raw_units:
            unit = BULLET_PREFIX_RE.sub('', raw_unit).strip()
            if self._is_noise_line(unit):
                removed_noise += 1
                continue
            unit, inline_removed = self._clean_inline_noise(unit)
            removed_noise += inline_removed
            if not unit or self._is_noise_line(unit):
                if unit:
                    removed_noise += 1
                continue
            key = self._content_key(unit)
            if not key:
                continue
            if key in seen:
                removed_duplicates += 1
                continue
            seen.add(key)
            units.append(unit)

        paragraphs: list[str] = []
        for unit in units:
            sentences = [s for s in self._split_sentences(unit) if not self._is_noise_line(s)]
            if not sentences:
                continue
            if len(sentences) > 2 or len(unit) > 360:
                paragraphs.extend(self._group_sentences(sentences))
            else:
                paragraphs.append(' '.join(sentences))

        final_seen: set[str] = set()
        final_paragraphs: list[str] = []
        for paragraph in paragraphs:
            paragraph = re.sub(r'\s+', ' ', paragraph).strip()
            key = self._content_key(paragraph)
            if not key:
                continue
            if key in final_seen:
                removed_duplicates += 1
                continue
            final_seen.add(key)
            final_paragraphs.append(paragraph)

        text = '\n\n'.join(final_paragraphs)[:6000].strip()
        return text, {
            'removed_noise': removed_noise,
            'removed_duplicates': removed_duplicates,
            'paragraph_count': len(final_paragraphs),
        }

    def _clean_description(self, desc: str) -> str:
        return self._clean_description_with_metrics(desc)[0]

    def _clean_list(self, items: Any) -> list[str]:
        if items is None:
            return []
        if isinstance(items, dict):
            source = list(items.values())
        elif isinstance(items, list):
            source = items
        else:
            source = [items]

        candidates: list[str] = []
        for item in source:
            if isinstance(item, (list, tuple, set)):
                candidates.extend(str(value) for value in item)
            elif isinstance(item, str):
                candidates.extend(re.split(r'\n+|\s*;\s*', self._prepare_text(item)))

        cleaned: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            value = BULLET_PREFIX_RE.sub('', candidate).strip()
            if not value or self._is_noise_line(value):
                continue
            value, _ = self._clean_inline_noise(value)
            value = re.sub(r'\s+', ' ', value).strip()[:500]
            if len(value) <= 2 or self._is_noise_line(value):
                continue
            key = self._content_key(value)
            if not key or key in seen:
                continue
            seen.add(key)
            cleaned.append(value)
            if len(cleaned) >= 20:
                break

        return cleaned

    def _build_summary(self, summary: Any, description: str) -> str:
        summary_text = self._clean_description(str(summary or '')).replace('\n', ' ').strip()
        summary_words = summary_text.split()
        if 20 <= len(summary_words) <= 55:
            return summary_text
        if len(summary_words) > 55:
            return ' '.join(summary_words[:55]).rstrip(',:;–—-') + '.'

        sentences = self._split_sentences(description.replace('\n', ' '))
        candidate = ''
        for sentence in sentences:
            next_value = f'{candidate} {sentence}'.strip()
            if len(next_value.split()) > 55:
                break
            candidate = next_value
            if len(candidate.split()) >= 24:
                break

        if not candidate and sentences:
            candidate = sentences[0]
        words = candidate.split()
        if len(words) > 55:
            candidate = ' '.join(words[:55]).rstrip(',:;–—-') + '.'
        return candidate.strip()

    def _content_quality_score(
        self,
        summary: str,
        description: str,
        requirements: list[str],
        benefits: list[str],
        application_process: list[str],
    ) -> int:
        score = 0
        summary_words = len(summary.split())
        sentence_count = len(self._split_sentences(description.replace('\n', ' ')))
        paragraph_count = len([p for p in description.split('\n\n') if p.strip()])

        if 20 <= summary_words <= 55:
            score += 20
        elif summary_words >= 12:
            score += 10
        if len(description) >= 240:
            score += 15
        elif len(description) >= 120:
            score += 8
        if sentence_count >= 3:
            score += 15
        elif sentence_count >= 2:
            score += 8
        if paragraph_count >= 2:
            score += 10
        elif description:
            score += 4
        if requirements:
            score += 15
        if benefits:
            score += 15
        if application_process:
            score += 10
        if not re.search(r'<[^>]+>|https?://|\b(?:advertisement|share this|privacy policy|apply now)\b', f'{summary}\n{description}', re.I):
            score += 10
        return min(100, score)

    def _clean_url(self, url: str) -> str:
        if not url:
            return ""
        url = str(url).strip()
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
            return int(float(number_str))
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
            title_lower = str(item['title']).lower()
            if any(w in title_lower for w in ['scholarship', 'fellowship', 'grant', 'award']):
                score += 20
        if item.get('amount'):
            score += 10
        if item.get('deadline'):
            score += 10
        if item.get('apply_url') or item.get('applyUrl'):
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
            except (TypeError, ValueError):
                pass

        return list(dict.fromkeys(tags))[:5]

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
        return sorted(scores.items(), key=lambda pair: (-pair[1], priority.index(pair[0])))[0][0]

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
            except (TypeError, ValueError):
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

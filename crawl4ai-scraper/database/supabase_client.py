import os
from datetime import datetime
from typing import Any, Optional
import uuid


class SupabaseClient:
    def __init__(self, url: Optional[str] = None, key: Optional[str] = None):
        self.url = url or os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
        self.key = key or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

        if not self.url or not self.key:
            raise ValueError("Supabase URL and key are required")

        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                from supabase import create_client as supabase_create_client
                self._client = supabase_create_client(self.url, self.key)
            except ImportError:
                raise ImportError("Please install supabase-py: pip install supabase")
        return self._client

    def get_opportunities(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        response = self.client.table('opportunities').select('*').range(offset, offset + limit - 1).execute()
        return response.data or []

    def get_existing_urls(self) -> set[str]:
        response = self.client.table('opportunities').select('canonical_url,application_url').execute()
        urls = set()
        for item in (response.data or []):
            url = item.get('canonical_url') or self._normalize_url(item.get('application_url'))
            if url:
                urls.add(url)
        return urls

    def _normalize_url(self, url: Optional[str]) -> Optional[str]:
        if not url:
            return None
        clean = url.strip().split('?')[0].split('#')[0].rstrip('/').lower()
        return clean or None

    def _content_fingerprint(self, item: dict[str, Any]) -> str:
        return "|".join([
            str(item.get('title') or 'Untitled').strip().lower(),
            str(item.get('organization') or 'Unknown').strip().lower(),
            str(item.get('deadline') or ''),
        ])

    def _to_payload(self, item: dict[str, Any], now: str) -> dict[str, Any]:
        application_url = item.get('applyUrl') or item.get('application_url')
        canonical_url = self._normalize_url(application_url)
        if not canonical_url:
            safe_title = str(item.get('title') or 'untitled').strip().lower().replace(' ', '-')
            source_url = str(item.get('source') or 'unknown-source').strip().lower().rstrip('/')
            canonical_url = f"{source_url}/{safe_title}"
        metadata = {
            'requirements': item.get('requirements', []),
            'benefits': item.get('benefits', []),
            'application_process': item.get('applicationProcess', []),
            'match': item.get('match', 50),
            'difficulty': item.get('difficulty', 'Medium'),
            'scraped_at': now,
        }

        payload = {
            'id': item.get('id') or str(uuid.uuid4()),
            'title': item.get('title', 'Untitled'),
            'organization': item.get('organization', 'Unknown'),
            'category': item.get('category', 'General'),
            'close_date': item.get('deadline'),
            'location': item.get('location', 'Worldwide'),
            'description': item.get('description', ''),
            'application_url': application_url,
            'canonical_url': canonical_url,
            'content_fingerprint': self._content_fingerprint(item),
            'quality_score': item.get('quality_score') or item.get('match', 50),
            'validation_status': 'valid' if (item.get('quality_score') or item.get('match', 50)) >= 60 else 'needs_review',
            'image_url': item.get('image'),
            'tags': item.get('aiTags', []),
            'source': 'scraper',
            'source_url': item.get('source', 'Unknown'),
            'metadata': metadata,
            'created_at': now,
            'updated_at': now,
        }

        if item.get('stipend') is not None:
            payload['stipend'] = item['stipend']
        if item.get('currency'):
            payload['currency'] = item['currency']

        return payload

    def upsert_opportunity(self, item: dict[str, Any]) -> dict[str, Any]:
        payload = self._to_payload(item, datetime.utcnow().isoformat())

        try:
            response = self.client.table('opportunities').upsert(payload, on_conflict='canonical_url').execute()
            return {'success': True, 'data': response.data}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def bulk_upsert(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not items:
            return {'success': True, 'inserted': 0, 'errors': []}

        payload = []
        now = datetime.utcnow().isoformat()

        for item in items:
            payload.append(self._to_payload(item, now))

        try:
            response = self.client.table('opportunities').upsert(payload, on_conflict='canonical_url').execute()
            return {
                'success': True,
                'inserted': len(items),
                'data': response.data,
            }
        except Exception as e:
            return {'success': False, 'inserted': 0, 'error': str(e)}

    def get_scrape_stats(self) -> dict[str, Any]:
        try:
            response = self.client.table('opportunities').select('source', count='exact').execute()
            total = response.count or 0

            by_source = {}
            for item in (response.data or []):
                source = item.get('source', 'Unknown')
                by_source[source] = by_source.get(source, 0) + 1

            return {
                'total': total,
                'by_source': by_source,
            }
        except Exception as e:
            return {'error': str(e)}


class MockSupabaseClient(SupabaseClient):
    def __init__(self):
        self._storage: list[dict[str, Any]] = []
        self._urls: set[str] = set()

    def get_existing_urls(self) -> set[str]:
        return self._urls.copy()

    def upsert_opportunity(self, item: dict[str, Any]) -> dict[str, Any]:
        url = item.get('applyUrl')
        if url:
            self._urls.add(url)

        self._storage.append(item)
        return {'success': True, 'id': item.get('id', str(uuid.uuid4()))}

    def bulk_upsert(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        for item in items:
            self.upsert_opportunity(item)
        return {'success': True, 'inserted': len(items)}

    def get_scrape_stats(self) -> dict[str, Any]:
        return {'total': len(self._storage), 'by_source': {}}

    def get_opportunities(self, limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
        return self._storage[offset:offset + limit]

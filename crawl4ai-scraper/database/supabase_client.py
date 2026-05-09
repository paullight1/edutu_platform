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
        response = self.client.table('opportunities').select('apply_url').execute()
        urls = set()
        for item in (response.data or []):
            if item.get('apply_url'):
                urls.add(item['apply_url'])
        return urls

    def upsert_opportunity(self, item: dict[str, Any]) -> dict[str, Any]:
        payload = {
            'id': item.get('id') or str(uuid.uuid4()),
            'title': item.get('title', 'Untitled'),
            'organization': item.get('organization', 'Unknown'),
            'category': item.get('category', 'General'),
            'deadline': item.get('deadline'),
            'location': item.get('location', 'Worldwide'),
            'description': item.get('description', ''),
            'requirements': item.get('requirements', []),
            'benefits': item.get('benefits', []),
            'applicationProcess': item.get('applicationProcess', []),
            'applyUrl': item.get('applyUrl'),
            'match': item.get('match', 50),
            'difficulty': item.get('difficulty', 'Medium'),
            'image': item.get('image'),
            'tags': item.get('aiTags', []),
            'source': 'scraper',
            'source_url': item.get('source', 'Unknown'),
            'scraped_at': datetime.utcnow().isoformat(),
            'createdAt': datetime.utcnow().isoformat(),
        }

        if item.get('stipend') is not None:
            payload['stipend'] = item['stipend']
        if item.get('currency'):
            payload['currency'] = item['currency']

        try:
            response = self.client.table('opportunities').upsert(payload, on_conflict='id').execute()
            return {'success': True, 'data': response.data}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def bulk_upsert(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        if not items:
            return {'success': True, 'inserted': 0, 'errors': []}

        payload = []
        now = datetime.utcnow().isoformat()

        for item in items:
            payload.append({
                'id': item.get('id') or str(uuid.uuid4()),
                'title': item.get('title', 'Untitled'),
                'organization': item.get('organization', 'Unknown'),
                'category': item.get('category', 'General'),
                'deadline': item.get('deadline'),
                'location': item.get('location', 'Worldwide'),
                'description': item.get('description', ''),
                'requirements': item.get('requirements', []),
                'benefits': item.get('benefits', []),
                'applicationProcess': item.get('applicationProcess', []),
                'applyUrl': item.get('applyUrl'),
                'match': item.get('match', 50),
                'difficulty': item.get('difficulty', 'Medium'),
                'tags': item.get('aiTags', []),
                'source': 'scraper',
                'source_url': item.get('source', 'Unknown'),
                'scraped_at': now,
                'createdAt': now,
            })

        try:
            response = self.client.table('opportunities').upsert(payload, on_conflict='id').execute()
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

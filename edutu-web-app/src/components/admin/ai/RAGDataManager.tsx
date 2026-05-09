import React, { useEffect, useState } from 'react';
import { collection, getDocs, serverTimestamp, setDoc, doc } from '../../../lib/firebaseMock';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import { useToast } from '../../ui/ToastProvider';

type RagSourceStatus = 'active' | 'inactive';
type RagSourceType = 'url' | 'pdf';

interface RagSource {
  id: string;
  name: string;
  type: RagSourceType;
  status: RagSourceStatus;
  lastIndexed: Date | null;
}

const FALLBACK_SOURCES: RagSource[] = [
  {
    id: 'opportunity-feed',
    name: 'Opportunity Airtable feed',
    type: 'url',
    status: 'active',
    lastIndexed: new Date(Date.now() - 1000 * 60 * 60 * 6)
  },
  {
    id: 'career-handbook',
    name: 'Career readiness handbook.pdf',
    type: 'pdf',
    status: 'inactive',
    lastIndexed: null
  }
];

const formatDate = (date: Date | null) => {
  if (!date) {
    return 'Not indexed';
  }
  return date.toLocaleString();
};

const RAGDataManager: React.FC = () => {
  const { toast } = useToast();
  const [sources, setSources] = useState<RagSource[]>(FALLBACK_SOURCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError('Firestore unavailable. Using local RAG source snapshot.');
      setLoading(false);
      return;
    }

    const loadSources = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'rag_sources'));
        if (snapshot.empty) {
          setSources(FALLBACK_SOURCES);
          setLoading(false);
          return;
        }

        const records: RagSource[] = snapshot.docs.map((docSnapshot) => {
          const payload = docSnapshot.data() as Record<string, unknown>;
          const status: RagSourceStatus = payload.status === 'inactive' ? 'inactive' : 'active';
          const type: RagSourceType = payload.type === 'pdf' ? 'pdf' : 'url';
          let lastIndexed: Date | null = null;
          const rawDate = payload.lastIndexed;
          if (rawDate instanceof Date) {
            lastIndexed = rawDate;
          } else if (rawDate && typeof rawDate === 'object' && 'toDate' in rawDate) {
            lastIndexed = (rawDate as { toDate: () => Date }).toDate();
          } else if (typeof rawDate === 'string' || typeof rawDate === 'number') {
            const parsed = new Date(rawDate);
            lastIndexed = Number.isNaN(parsed.getTime()) ? null : parsed;
          }

          return {
            id: docSnapshot.id,
            name: typeof payload.name === 'string' ? payload.name : docSnapshot.id,
            type,
            status,
            lastIndexed
          };
        });
        setSources(records);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load RAG sources', err);
        setError('Unable to load RAG sources. Showing local defaults.');
        setSources(FALLBACK_SOURCES);
        setLoading(false);
      }
    };

    void loadSources();
  }, []);

  const handleReindex = async (source: RagSource) => {
    if (!db) {
      toast({
        title: 'Reindex simulated',
        description: `${source.name} marked as refreshed locally.`,
        variant: 'success'
      });
      setSources((previous) =>
        previous.map((entry) =>
          entry.id === source.id ? { ...entry, status: 'active', lastIndexed: new Date() } : entry
        )
      );
      return;
    }

    try {
      setReindexingId(source.id);
      await setDoc(
        doc(db, 'rag_sources', source.id),
        {
          status: 'active',
          lastIndexed: serverTimestamp()
        },
        { merge: true }
      );

      setSources((previous) =>
        previous.map((entry) =>
          entry.id === source.id ? { ...entry, status: 'active', lastIndexed: new Date() } : entry
        )
      );
      toast({
        title: 'Reindex started',
        description: `${source.name} queued for Groq ingestion.`,
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to reindex RAG source', err);
      toast({
        title: 'Reindex failed',
        description: err instanceof Error ? err.message : 'Unable to reindex source.',
        variant: 'error'
      });
    } finally {
      setReindexingId(null);
    }
  };

  return (
    <Card className="space-y-6">
      <header className="space-y-2 border-b border-gray-100 pb-4">
        <h3 className="text-base font-semibold text-gray-900">Retrieval data sources</h3>
        <p className="text-sm text-gray-500">
          Manage content pipelines used by the future Groq/Llama retrieval layer. Ensure each source stays fresh and
          compliant before exposing it to the AI mentors.
        </p>
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
          </div>
        )}
      </header>

      <div className="space-y-4">
        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-gray-500">
            Loading RAG sources…
          </div>
        )}
        {!loading &&
          sources.map((source) => (
            <div
              key={source.id}
              className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{source.name}</p>
                  <Badge variant="outline">{source.type.toUpperCase()}</Badge>
                </div>
                <p className="text-xs text-gray-500">Last indexed: {formatDate(source.lastIndexed)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={source.status === 'active' ? 'success' : 'danger'}>
                  {source.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
                <button
                  type="button"
                  onClick={() => void handleReindex(source)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={reindexingId === source.id}
                >
                  {reindexingId === source.id ? 'Reindexing…' : 'Reindex'}
                </button>
              </div>
            </div>
          ))}
      </div>
    </Card>
  );
};

export default RAGDataManager;

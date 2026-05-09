import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, serverTimestamp, setDoc, doc } from '../../../lib/firebaseMock';
import Card from '../../ui/Card';
import Textarea from '../../ui/Textarea';
import Select from '../../ui/Select';
import { useToast } from '../../ui/ToastProvider';

type PersonaTone = 'friendly' | 'formal' | 'motivational';

export interface AiPersona {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  tone: PersonaTone;
}

const FALLBACK_PERSONAS: AiPersona[] = [
  {
    id: 'career-mentor',
    name: 'Career Mentor',
    description: 'Guides learners through career pivots and professional development.',
    systemPrompt:
      'You are a supportive career mentor for African youth exploring new opportunities. Offer actionable steps and relatable success stories.',
    tone: 'friendly'
  },
  {
    id: 'scholarship-coach',
    name: 'Scholarship Coach',
    description: 'Helps learners craft compelling scholarship applications and essays.',
    systemPrompt:
      'You specialise in scholarships. Ask clarifying questions, suggest compelling narratives, and highlight financial planning tips.',
    tone: 'motivational'
  },
  {
    id: 'cv-advisor',
    name: 'CV Advisor',
    description: 'Improves learner CVs with clear bullet points and measurable impact.',
    systemPrompt:
      'You review CVs for clarity and impact. Provide specific rewrite suggestions and encourage concise storytelling.',
    tone: 'formal'
  }
];

const toneOptions: Array<{ label: string; value: PersonaTone }> = [
  { label: 'Friendly', value: 'friendly' },
  { label: 'Formal', value: 'formal' },
  { label: 'Motivational', value: 'motivational' }
];

const simulateAIResponse = async (prompt: string, tone: PersonaTone) => {
  await new Promise((resolve) => window.setTimeout(resolve, 600));
  const tonePrefix =
    tone === 'motivational'
      ? '🔥 Keep going!'
      : tone === 'formal'
        ? 'To proceed, please consider:'
        : 'Here is a quick idea:';
  return `${tonePrefix} ${prompt.slice(0, 120)}${prompt.length > 120 ? '...' : ''}`;
};

const AIMentorConfig: React.FC = () => {
  const { toast } = useToast();
  const [personas, setPersonas] = useState<AiPersona[]>(FALLBACK_PERSONAS);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testOutput, setTestOutput] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      setError('Firestore is not initialised. Using local persona defaults.');
      return;
    }

    const fetchPersonas = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'ai_personas'));
        if (snapshot.empty) {
          setPersonas(FALLBACK_PERSONAS);
          setLoading(false);
          return;
        }

        const records: AiPersona[] = snapshot.docs.map((docSnapshot) => {
          const payload = docSnapshot.data() as Record<string, unknown>;
          const tone = toneOptions.some((option) => option.value === payload.tone)
            ? (payload.tone as PersonaTone)
            : 'friendly';
          return {
            id: docSnapshot.id,
            name: typeof payload.name === 'string' ? payload.name : docSnapshot.id,
            description:
              typeof payload.description === 'string' ? payload.description : 'No description specified.',
            systemPrompt:
              typeof payload.systemPrompt === 'string'
                ? payload.systemPrompt
                : 'Configure a helpful prompt for this mentor.',
            tone
          };
        });

        setPersonas(records);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load AI personas', err);
        setError('Unable to load AI persona configuration. Showing defaults.');
        setPersonas(FALLBACK_PERSONAS);
        setLoading(false);
      }
    };

    void fetchPersonas();
  }, []);

  const handleFieldChange = (personaId: string, field: keyof AiPersona, value: string) => {
    setPersonas((previous) =>
      previous.map((persona) => {
        if (persona.id !== personaId) {
          return persona;
        }
        return {
          ...persona,
          [field]: value
        };
      })
    );
  };

  const handleSave = async (persona: AiPersona) => {
    if (!db) {
      toast({
        title: 'Firestore offline',
        description: 'Cannot save persona while Firebase is unavailable.',
        variant: 'error'
      });
      return;
    }

    try {
      setSavingId(persona.id);
      await setDoc(
        doc(db, 'ai_personas', persona.id),
        {
          name: persona.name.trim(),
          description: persona.description.trim(),
          systemPrompt: persona.systemPrompt.trim(),
          tone: persona.tone,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      toast({
        title: `${persona.name} updated`,
        description: 'Persona prompt saved successfully.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to save AI persona', err);
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save persona changes.',
        variant: 'error'
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleTest = async (persona: AiPersona) => {
    setTestingId(persona.id);
    try {
      const output = await simulateAIResponse(persona.systemPrompt, persona.tone);
      setTestOutput((previous) => ({
        ...previous,
        [persona.id]: output
      }));
      toast({
        title: 'Simulation ready',
        description: `${persona.name} produced a sample reply.`,
        variant: 'success'
      });
    } catch (err) {
      console.error('Simulation failed', err);
      toast({
        title: 'Simulation error',
        description: err instanceof Error ? err.message : 'Unable to simulate response.',
        variant: 'error'
      });
    } finally {
      setTestingId(null);
    }
  };

  const personaList = useMemo(() => personas, [personas]);

  if (loading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-600">Loading AI mentor personas…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      )}
      {personaList.map((persona) => (
        <Card key={persona.id} className="space-y-4">
          <div className="flex flex-col gap-2 border-b border-gray-100 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{persona.name}</h3>
                <p className="text-sm text-gray-500">{persona.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-100"
                  onClick={() => void handleTest(persona)}
                  disabled={testingId === persona.id}
                >
                  {testingId === persona.id ? 'Testing…' : 'Test prompt'}
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleSave(persona)}
                  disabled={savingId === persona.id}
                >
                  {savingId === persona.id ? 'Saving…' : 'Save config'}
                </button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold tracking-wide text-gray-500">Name</label>
                <input
                  value={persona.name}
                  onChange={(event) => handleFieldChange(persona.id, 'name', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Persona name"
                />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs font-semibold tracking-wide text-gray-500">Description</label>
                <input
                  value={persona.description}
                  onChange={(event) => handleFieldChange(persona.id, 'description', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="How this mentor supports learners"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-4">
              <label className="text-xs font-semibold tracking-wide text-gray-500">System prompt</label>
              <Textarea
                rows={6}
                value={persona.systemPrompt}
                onChange={(event) => handleFieldChange(persona.id, 'systemPrompt', event.target.value)}
                placeholder="Define instructions and guardrails for this mentor persona."
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide text-gray-500">Tone</label>
              <Select
                value={persona.tone}
                onChange={(event) => handleFieldChange(persona.id, 'tone', event.target.value)}
                className="mt-1"
              >
                {toneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {testOutput[persona.id] && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <p className="font-medium">Simulation result</p>
              <p className="mt-2 text-sm text-emerald-800">{testOutput[persona.id]}</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

export default AIMentorConfig;

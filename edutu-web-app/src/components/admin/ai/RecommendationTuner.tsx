import React, { useEffect, useState } from 'react';
import Card from '../../ui/Card';
import { useToast } from '../../ui/ToastProvider';
import useAITuning, { type AITuningWeights } from '../../../hooks/useAITuning';

const sliderConfig: Array<{
  key: keyof AITuningWeights;
  label: string;
  helper: string;
}> = [
  {
    key: 'regionMatch',
    label: 'Region match',
    helper: 'How strongly regional fit influences recommendations.'
  },
  {
    key: 'goalAlignment',
    label: 'Goal alignment',
    helper: 'Weight applied when a learner goal matches an opportunity objective.'
  },
  {
    key: 'cvSkillsMatch',
    label: 'CV skills match',
    helper: 'Impact of resume keywords on the final recommendation score.'
  }
];

const RecommendationTuner: React.FC = () => {
  const { toast } = useToast();
  const { weights, loading, error, saveWeights, resetWeights } = useAITuning();
  const [draftWeights, setDraftWeights] = useState<AITuningWeights>(weights);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftWeights(weights);
  }, [weights]);

  const handleSliderChange = (key: keyof AITuningWeights, value: number) => {
    setDraftWeights((previous) => ({
      ...previous,
      [key]: Number(value.toFixed(2))
    }));
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      const defaults = await resetWeights();
      setDraftWeights(defaults);
      toast({
        title: 'Defaults restored',
        description: 'Recommendation weights reverted to baseline values.',
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Reset failed',
        description: err instanceof Error ? err.message : 'Unable to reset tuning weights.',
        variant: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await saveWeights(draftWeights);
      toast({
        title: 'Weights updated',
        description: 'Learner recommendations will use the new weighting.',
        variant: 'success'
      });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unable to save recommendation weights.',
        variant: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-6">
      <header className="space-y-2 border-b border-gray-100 pb-4">
        <h3 className="text-base font-semibold text-gray-900">Opportunity recommendation weights</h3>
        <p className="text-sm text-gray-500">
          Adjust model coefficients to control how learning goals, CV data, and regional context influence
          recommended opportunities. Values are normalised between 0 and 1 for the future Groq/Llama pipelines.
        </p>
        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {error}
          </div>
        )}
      </header>

      <div className="space-y-5">
        {sliderConfig.map((config) => (
          <div key={config.key} className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{config.label}</p>
                <p className="text-xs text-gray-500">{config.helper}</p>
              </div>
              <span className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
                {draftWeights[config.key].toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draftWeights[config.key]}
              onChange={(event) => handleSliderChange(config.key, Number(event.target.value))}
              className="w-full accent-primary"
            />
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleReset()}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || loading}
        >
          Reset to default
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || loading}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </footer>
    </Card>
  );
};

export default RecommendationTuner;

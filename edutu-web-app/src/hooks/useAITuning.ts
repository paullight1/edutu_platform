import { useEffect, useState } from 'react';

export interface AITuningConfig {
  id: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  customInstructions: string;
  updatedAt: string;
}

export interface AITuningInput {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  customInstructions?: string;
}

const defaultConfig: AITuningConfig = {
  id: 'default-config',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 1000,
  topP: 0.9,
  frequencyPenalty: 0.5,
  presencePenalty: 0.5,
  customInstructions: 'Be helpful and concise in your responses.',
  updatedAt: new Date().toISOString()
};

export function useAITuning() {
  const [config, setConfig] = useState<AITuningConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simulate loading config
    const loadConfig = async () => {
      try {
        setLoading(true);
        if (import.meta.env.DEV) {
          console.debug('AI tuning backend is unconfigured; using local development defaults.');
        }
        
        setConfig(defaultConfig);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load AI config');
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  const updateConfig = async (updates: AITuningInput): Promise<boolean> => {
    setLoading(true);
    setError(null);
    
    try {
      if (!import.meta.env.DEV) {
        throw new Error('AI tuning is not connected to the backend yet.');
      }
      
      const updatedConfig = {
        ...defaultConfig,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      setConfig(updatedConfig);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update AI config';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    config,
    loading,
    error,
    updateConfig
  };
}

export default useAITuning;

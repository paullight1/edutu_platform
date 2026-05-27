import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Trash2,
  Upload,
  FileText,
  Video,
  Wrench,
  CheckCircle,
  Loader2,
  DollarSign,
  Clock,
  Tag,
  Layers,
  Sparkles,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import type { AppUser } from '../types/user';
import { createRoadmap, toBackendCategory, toBackendDifficulty } from '../services/roadmapApi';

interface CreatorRoadmapWizardProps {
  user: AppUser | null;
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

interface Stage {
  id: string;
  title: string;
  description: string;
  duration: string;
  relativeDueDays: string;
  isMilestone: boolean;
}

interface Resource {
  id: string;
  name: string;
  file: File | null;
  url: string;
  type: 'video' | 'article' | 'pdf' | 'tool';
  cost: 'free' | 'premium';
}

const CreatorRoadmapWizard: React.FC<CreatorRoadmapWizardProps> = ({ user, onBack, onNavigate }) => {
  const { isDarkMode } = useDarkMode();
  const { getToken } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [story, setStory] = useState<string>('');
  const [scholarProof, setScholarProof] = useState<string>('');
  const [deadlineStrategy, setDeadlineStrategy] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [price, setPrice] = useState<string>('');
  const [experienceLevel, setExperienceLevel] = useState<string>('');

  const [stages, setStages] = useState<Stage[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  const categories = [
    { id: 'technology', label: 'Technology' },
    { id: 'education', label: 'Education' },
    { id: 'career', label: 'Career' },
    { id: 'business', label: 'Business' },
    { id: 'health', label: 'Health & Wellness' },
    { id: 'personal', label: 'Personal Development' },
    { id: 'finance', label: 'Finance' },
    { id: 'creative', label: 'Creative Arts' },
  ];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (step === 1) {
      scrollToTop();
      onBack();
    } else {
      setStep(step - 1);
      scrollToTop();
    }
  };

  const handleNext = () => {
    if (step === 1 && (!title || !description || !category)) {
      return;
    }
    if (step === 2 && stages.length === 0) {
      return;
    }
    setStep(step + 1);
    scrollToTop();
  };

  const addStage = () => {
    const newStage: Stage = {
      id: `stage-${Date.now()}`,
      title: '',
      description: '',
      duration: '',
      relativeDueDays: '',
      isMilestone: false,
    };
    setStages([...stages, newStage]);
  };

  const updateStage = (id: string, field: keyof Stage, value: string | boolean) => {
    setStages(stages.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const deleteStage = (id: string) => {
    setStages(stages.filter((s) => s.id !== id));
  };

  const addResource = () => {
    const newResource: Resource = {
      id: `res-${Date.now()}`,
      name: '',
      file: null,
      url: '',
      type: 'article',
      cost: 'free',
    };
    setResources([...resources, newResource]);
  };

  const updateResource = (id: string, field: keyof Resource, value: string | File | null) => {
    setResources(resources.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const deleteResource = (id: string) => {
    setResources(resources.filter((r) => r.id !== id));
  };

  const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const token = await getToken();
      await createRoadmap({
        title: title.trim(),
        description: [description.trim(), story.trim()].filter(Boolean).join('\n\n'),
        category: toBackendCategory(category),
        difficulty: toBackendDifficulty(experienceLevel),
        estimatedDuration: stages.find((stage) => stage.duration.trim())?.duration.trim(),
        outcomes: description.trim(),
        coverImage: '',
        creatorProof: {
          name: user.name,
          email: user.email,
          story: story.trim(),
          scholarProof: scholarProof.trim(),
          verifiedScholar: Boolean(scholarProof.trim()),
          price: price || '0',
          thumbnailFileName: thumbnailFile?.name,
        },
        deadlineStrategy: deadlineStrategy.trim() || undefined,
        steps: stages
          .filter((stage) => stage.title.trim() && stage.description.trim())
          .map((stage, index) => {
            const relativeDueDays = Number.parseInt(stage.relativeDueDays, 10);
            return {
              id: stage.id,
              title: stage.title.trim(),
              description: stage.description.trim(),
              duration: stage.duration.trim() || undefined,
              relativeDueDays: Number.isFinite(relativeDueDays) ? relativeDueDays : undefined,
              phase: stage.isMilestone ? `Milestone ${index + 1}` : `Stage ${index + 1}`,
              taskType: stage.isMilestone ? 'milestone' : 'task',
            };
          }),
        resources: resources
          .filter((resource) => resource.name.trim())
          .map((resource) => ({
            id: resource.id,
            title: resource.name.trim(),
            url: resource.url.trim(),
            type:
              resource.type === 'pdf'
                ? 'document'
                : resource.type === 'video'
                  ? 'video'
                  : resource.type === 'tool'
                    ? 'tool'
                    : 'link',
          })),
      }, token);
      onNavigate?.('creator-dashboard');
    } catch (error) {
      console.error('Failed to create roadmap:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create roadmap.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBasics = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Roadmap Basics</h2>
        <p className="text-gray-600 dark:text-gray-400">Set up the foundation for your roadmap</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="e.g., Complete Guide to Web Development"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="What will students learn? What outcomes can they expect?"
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scholar Story</label>
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="Share the journey behind this roadmap and what changed for you."
          rows={4}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scholar Proof</label>
        <textarea
          value={scholarProof}
          onChange={(e) => setScholarProof(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="Add outcome proof, award details, portfolio links, score ranges, or verification notes."
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deadline Strategy</label>
        <textarea
          value={deadlineStrategy}
          onChange={(e) => setDeadlineStrategy(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="Explain how learners should schedule each step around a target deadline."
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Category *</label>
        <div className="grid grid-cols-2 gap-3">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`p-3 rounded-2xl border-2 text-left transition-all ${
                category === c.id
                  ? 'border-primary bg-primary/10 dark:bg-primary/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 bg-white dark:bg-gray-800'
              }`}
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Thumbnail</label>
        <label className={`flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          thumbnailFile
            ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:hover:border-primary bg-gray-50 dark:bg-gray-800'
        }`}>
          <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
          {thumbnailFile ? (
            <>
              <CheckCircle size={24} className="text-green-500" />
              <span className="text-green-700 dark:text-green-400 font-medium">{thumbnailFile.name}</span>
            </>
          ) : (
            <>
              <Upload size={24} className="text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">Upload thumbnail image</span>
            </>
          )}
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Price ($)</label>
          <div className="relative">
            <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="29.99"
              min="0"
              step="0.01"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Experience Level</label>
          <input
            type="text"
            value={experienceLevel}
            onChange={(e) => setExperienceLevel(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="e.g., Beginner"
          />
        </div>
      </div>

      <Button onClick={handleNext} disabled={!title || !description || !category} className="w-full">
        Continue to Curriculum
      </Button>
    </div>
  );

  const renderCurriculum = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Curriculum</h2>
        <p className="text-gray-600 dark:text-gray-400">Add stages to your roadmap</p>
      </div>

      <div className="space-y-4">
        {stages.map((stage, index) => (
          <Card key={stage.id} className="dark:bg-gray-800 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">{index + 1}</span>
                </div>
                <span className="font-medium text-gray-800 dark:text-white">Stage {index + 1}</span>
                {stage.isMilestone && (
                  <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-full text-xs font-medium">
                    Milestone
                  </span>
                )}
              </div>
              <button onClick={() => deleteStage(stage.id)} className="text-red-500 hover:text-red-600 p-1">
                <Trash2 size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                value={stage.title}
                onChange={(e) => updateStage(stage.id, 'title', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                placeholder="Stage title"
              />
              <textarea
                value={stage.description}
                onChange={(e) => updateStage(stage.id, 'description', e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm resize-none"
                placeholder="What will students accomplish in this stage?"
                rows={2}
              />
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={stage.duration}
                      onChange={(e) => updateStage(stage.id, 'duration', e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                      placeholder="Duration (e.g., 2 weeks)"
                    />
                  </div>
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    value={stage.relativeDueDays}
                    onChange={(e) => updateStage(stage.id, 'relativeDueDays', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    placeholder="Due offset"
                  />
                </div>
                <button
                  onClick={() => updateStage(stage.id, 'isMilestone', !stage.isMilestone)}
                  className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    stage.isMilestone
                      ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Milestone
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button variant="secondary" onClick={addStage} className="w-full">
        <Plus size={18} />
        Add Stage
      </Button>

      <Button onClick={handleNext} disabled={stages.length === 0} className="w-full">
        Continue to Resources
      </Button>
    </div>
  );

  const renderResources = () => {
    const resourceTypes = [
      { id: 'video' as const, label: 'Video', icon: <Video size={18} /> },
      { id: 'article' as const, label: 'Article', icon: <FileText size={18} /> },
      { id: 'pdf' as const, label: 'PDF', icon: <Layers size={18} /> },
      { id: 'tool' as const, label: 'Tool', icon: <Wrench size={18} /> },
    ];

    return (
      <div className="space-y-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Resources</h2>
          <p className="text-gray-600 dark:text-gray-400">Add supporting materials for your students</p>
        </div>

        <div className="space-y-4">
          {resources.map((resource) => (
            <Card key={resource.id} className="dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium text-gray-800 dark:text-white">Resource</span>
                <button onClick={() => deleteResource(resource.id)} className="text-red-500 hover:text-red-600 p-1">
                  <Trash2 size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  value={resource.name}
                  onChange={(e) => updateResource(resource.id, 'name', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  placeholder="Resource name"
                />

                <input
                  type="url"
                  value={resource.url}
                  onChange={(e) => updateResource(resource.id, 'url', e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                  placeholder="Resource URL"
                />

                <div className="flex gap-2">
                  {resourceTypes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => updateResource(resource.id, 'type', t.id)}
                      className={`flex-1 flex items-center justify-center gap-1 p-2 rounded-xl border text-xs font-medium transition-all ${
                        resource.type === t.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => updateResource(resource.id, 'cost', resource.cost === 'free' ? 'premium' : 'free')}
                    className={`flex-1 p-2 rounded-xl border text-sm font-medium transition-all ${
                      resource.cost === 'free'
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                    }`}
                  >
                    {resource.cost === 'free' ? 'Free' : 'Premium'}
                  </button>
                  <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-xl border-2 border-dashed cursor-pointer text-sm ${
                    resource.file
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                      : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                  }`}>
                    <input
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        updateResource(resource.id, 'file', file);
                      }}
                      className="hidden"
                    />
                    <Upload size={14} />
                    {resource.file ? resource.file.name : 'Upload file'}
                  </label>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Button variant="secondary" onClick={addResource} className="w-full">
          <Plus size={18} />
          Add Resource
        </Button>

        <Button onClick={handleNext} className="w-full">
          Review & Submit
        </Button>
      </div>
    );
  };

  const renderReview = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Review Roadmap</h2>
        <p className="text-gray-600 dark:text-gray-400">Preview your roadmap before publishing</p>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-start gap-4 mb-4">
          {thumbnailFile ? (
            <div className="w-20 h-20 bg-gray-200 dark:bg-gray-700 rounded-xl flex items-center justify-center">
              <FileText size={24} className="text-gray-400" />
            </div>
          ) : (
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-xl flex items-center justify-center">
              <BookOpen size={28} className="text-white" />
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <Tag size={14} className="text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{category}</span>
              {experienceLevel && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">•</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">{experienceLevel}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{description}</p>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <DollarSign size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-gray-700 dark:text-gray-300 font-medium">${price || 'Free'}</span>
          </div>
          {thumbnailFile && (
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-500" />
              <span className="text-gray-500 dark:text-gray-400">Thumbnail uploaded</span>
            </div>
          )}
        </div>
      </Card>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Layers size={18} className="text-primary" />
          Curriculum ({stages.length} stages)
        </h3>
        <div className="space-y-3">
          {stages.map((stage, index) => (
            <div key={stage.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-primary">{index + 1}.</span>
                <span className="font-medium text-gray-800 dark:text-white text-sm">{stage.title || 'Untitled Stage'}</span>
                {stage.isMilestone && (
                  <span className="px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded text-xs">
                    Milestone
                  </span>
                )}
              </div>
              {stage.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-5">{stage.description}</p>
              )}
              {stage.duration && (
                <div className="flex items-center gap-1 ml-5 mt-1 text-xs text-gray-400">
                  <Clock size={12} />
                  {stage.duration}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {resources.length > 0 && (
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            Resources ({resources.length})
          </h3>
          <div className="space-y-2">
            {resources.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800 dark:text-white">{r.name || 'Untitled'}</span>
                  <span className="text-xs text-gray-400 capitalize">({r.type})</span>
                </div>
                <span className={`text-xs font-medium ${r.cost === 'free' ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>
                  {r.cost}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full py-4">
        {isSubmitting ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Publishing...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Publish Roadmap
          </>
        )}
      </Button>
      {submitError && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center">{submitError}</p>
      )}
    </div>
  );

  const stepTitles: Record<number, string> = {
    1: 'Basics',
    2: 'Curriculum',
    3: 'Resources',
    4: 'Review',
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Create Roadmap</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Step {step} of 4: {stepTitles[step]}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all ${
                  s <= step ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {step === 1 && renderBasics()}
        {step === 2 && renderCurriculum()}
        {step === 3 && renderResources()}
        {step === 4 && renderReview()}
      </div>
    </div>
  );
};

export default CreatorRoadmapWizard;

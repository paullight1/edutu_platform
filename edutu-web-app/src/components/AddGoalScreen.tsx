import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Target, 
  BookOpen, 
  Briefcase, 
  GraduationCap, 
  Heart, 
  Zap, 
  Plus,
  ChevronRight,
  Calendar,
  Bell,
  Download,
  ExternalLink,
  Flag,
  Sparkles,
  Users,
  Trophy,
  Rocket,
  Star,
  CheckCircle,
  Globe
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { Goal, useGoals } from '../hooks/useGoals';
import type { AppUser } from '../types/user';
import { RoadmapTemplate, roadmapTemplates } from '../data/roadmapTemplates';

interface AddGoalScreenProps {
  onBack: () => void;
  onGoalCreated?: (goal: Goal) => void;
  onNavigate?: (screen: string) => void;
  user: AppUser | null;
  initialStep?: 'type' | 'template';
}

const AddGoalScreen: React.FC<AddGoalScreenProps> = ({ onBack, onGoalCreated, onNavigate, user, initialStep = 'type' }) => {
  const [step, setStep] = useState<'type' | 'template' | 'custom' | 'details'>(initialStep);
  const [selectedType, setSelectedType] = useState<'roadmap' | 'custom' | null>(initialStep === 'template' ? 'roadmap' : null);
  const [selectedTemplate, setSelectedTemplate] = useState<RoadmapTemplate | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [customGoal, setCustomGoal] = useState<{
    title: string;
    description: string;
    category: string;
    deadline: string;
    priority: 'low' | 'medium' | 'high';
  }>({
    title: '',
    description: '',
    category: '',
    deadline: '',
    priority: 'medium'
  });
  const [error, setError] = useState<string | null>(null);
  const { createGoal } = useGoals();
  const { isDarkMode } = useDarkMode();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (step === 'type') {
      scrollToTop();
      onBack();
    } else if (step === 'template' || step === 'custom') {
      setStep('type');
    } else if (step === 'details') {
      if (selectedType === 'roadmap') {
        setStep('template');
      } else {
        setStep('custom');
      }
    }
  };

  const handleCommunityMarketplace = () => {
    if (onNavigate) {
      onNavigate('community-marketplace');
    }
  };

  const goalTypes = [
    {
      id: 'roadmap',
      title: 'Choose from Roadmap Templates',
      description: 'Select from our curated collection of proven success paths with step-by-step guidance',
      icon: <BookOpen size={32} className="text-brand-600 dark:text-brand-400" />,
      features: ['Pre-built milestones', 'Expert guidance', 'Proven strategies', 'Community support'],
      bgColor: 'bg-surface-layer',
      borderColor: 'border-subtle'
    },
    {
      id: 'custom',
      title: 'Create Custom Goal',
      description: 'Build your own personalized goal from scratch with AI assistance and flexible planning',
      icon: <Plus size={32} className="text-brand-600 dark:text-brand-400" />,
      features: ['Complete flexibility', 'AI assistance', 'Custom milestones', 'Personal tracking'],
      bgColor: 'bg-surface-layer',
      borderColor: 'border-subtle'
    }
  ];

  const deriveDeadlineFromTemplate = (duration?: string) => {
    if (!duration) {
      return undefined;
    }
    const match = duration.match(/(\d+)\s*(day|week|month|year)/i);
    if (!match) {
      return undefined;
    }
    const amount = parseInt(match[1], 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      return undefined;
    }
    const unit = match[2].toLowerCase();
    const target = new Date();
    switch (unit) {
      case 'day':
      case 'days':
        target.setDate(target.getDate() + amount);
        break;
      case 'week':
      case 'weeks':
        target.setDate(target.getDate() + amount * 7);
        break;
      case 'month':
      case 'months':
        target.setMonth(target.getMonth() + amount);
        break;
      case 'year':
      case 'years':
        target.setFullYear(target.getFullYear() + amount);
        break;
      default:
        return undefined;
    }
    return target.toISOString();
  };

  const toIsoDate = (value: string) => {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed.toISOString();
  };

  const customCategories = [
    { id: 'education', label: 'Education & Learning', icon: <GraduationCap size={20} /> },
    { id: 'career', label: 'Career Development', icon: <Briefcase size={20} /> },
    { id: 'health', label: 'Health & Wellness', icon: <Heart size={20} /> },
    { id: 'personal', label: 'Personal Growth', icon: <Star size={20} /> },
    { id: 'financial', label: 'Financial Goals', icon: <Trophy size={20} /> },
    { id: 'creative', label: 'Creative Projects', icon: <Sparkles size={20} /> }
  ];

  const handleTypeSelect = (type: 'roadmap' | 'custom') => {
    setError(null);
    setSelectedType(type);
    if (type === 'roadmap') {
      setStep('template');
    } else {
      setStep('custom');
    }
  };

  const renderTemplateIcon = (template: RoadmapTemplate, size = 24) => {
    const className = "text-brand-600 dark:text-brand-400";
    switch (template.icon) {
      case 'graduation':
        return <GraduationCap size={size} className={className} />;
      case 'briefcase':
        return <Briefcase size={size} className={className} />;
      case 'users':
        return <Users size={size} className={className} />;
      case 'rocket':
        return <Rocket size={size} className={className} />;
      case 'heart':
        return <Heart size={size} className={className} />;
      default:
        return <BookOpen size={size} className={className} />;
    }
  };

  const handleTemplateSelect = (template: RoadmapTemplate) => {
    setError(null);
    setReminderMessage(null);
    setSelectedType('roadmap');
    setSelectedTemplate(template);
    setStep('details');
  };

  const createCalendarDate = (week: number) => {
    const date = new Date();
    date.setDate(date.getDate() + Math.max(1, week) * 7);
    date.setHours(9, 0, 0, 0);
    return date;
  };

  const formatIcsDate = (date: Date) =>
    date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const downloadTemplateCalendar = () => {
    if (!selectedTemplate) return;

    const events = selectedTemplate.milestonesPlan.map((milestone) => {
      const start = createCalendarDate(milestone.week);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const description = `${milestone.guidance}\\nDeliverable: ${milestone.deliverable}`.replace(/\n/g, '\\n');
      return [
        'BEGIN:VEVENT',
        `UID:${selectedTemplate.id}-${milestone.week}@edutu`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        `DTSTART:${formatIcsDate(start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${selectedTemplate.calendarTitle}: Week ${milestone.week}`,
        `DESCRIPTION:${description}`,
        'END:VEVENT',
      ].join('\n');
    });

    const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Edutu//Roadmap Templates//EN', ...events, 'END:VCALENDAR'].join('\n');
    const blob = new Blob([calendar], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedTemplate.id}-roadmap.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const enableTemplateReminderPreview = async () => {
    if (!selectedTemplate) return;

    if (!('Notification' in window)) {
      setReminderMessage('This browser does not support notifications. Use the calendar export for reminders.');
      return;
    }

    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

    if (permission !== 'granted') {
      setReminderMessage('Notifications are blocked. You can still add this roadmap to your calendar.');
      return;
    }

    new Notification('Edutu roadmap reminder ready', {
      body: `${selectedTemplate.title}: ${selectedTemplate.reminderCadence}`,
    });
    setReminderMessage('Reminder preview sent. Long-term scheduled reminders will follow the goal once created.');
  };

  const handleCustomGoalSubmit = () => {
    if (customGoal.title && customGoal.description && customGoal.category) {
      setError(null);
      setStep('details');
    }
  };

  const handleGoalCreate = async () => {
    setError(null);

    if (selectedType === 'roadmap') {
      if (!selectedTemplate) {
        setError('Select a roadmap template before continuing.');
        return;
      }
      const goal = await createGoal({
        title: selectedTemplate.title,
        description: selectedTemplate.description,
        category: selectedTemplate.category,
        deadline: deriveDeadlineFromTemplate(selectedTemplate.duration),
        priority: 'medium',
        source: 'template',
        templateId: selectedTemplate.id,
        progress: 0
      });
      if (onGoalCreated) {
        onGoalCreated(goal);
      }
      return;
    }

    if (selectedType === 'custom') {
      const trimmedTitle = customGoal.title.trim();
      const trimmedDescription = customGoal.description.trim();
      if (!trimmedTitle || !trimmedDescription || !customGoal.category) {
        setError('Fill out your goal title, description, and category to continue.');
        return;
      }
      const goal = await createGoal({
        title: trimmedTitle,
        description: trimmedDescription,
        category: customGoal.category,
        deadline: toIsoDate(customGoal.deadline),
        priority: customGoal.priority as 'low' | 'medium' | 'high',
        source: 'custom',
        progress: 0
      });
      if (onGoalCreated) {
        onGoalCreated(goal);
      }
      return;
    }

    setError('Choose how you want to create your goal to continue.');
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'Intermediate': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Advanced': return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: return 'text-brand-600 bg-brand-500/10 dark:text-brand-400';
    }
  };

  const renderTypeSelection = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center mb-5 sm:mb-8">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-brand-500 rounded-[20px] flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg shadow-brand-500/20">
          <Target size={26} className="text-white sm:hidden" />
          <Target size={32} className="hidden text-white sm:block" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white mb-1.5 sm:mb-2">Create Your Goal</h2>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Choose a path and we’ll guide the next steps.
        </p>
      </div>

      {/* Community Marketplace Banner */}
      <Card
        className="cursor-pointer p-4 sm:p-6 hover:shadow-lg transition-all transform hover:scale-[1.02] bg-brand-500/10 border-brand-500/20 animate-slide-up group"
        onClick={handleCommunityMarketplace}
      >
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-11 h-11 sm:w-16 sm:h-16 bg-brand-500 rounded-[20px] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-brand-500/20">
            <Globe size={22} className="text-white sm:hidden" />
            <Globe size={32} className="hidden text-white sm:block" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-lg font-bold text-slate-950 dark:text-white mb-1 sm:mb-2 group-hover:text-brand-500 transition-colors">
              Community Roadmaps
            </h3>
            <p className="text-xs sm:text-base text-slate-500 dark:text-slate-400 sm:mb-3 leading-relaxed line-clamp-2">
              Proven paths shared by community members.
            </p>
            <div className="hidden sm:flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>500+ Success Stories</span>
              </div>
              <div className="flex items-center gap-1">
                <Trophy size={14} />
                <span>Verified Results</span>
              </div>
            </div>
          </div>
          <ChevronRight size={20} className="text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-transform" />
        </div>
      </Card>

      <div className="space-y-4">
        {goalTypes.map((type, index) => (
          <Card
            key={type.id}
            className={`cursor-pointer p-4 sm:p-6 hover:shadow-lg transition-all transform hover:scale-[1.02] ${type.bgColor} ${type.borderColor} animate-slide-up group`}
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => handleTypeSelect(type.id as 'roadmap' | 'custom')}
          >
            <div className="flex items-center gap-3 sm:items-start sm:gap-4">
              <div className="w-11 h-11 sm:w-16 sm:h-16 bg-brand-500/10 rounded-[20px] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm [&_svg]:h-5 [&_svg]:w-5 sm:[&_svg]:h-8 sm:[&_svg]:w-8">
                {type.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm sm:text-lg font-bold text-slate-950 dark:text-white mb-1 sm:mb-2 group-hover:text-brand-500 transition-colors">
                  {type.title}
                </h3>
                <p className="text-xs sm:text-base text-slate-500 dark:text-slate-400 sm:mb-4 leading-relaxed line-clamp-2">
                  {type.description}
                </p>
                <div className="hidden sm:grid grid-cols-2 gap-2">
                  {type.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <CheckCircle size={14} className="text-brand-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderTemplateSelection = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="text-center mb-5 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white mb-1.5 sm:mb-2">Choose a Roadmap Template</h2>
        <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400">
          Select from our proven success paths designed by experts
        </p>
      </div>

      <div className="grid gap-4">
        {roadmapTemplates.map((template, index) => (
          <Card
            key={template.id}
            className={`cursor-pointer p-4 sm:p-6 hover:shadow-lg transition-all transform hover:scale-[1.01] ${template.color} animate-slide-up group`}
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => handleTemplateSelect(template)}
          >
            <div className="flex items-center gap-3 sm:items-start sm:gap-4">
              <div className="w-11 h-11 sm:w-12 sm:h-12 bg-brand-500/10 rounded-[20px] flex items-center justify-center group-hover:scale-110 transition-transform [&_svg]:h-5 [&_svg]:w-5 sm:[&_svg]:h-6 sm:[&_svg]:w-6">
                {renderTemplateIcon(template)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1 sm:mb-2">
                  <h3 className="text-sm sm:text-lg font-bold text-slate-950 dark:text-white group-hover:text-brand-500 transition-colors line-clamp-2">
                    {template.title}
                  </h3>
                  <span className={`hidden sm:inline-flex px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(template.difficulty)}`}>
                    {template.difficulty}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2 sm:mb-3 leading-relaxed line-clamp-2">
                  {template.description}
                </p>
                <div className="flex items-center gap-3 sm:gap-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    <span>{template.duration}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1">
                    <Flag size={12} />
                    <span>{template.milestones} milestones</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1">
                    <Zap size={12} />
                    <span>{template.estimatedTime}</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-wrap gap-1">
                  {template.skills.slice(0, 3).map((skill, idx) => (
                    <span key={idx} className="px-2 py-1 bg-surface-body rounded-full text-xs text-slate-500 dark:text-slate-400">
                      {skill}
                    </span>
                  ))}
                  {template.skills.length > 3 && (
                    <span className="px-2 py-1 bg-surface-body rounded-full text-xs text-slate-500 dark:text-slate-400">
                      +{template.skills.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-slate-400 group-hover:text-brand-500 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderCustomGoal = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white mb-2">Create Custom Goal</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Build your personalized goal with AI assistance
        </p>
      </div>

      <Card className="bg-surface-layer border-subtle">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Goal Title *
            </label>
            <input
              type="text"
              value={customGoal.title}
              onChange={(e) => setCustomGoal({ ...customGoal, title: e.target.value })}
              className="w-full px-4 py-3 rounded-[20px] border border-subtle bg-surface-body text-slate-950 dark:text-white focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-all"
              placeholder="e.g., Learn Spanish fluently"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Description *
            </label>
            <textarea
              value={customGoal.description}
              onChange={(e) => setCustomGoal({ ...customGoal, description: e.target.value })}
              className="w-full px-4 py-3 rounded-[20px] border border-subtle bg-surface-body text-slate-950 dark:text-white focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-all resize-none"
              placeholder="Describe what you want to achieve and why it's important to you..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Category *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {customCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCustomGoal({ ...customGoal, category: category.id })}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                    customGoal.category === category.id
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-subtle hover:border-brand-500/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {category.icon}
                  <span className="text-sm font-medium">{category.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Target Deadline
            </label>
            <input
              type="date"
              value={customGoal.deadline}
              onChange={(e) => setCustomGoal({ ...customGoal, deadline: e.target.value })}
              className="w-full px-4 py-3 rounded-[20px] border border-subtle bg-surface-body text-slate-950 dark:text-white focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Priority Level
            </label>
            <div className="flex gap-3">
              {(['low', 'medium', 'high'] as const).map((priority) => (
                <button
                  key={priority}
                  onClick={() => setCustomGoal({ ...customGoal, priority })}
                  className={`flex-1 py-3 px-4 rounded-2xl border transition-all capitalize ${
                    customGoal.priority === priority
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                      : 'border-subtle hover:border-brand-500/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleCustomGoalSubmit}
            disabled={!customGoal.title || !customGoal.description || !customGoal.category}
            className="w-full"
          >
            Continue to Details
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderDetails = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white mb-2">Goal Summary</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Review your goal details before creating
        </p>
      </div>

      <Card className="bg-surface-layer border-subtle">
        {selectedType === 'roadmap' && selectedTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-brand-500/10 rounded-[20px] flex items-center justify-center">
                {renderTemplateIcon(selectedTemplate)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">{selectedTemplate.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{selectedTemplate.category}</p>
              </div>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-4">{selectedTemplate.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-surface-body rounded-[20px]">
                <div className="font-semibold text-slate-950 dark:text-white">Duration</div>
                <div className="text-slate-500 dark:text-slate-400">{selectedTemplate.duration}</div>
              </div>
              <div className="p-3 bg-surface-body rounded-[20px]">
                <div className="font-semibold text-slate-950 dark:text-white">Milestones</div>
                <div className="text-slate-500 dark:text-slate-400">{selectedTemplate.milestones}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={downloadTemplateCalendar}
                className="flex items-center justify-center gap-2 rounded-[20px] border border-brand-500/20 bg-brand-500/10 px-4 py-3 text-sm font-bold text-brand-600 dark:text-brand-300"
              >
                <Download size={16} />
                Add to calendar
              </button>
              <button
                type="button"
                onClick={enableTemplateReminderPreview}
                className="flex items-center justify-center gap-2 rounded-[20px] border border-subtle bg-surface-body px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200"
              >
                <Bell size={16} />
                Enable reminders
              </button>
            </div>

            {reminderMessage && (
              <p className="rounded-[20px] bg-surface-body px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                {reminderMessage}
              </p>
            )}

            <div className="rounded-[20px] border border-subtle bg-surface-body p-4">
              <h4 className="mb-2 text-sm font-bold text-slate-950 dark:text-white">Outcomes</h4>
              <ul className="space-y-2">
                {selectedTemplate.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <CheckCircle size={14} className="mt-0.5 shrink-0 text-green-500" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-950 dark:text-white">Detailed guidance</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">{selectedTemplate.reminderCadence}</p>
              </div>
              {selectedTemplate.milestonesPlan.map((milestone) => (
                <div key={`${selectedTemplate.id}-${milestone.week}`} className="rounded-[20px] border border-subtle bg-surface-body p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-600 dark:text-brand-300">
                      Week {milestone.week}
                    </span>
                  </div>
                  <h5 className="font-bold text-slate-950 dark:text-white">{milestone.title}</h5>
                  <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{milestone.guidance}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Deliverable: {milestone.deliverable}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {milestone.resources.map((resource) => (
                      <a
                        key={resource.url}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-layer px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-300"
                      >
                        {resource.title}
                        <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-950 dark:text-white">{customGoal.title}</h3>
            <p className="text-slate-500 dark:text-slate-400">{customGoal.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-surface-body rounded-[20px]">
                <div className="font-semibold text-slate-950 dark:text-white">Category</div>
                <div className="text-slate-500 dark:text-slate-400 capitalize">
                  {customCategories.find(c => c.id === customGoal.category)?.label}
                </div>
              </div>
              <div className="p-3 bg-surface-body rounded-[20px]">
                <div className="font-semibold text-slate-950 dark:text-white">Priority</div>
                <div className="text-slate-500 dark:text-slate-400 capitalize">{customGoal.priority}</div>
              </div>
            </div>
            {customGoal.deadline && (
              <div className="p-3 bg-surface-body rounded-[20px]">
                <div className="font-semibold text-slate-950 dark:text-white">Target Deadline</div>
                <div className="text-slate-500 dark:text-slate-400">
                  {new Date(customGoal.deadline).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="bg-brand-500/10 p-6 rounded-[20px] border border-brand-500/20">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles size={20} className="text-brand-500" />
          <h4 className="font-semibold text-slate-950 dark:text-white">What happens next?</h4>
        </div>
        <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <li className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-500" />
            <span>AI will create a personalized roadmap for your goal</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-500" />
            <span>You'll get milestone tracking and progress updates</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-500" />
            <span>Smart reminders will keep you on track</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle size={14} className="text-green-500" />
            <span>Connect with others working on similar goals</span>
          </li>
        </ul>
      </div>

      {error && (
        <p className="mb-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <Button onClick={handleGoalCreate} className="w-full">
        <Target size={16} className="mr-2" />
        Create My Goal
      </Button>
    </div>
  );

  return (
    <div className={`min-h-screen bg-surface-body text-slate-950 dark:text-white animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      {/* Header */}
      <div className="bg-surface-body/90 backdrop-blur-xl border-b border-subtle sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 rounded-[20px] border-subtle bg-surface-layer text-slate-600 dark:text-slate-300"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">Add New Goal</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {step === 'type' && 'Choose how to create your goal'}
                {step === 'template' && 'Select a roadmap template'}
                {step === 'custom' && 'Create your custom goal'}
                {step === 'details' && 'Review and confirm'}
              </p>
            </div>
            <Target size={24} className="text-brand-500" />
          </div>
        </div>
      </div>

      <div className="p-4">
        {step === 'type' && renderTypeSelection()}
        {step === 'template' && renderTemplateSelection()}
        {step === 'custom' && renderCustomGoal()}
        {step === 'details' && renderDetails()}
      </div>
    </div>
  );
};

export default AddGoalScreen;

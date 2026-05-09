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

interface AddGoalScreenProps {
  onBack: () => void;
  onGoalCreated?: (goal: Goal) => void;
  onNavigate?: (screen: string) => void;
  user: AppUser | null;
}

const AddGoalScreen: React.FC<AddGoalScreenProps> = ({ onBack, onGoalCreated, onNavigate, user }) => {
  const [step, setStep] = useState<'type' | 'template' | 'custom' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<'roadmap' | 'custom' | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
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
      icon: <BookOpen size={32} className="text-blue-600" />,
      features: ['Pre-built milestones', 'Expert guidance', 'Proven strategies', 'Community support'],
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800'
    },
    {
      id: 'custom',
      title: 'Create Custom Goal',
      description: 'Build your own personalized goal from scratch with AI assistance and flexible planning',
      icon: <Plus size={32} className="text-purple-600" />,
      features: ['Complete flexibility', 'AI assistance', 'Custom milestones', 'Personal tracking'],
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-200 dark:border-purple-800'
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

  const roadmapTemplates = [
    {
      id: 'python-course',
      title: 'Complete Python Programming Course',
      description: 'Master Python from basics to advanced concepts with hands-on projects',
      duration: '12 weeks',
      difficulty: 'Beginner to Intermediate',
      icon: <BookOpen size={24} className="text-blue-600" />,
      category: 'Programming',
      milestones: 12,
      estimatedTime: '3-4 hours/week',
      skills: ['Python Basics', 'Data Structures', 'Web Development', 'APIs'],
      color: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
    },
    {
      id: 'scholarship-applications',
      title: 'Apply to 5 International Scholarships',
      description: 'Strategic approach to scholarship applications with timeline and requirements',
      duration: '16 weeks',
      difficulty: 'Intermediate',
      icon: <GraduationCap size={24} className="text-green-600" />,
      category: 'Education',
      milestones: 15,
      estimatedTime: '5-6 hours/week',
      skills: ['Research', 'Essay Writing', 'Application Strategy', 'Interview Prep'],
      color: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    },
    {
      id: 'portfolio-website',
      title: 'Build Professional Portfolio Website',
      description: 'Create a stunning portfolio to showcase your skills and projects',
      duration: '8 weeks',
      difficulty: 'Beginner to Intermediate',
      icon: <Briefcase size={24} className="text-purple-600" />,
      category: 'Career',
      milestones: 8,
      estimatedTime: '4-5 hours/week',
      skills: ['Web Design', 'HTML/CSS', 'JavaScript', 'Portfolio Strategy'],
      color: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
    },
    {
      id: 'leadership-skills',
      title: 'Develop Leadership & Communication Skills',
      description: 'Build essential leadership qualities and communication expertise',
      duration: '10 weeks',
      difficulty: 'All Levels',
      icon: <Users size={24} className="text-orange-600" />,
      category: 'Personal Development',
      milestones: 10,
      estimatedTime: '3-4 hours/week',
      skills: ['Public Speaking', 'Team Management', 'Conflict Resolution', 'Emotional Intelligence'],
      color: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
    },
    {
      id: 'startup-launch',
      title: 'Launch Your First Startup',
      description: 'Complete guide from idea validation to product launch and marketing',
      duration: '20 weeks',
      difficulty: 'Advanced',
      icon: <Rocket size={24} className="text-red-600" />,
      category: 'Entrepreneurship',
      milestones: 18,
      estimatedTime: '8-10 hours/week',
      skills: ['Business Planning', 'Market Research', 'Product Development', 'Marketing'],
      color: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
    },
    {
      id: 'fitness-health',
      title: 'Complete Health & Fitness Transformation',
      description: 'Comprehensive wellness program for physical and mental health',
      duration: '16 weeks',
      difficulty: 'All Levels',
      icon: <Heart size={24} className="text-pink-600" />,
      category: 'Health & Wellness',
      milestones: 12,
      estimatedTime: '5-6 hours/week',
      skills: ['Exercise Planning', 'Nutrition', 'Mental Health', 'Habit Building'],
      color: 'bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800'
    }
  ];

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

  const handleTemplateSelect = (template: any) => {
    setError(null);
    setSelectedTemplate(template);
    setStep('details');
  };

  const handleCustomGoalSubmit = () => {
    if (customGoal.title && customGoal.description && customGoal.category) {
      setError(null);
      setStep('details');
    }
  };

  const handleGoalCreate = () => {
    setError(null);

    if (selectedType === 'roadmap') {
      if (!selectedTemplate) {
        setError('Select a roadmap template before continuing.');
        return;
      }
      const goal = createGoal({
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
      const goal = createGoal({
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
      default: return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const renderTypeSelection = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Target size={32} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Create Your Goal</h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
          Choose how you'd like to create your goal. We'll guide you every step of the way.
        </p>
      </div>

      {/* Community Marketplace Banner */}
      <Card
        className={`cursor-pointer hover:shadow-lg transition-all transform hover:scale-[1.02] bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border-green-200 dark:border-green-800 animate-slide-up group`}
        onClick={handleCommunityMarketplace}
      >
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
            <Globe size={32} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2 group-hover:text-primary transition-colors">
              🌟 Community Roadmap Marketplace
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
              Discover proven success paths shared by accomplished community members. Learn from real achievements!
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
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
          <ChevronRight size={20} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </Card>

      <div className="space-y-4">
        {goalTypes.map((type, index) => (
          <Card
            key={type.id}
            className={`cursor-pointer hover:shadow-lg transition-all transform hover:scale-[1.02] ${type.bgColor} ${type.borderColor} animate-slide-up group`}
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => handleTypeSelect(type.id as 'roadmap' | 'custom')}
          >
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-white dark:bg-gray-700 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                {type.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2 group-hover:text-primary transition-colors">
                  {type.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                  {type.description}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {type.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <CheckCircle size={14} className="text-green-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
              <ChevronRight size={20} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderTemplateSelection = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Choose a Roadmap Template</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select from our proven success paths designed by experts
        </p>
      </div>

      <div className="grid gap-4">
        {roadmapTemplates.map((template, index) => (
          <Card
            key={template.id}
            className={`cursor-pointer hover:shadow-lg transition-all transform hover:scale-[1.01] ${template.color} animate-slide-up group`}
            style={{ animationDelay: `${index * 100}ms` }}
            onClick={() => handleTemplateSelect(template)}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-white dark:bg-gray-700 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                {template.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-white group-hover:text-primary transition-colors">
                    {template.title}
                  </h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(template.difficulty)}`}>
                    {template.difficulty}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm leading-relaxed">
                  {template.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    <span>{template.duration}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Flag size={12} />
                    <span>{template.milestones} milestones</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap size={12} />
                    <span>{template.estimatedTime}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {template.skills.slice(0, 3).map((skill, idx) => (
                    <span key={idx} className="px-2 py-1 bg-white/50 dark:bg-gray-700/50 rounded-full text-xs text-gray-600 dark:text-gray-400">
                      {skill}
                    </span>
                  ))}
                  {template.skills.length > 3 && (
                    <span className="px-2 py-1 bg-white/50 dark:bg-gray-700/50 rounded-full text-xs text-gray-600 dark:text-gray-400">
                      +{template.skills.length - 3} more
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} className="text-gray-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderCustomGoal = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Create Custom Goal</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Build your personalized goal with AI assistance
        </p>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Goal Title *
            </label>
            <input
              type="text"
              value={customGoal.title}
              onChange={(e) => setCustomGoal({ ...customGoal, title: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              placeholder="e.g., Learn Spanish fluently"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description *
            </label>
            <textarea
              value={customGoal.description}
              onChange={(e) => setCustomGoal({ ...customGoal, description: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
              placeholder="Describe what you want to achieve and why it's important to you..."
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Category *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {customCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setCustomGoal({ ...customGoal, category: category.id })}
                  className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                    customGoal.category === category.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 dark:border-gray-600 hover:border-primary/50 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {category.icon}
                  <span className="text-sm font-medium">{category.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Deadline
            </label>
            <input
              type="date"
              value={customGoal.deadline}
              onChange={(e) => setCustomGoal({ ...customGoal, deadline: e.target.value })}
              className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Priority Level
            </label>
            <div className="flex gap-3">
              {['low', 'medium', 'high'].map((priority) => (
                <button
                  key={priority}
                  onClick={() => setCustomGoal({ ...customGoal, priority })}
                  className={`flex-1 py-3 px-4 rounded-2xl border transition-all capitalize ${
                    customGoal.priority === priority
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-gray-200 dark:border-gray-600 hover:border-primary/50 text-gray-700 dark:text-gray-300'
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
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Goal Summary</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Review your goal details before creating
        </p>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        {selectedType === 'roadmap' && selectedTemplate ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                {selectedTemplate.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{selectedTemplate.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{selectedTemplate.category}</p>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">{selectedTemplate.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="font-medium text-gray-800 dark:text-white">Duration</div>
                <div className="text-gray-600 dark:text-gray-400">{selectedTemplate.duration}</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="font-medium text-gray-800 dark:text-white">Milestones</div>
                <div className="text-gray-600 dark:text-gray-400">{selectedTemplate.milestones}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{customGoal.title}</h3>
            <p className="text-gray-600 dark:text-gray-400">{customGoal.description}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="font-medium text-gray-800 dark:text-white">Category</div>
                <div className="text-gray-600 dark:text-gray-400 capitalize">
                  {customCategories.find(c => c.id === customGoal.category)?.label}
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="font-medium text-gray-800 dark:text-white">Priority</div>
                <div className="text-gray-600 dark:text-gray-400 capitalize">{customGoal.priority}</div>
              </div>
            </div>
            {customGoal.deadline && (
              <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div className="font-medium text-gray-800 dark:text-white">Target Deadline</div>
                <div className="text-gray-600 dark:text-gray-400">
                  {new Date(customGoal.deadline).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="bg-gradient-to-r from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 p-6 rounded-2xl border border-primary/20 dark:border-primary/30">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles size={20} className="text-primary" />
          <h4 className="font-semibold text-gray-800 dark:text-white">What happens next?</h4>
        </div>
        <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
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
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      {/* Header */}
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
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Add New Goal</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {step === 'type' && 'Choose how to create your goal'}
                {step === 'template' && 'Select a roadmap template'}
                {step === 'custom' && 'Create your custom goal'}
                {step === 'details' && 'Review and confirm'}
              </p>
            </div>
            <Target size={24} className="text-primary" />
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

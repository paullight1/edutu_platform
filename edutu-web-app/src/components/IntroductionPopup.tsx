import React, { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { X, ChevronRight, ChevronLeft, Sparkles, Target, BookOpen, Briefcase, Heart, Globe } from 'lucide-react';
import Button from './ui/Button';
import { useDarkMode } from '../hooks/useDarkMode';
import type { OnboardingProfileData } from '../types/onboarding';

interface IntroductionPopupProps {
  isOpen: boolean;
  onComplete: (userData: OnboardingProfileData | null) => void | Promise<void>;
  userName: string;
  initialData?: OnboardingProfileData | null;
}

interface IntroductionFormData {
  fullName: string;
  age: string;
  courseOfStudy: string;
  interests: string[];
  goals: string[];
  experience: string;
  location: string;
  education: string;
  preferredLearning: string[];
}

const createInitialFormData = (data: OnboardingProfileData | null | undefined, fallbackName: string): IntroductionFormData => ({
  fullName: data?.fullName ?? fallbackName,
  age: data?.age !== null && data?.age !== undefined ? String(data.age) : '',
  courseOfStudy: data?.courseOfStudy ?? '',
  interests: [...(data?.interests ?? [])],
  goals: [...(data?.goals ?? [])],
  experience: data?.experience ?? '',
  location: data?.location ?? '',
  education: data?.educationLevel ?? '',
  preferredLearning: [...(data?.preferredLearning ?? [])]
});

const IntroductionPopup: React.FC<IntroductionPopupProps> = ({ isOpen, onComplete, userName, initialData }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<IntroductionFormData>(() => createInitialFormData(initialData, userName));
  const { isDarkMode } = useDarkMode();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFormData(createInitialFormData(initialData, userName));
    setCurrentStep(0);
  }, [initialData, isOpen, userName]);

  const steps = [
    {
      title: "Welcome to Edutu!",
      subtitle: `Hi ${userName}! I'm your AI opportunity coach`,
      content: "welcome"
    },
    {
      title: "Let's get to know you",
      subtitle: "Share a few essentials so we can tailor your experience",
      content: "basics"
    },
    {
      title: "What interests you most?",
      subtitle: "Select all that apply - this helps me find the best opportunities for you",
      content: "interests"
    },
    {
      title: "What are your main goals?",
      subtitle: "Choose your primary objectives so I can create personalized roadmaps",
      content: "goals"
    },
    {
      title: "Tell me about your background",
      subtitle: "This helps me understand your starting point and recommend appropriate opportunities",
      content: "background"
    },
    {
      title: "How do you prefer to learn?",
      subtitle: "I'll customize your experience based on your learning style",
      content: "learning"
    },
    {
      title: "Perfect! Let's get started",
      subtitle: "I'm analyzing your profile to find the best opportunities for you",
      content: "completion"
    }
  ];

  const interestOptions = [
    { id: 'technology', label: 'Technology & Programming', icon: '💻' },
    { id: 'business', label: 'Business & Entrepreneurship', icon: '💼' },
    { id: 'education', label: 'Education & Research', icon: '🎓' },
    { id: 'healthcare', label: 'Healthcare & Medicine', icon: '🏥' },
    { id: 'arts', label: 'Arts & Creative Fields', icon: '🎨' },
    { id: 'science', label: 'Science & Engineering', icon: '🔬' },
    { id: 'social', label: 'Social Impact & NGOs', icon: '🌍' },
    { id: 'finance', label: 'Finance & Economics', icon: '💰' }
  ];

  const goalOptions = [
    { id: 'scholarship', label: 'Get Scholarships', icon: '🎓' },
    { id: 'job', label: 'Find Job Opportunities', icon: '💼' },
    { id: 'skills', label: 'Develop New Skills', icon: '📚' },
    { id: 'network', label: 'Build Professional Network', icon: '🤝' },
    { id: 'startup', label: 'Start a Business', icon: '🚀' },
    { id: 'leadership', label: 'Develop Leadership', icon: '👑' },
    { id: 'research', label: 'Pursue Research', icon: '🔍' },
    { id: 'travel', label: 'Study/Work Abroad', icon: '✈️' }
  ];

  const learningOptions = [
    { id: 'visual', label: 'Visual Learning', icon: '👁️', desc: 'Charts, diagrams, videos' },
    { id: 'hands-on', label: 'Hands-on Practice', icon: '🛠️', desc: 'Projects and exercises' },
    { id: 'reading', label: 'Reading & Research', icon: '📖', desc: 'Articles and documentation' },
    { id: 'community', label: 'Community Learning', icon: '👥', desc: 'Group discussions and forums' },
    { id: 'mentorship', label: 'One-on-One Mentorship', icon: '🎯', desc: 'Personal guidance' },
    { id: 'structured', label: 'Structured Courses', icon: '📋', desc: 'Step-by-step curriculum' }
  ];

  const handleMultiSelect = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field as keyof typeof prev].includes(value)
        ? (prev[field as keyof typeof prev] as string[]).filter(item => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }));
  };

  const handleFieldChange =
    (field: keyof IntroductionFormData) =>
      (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { value } = event.target;
        setFormData((previous) => ({
          ...previous,
          [field]: value
        }));
      };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((previous) => previous + 1);
      return;
    }

    const parsedAge = Number.parseInt(formData.age.trim(), 10);
    const sanitizedData: OnboardingProfileData = {
      fullName: formData.fullName.trim(),
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : null,
      courseOfStudy: formData.courseOfStudy.trim(),
      interests: [...formData.interests],
      goals: [...formData.goals],
      educationLevel: formData.education.trim(),
      location: formData.location.trim(),
      experience: formData.experience.trim(),
      preferredLearning: [...formData.preferredLearning]
    };

    onComplete(sanitizedData);
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const canProceed = () => {
    const currentContent = steps[currentStep]?.content;
    switch (currentContent) {
      case 'welcome':
        return true;
      case 'basics': {
        const ageValue = Number.parseInt(formData.age.trim(), 10);
        return (
          Boolean(formData.fullName.trim()) &&
          Boolean(formData.courseOfStudy.trim()) &&
          Number.isFinite(ageValue) &&
          ageValue > 0
        );
      }
      case 'interests':
        return formData.interests.length > 0;
      case 'goals':
        return formData.goals.length > 0;
      case 'background':
        return Boolean(formData.experience.trim() && formData.location.trim() && formData.education.trim());
      case 'learning':
        return formData.preferredLearning.length > 0;
      case 'completion':
        return true;
      default:
        return false;
    }
  };

  if (!isOpen) return null;

  const renderStepContent = () => {
    const step = steps[currentStep];

    switch (step.content) {
      case 'welcome':
        return (
          <div className="text-center py-4 sm:py-6">
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 bg-brand-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
              <div className="relative w-24 h-24 bg-gradient-to-tr from-brand-600 to-accent-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-brand-500/20 rotate-3 transition-transform hover:rotate-0">
                <Sparkles size={48} className="text-white" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white p-2 rounded-xl shadow-lg animate-bounce-subtle">
                <Target size={16} />
              </div>
            </div>
            <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">
              Ready for your next breakthrough?
            </h3>
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed">
              I'm Edutu, your personal growth catalyst. Together, we'll map out your future using data-driven insights and AI coaching.
            </p>
          </div>
        );

      case 'basics':
        return (
          <div className="grid gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                Full name
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={handleFieldChange('fullName')}
                placeholder="Enter your name"
                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                  Age
                </label>
                <input
                  type="number"
                  min="10"
                  max="80"
                  value={formData.age}
                  onChange={handleFieldChange('age')}
                  placeholder="Yrs"
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                  Major / Field
                </label>
                <input
                  type="text"
                  value={formData.courseOfStudy}
                  onChange={handleFieldChange('courseOfStudy')}
                  placeholder="e.g., Design"
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        );

      case 'interests':
        return (
          <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2 scrollbar-none">
            {interestOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleMultiSelect('interests', option.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center relative overflow-hidden group ${formData.interests.includes(option.id)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 hover:border-brand-500/30 text-slate-700 dark:text-slate-300'
                  }`}
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">{option.icon}</span>
                <span className="text-sm font-bold tracking-tight">{option.label}</span>
                {formData.interests.includes(option.id) && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        );

      case 'goals':
        return (
          <div className="grid grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-2 scrollbar-none">
            {goalOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleMultiSelect('goals', option.id)}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all text-center relative overflow-hidden group ${formData.goals.includes(option.id)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 hover:border-brand-500/30 text-slate-700 dark:text-slate-300'
                  }`}
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">{option.icon}</span>
                <span className="text-sm font-bold tracking-tight">{option.label}</span>
                {formData.goals.includes(option.id) && (
                  <div className="absolute top-2 right-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        );

      case 'background':
        return (
          <div className="grid gap-5">
            <div className="space-y-2">
              <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                Education
              </label>
              <select
                value={formData.education}
                onChange={handleFieldChange('education')}
                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white appearance-none"
              >
                <option value="">Select level...</option>
                <option value="high-school">High School</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="graduate">Graduate</option>
                <option value="postgraduate">Postgraduate</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={handleFieldChange('location')}
                placeholder="City, Country"
                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400 px-1">
                Experience
              </label>
              <select
                value={formData.experience}
                onChange={handleFieldChange('experience')}
                className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all font-medium text-slate-900 dark:text-white appearance-none"
              >
                <option value="">Select experience...</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>
        );

      case 'learning':
        return (
          <div className="grid gap-3">
            {learningOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleMultiSelect('preferredLearning', option.id)}
                className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${formData.preferredLearning.includes(option.id)
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                    : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900/50 hover:border-brand-500/30 text-slate-700 dark:text-slate-300'
                  }`}
              >
                <div className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl transition-all ${formData.preferredLearning.includes(option.id) ? 'bg-brand-500 text-white scale-110' : 'bg-slate-200 dark:bg-slate-800'
                  }`}>
                  {option.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">{option.label}</div>
                  <div className="text-xs opacity-60 truncate">{option.desc}</div>
                </div>
                {formData.preferredLearning.includes(option.id) && (
                  <div className="w-5 h-5 rounded-full bg-brand-500 flex items-center justify-center">
                    <Sparkles size={10} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        );

      case 'completion':
        return (
          <div className="text-center py-4 sm:py-6">
            <div className="relative inline-block mb-8">
              <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full scale-150 animate-pulse" />
              <div className="relative w-24 h-24 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20 rotate-3">
                <Globe size={48} className="text-white animate-spin-slow" />
              </div>
            </div>
            <h3 className="text-2xl font-display font-bold text-gray-900 dark:text-white mb-3">
              You're all set!
            </h3>
            <p className="text-base text-gray-600 dark:text-gray-400 max-w-md mx-auto leading-relaxed mb-6">
              I'm now tailoring a discovery board specifically for your {formData.interests.length} focus areas.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-bold tracking-widest">
              <BookOpen size={14} />
              Configuring High-Impact Path
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className={`w-full max-w-md bg-white dark:bg-gray-950 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col transition-all duration-500 border border-slate-200 dark:border-white/5 ${isDarkMode ? 'dark' : ''}`}>
        {/* Header Section */}
        <div className="relative px-8 pt-8 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-bold tracking-widest border border-brand-500/20">
                  Step {currentStep + 1}
                </span>
                <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white leading-tight">
                {steps[currentStep].title}
              </h2>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">
                {steps[currentStep].subtitle}
              </p>
            </div>
            <button
              onClick={() => onComplete(null)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-2xl transition-colors text-slate-400"
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress Indicator */}
          <div className="mt-6 flex gap-1.5">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentStep
                    ? 'w-12 bg-brand-500'
                    : idx < currentStep
                      ? 'w-4 bg-emerald-500'
                      : 'w-4 bg-slate-100 dark:bg-white/5'
                  }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 px-8 py-4 overflow-y-auto scrollbar-none min-h-[300px]">
          <div className="animate-fade-in-up">
            {renderStepContent()}
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-8 pt-4">
          <div className="flex items-center gap-4">
            {currentStep > 0 && (
              <Button
                variant="secondary"
                onClick={handlePrevious}
                className="h-14 px-6 rounded-2xl border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center justify-center shrink-0"
              >
                <ChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`flex-1 h-14 rounded-2xl font-bold text-sm tracking-wide gap-2 shadow-xl transition-all active:scale-95 ${canProceed()
                  ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-brand-500/25 hover:shadow-brand-500/40'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed border-none'
                }`}
            >
              <span className="flex-1">{currentStep === steps.length - 1 ? 'Unlock My Dashboard' : 'Next Step'}</span>
              <ChevronRight size={18} className={canProceed() ? 'animate-bounce-right' : ''} />
            </Button>
          </div>

          {currentStep === 0 && (
            <p className="text-[10px] text-center font-bold text-slate-400 tracking-[0.2em] mt-6 animate-pulse">
              Takes less than 2 minutes
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntroductionPopup;






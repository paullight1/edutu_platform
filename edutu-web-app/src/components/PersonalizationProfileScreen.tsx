/**
 * PersonalizationProfileScreen
 * A full-page screen for viewing and editing personalization profile settings.
 * Used when user clicks "Personalization profile" in Settings.
 * Unlike the IntroductionPopup (for new users), this is a straightforward edit form.
 */

import React, { useEffect, useState } from 'react';
import {
    ArrowLeft,
    Save,
    Target,
    BookOpen,
    Briefcase,
    Heart,
    Globe,
    User,
    MapPin,
    GraduationCap,
    Loader2,
    CheckCircle2,
    ChevronRight,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { authService } from '../lib/auth';
import { fetchUserProfile, saveOnboardingProfile, extractOnboardingState } from '../services/profile';
import type { OnboardingProfileData } from '../types/onboarding';
import type { AppUser } from '../types/user';

interface PersonalizationProfileScreenProps {
    user: AppUser | null;
    onBack: () => void;
    onSave?: (data: OnboardingProfileData) => void;
}

// Available options for multi-select fields
const INTEREST_OPTIONS = [
    'Technology', 'Business', 'Health', 'Education', 'Arts',
    'Science', 'Engineering', 'Finance', 'Marketing', 'Design',
    'AI & Machine Learning', 'Data Science', 'Entrepreneurship'
];

const GOAL_OPTIONS = [
    'Get a Job', 'Start a Business', 'Learn New Skills', 'Get Certified',
    'Win Scholarships', 'Build Portfolio', 'Network', 'Career Change',
    'Higher Education', 'Freelancing', 'Research'
];

const LEARNING_STYLE_OPTIONS = [
    'Visual', 'Hands-on', 'Reading', 'Video', 'Interactive',
    'Group Learning', 'Self-paced', 'Mentorship'
];

const EDUCATION_LEVELS = [
    { value: 'high-school', label: 'High School' },
    { value: 'undergraduate', label: 'Undergraduate' },
    { value: 'graduate', label: 'Graduate' },
    { value: 'postgraduate', label: 'Postgraduate' },
    { value: 'professional', label: 'Professional' },
];

const EXPERIENCE_LEVELS = [
    { value: 'beginner', label: 'Beginner', desc: 'Just starting out' },
    { value: 'intermediate', label: 'Intermediate', desc: 'Some experience' },
    { value: 'advanced', label: 'Advanced', desc: 'Highly experienced' },
];

interface FormData {
    fullName: string;
    age: string;
    courseOfStudy: string;
    interests: string[];
    goals: string[];
    experience: string;
    location: string;
    educationLevel: string;
    preferredLearning: string[];
}

const DEFAULT_FORM: FormData = {
    fullName: '',
    age: '',
    courseOfStudy: '',
    interests: [],
    goals: [],
    experience: 'intermediate',
    location: '',
    educationLevel: 'undergraduate',
    preferredLearning: [],
};

const PROFILE_STEPS = [
    {
        id: 'basic',
        title: 'Basic Information',
        subtitle: 'Tell us who you are and where you are building from.',
        icon: User,
    },
    {
        id: 'education',
        title: 'Education',
        subtitle: 'Help us understand your current learning path.',
        icon: GraduationCap,
    },
    {
        id: 'goals',
        title: 'Goals & Experience',
        subtitle: 'Choose the outcomes and experience level that fit you.',
        icon: Target,
    },
    {
        id: 'preferences',
        title: 'Preferences',
        subtitle: 'Pick interests and learning styles for better matches.',
        icon: BookOpen,
    },
] as const;

const PersonalizationProfileScreen: React.FC<PersonalizationProfileScreenProps> = ({
    user,
    onBack,
    onSave,
}) => {
    const { isDarkMode } = useDarkMode();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [formData, setFormData] = useState<FormData>(DEFAULT_FORM);
    const [activeStep, setActiveStep] = useState(0);

    // Load existing profile data
    useEffect(() => {
        const loadProfile = async () => {
            if (!user?.id) {
                setIsLoading(false);
                return;
            }

            try {
                const profile = await fetchUserProfile(user.id);
                const onboardingState = extractOnboardingState(profile);

                if (onboardingState?.data) {
                    const data = onboardingState.data;
                    setFormData({
                        fullName: data.fullName || user.name || '',
                        age: data.age?.toString() || '',
                        courseOfStudy: data.courseOfStudy || '',
                        interests: data.interests || [],
                        goals: data.goals || [],
                        experience: data.experience || 'intermediate',
                        location: data.location || '',
                        educationLevel: data.educationLevel || 'undergraduate',
                        preferredLearning: data.preferredLearning || [],
                    });
                } else {
                    // Use user's basic info
                    setFormData((prev) => ({
                        ...prev,
                        fullName: user.name || '',
                        age: user.age?.toString() || '',
                        courseOfStudy: user.courseOfStudy || '',
                    }));
                }
            } catch (error) {
                console.error('Failed to load personalization profile:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadProfile();
    }, [user]);

    const handleFieldChange = (field: keyof FormData, value: string | string[]) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    const handleMultiSelect = (field: 'interests' | 'goals' | 'preferredLearning', value: string) => {
        setFormData((prev) => {
            const current = prev[field] as string[];
            if (current.includes(value)) {
                return { ...prev, [field]: current.filter((v) => v !== value) };
            }
            return { ...prev, [field]: [...current, value] };
        });
    };

    const handleSave = async () => {
        if (!user?.id) {
            setSaveMessage('Please sign in to save your profile.');
            return;
        }

        setIsSaving(true);
        setSaveMessage(null);

        try {
            const profileData: OnboardingProfileData = {
                fullName: formData.fullName.trim(),
                age: formData.age ? parseInt(formData.age, 10) : null,
                courseOfStudy: formData.courseOfStudy.trim(),
                interests: formData.interests,
                goals: formData.goals,
                experience: formData.experience,
                location: formData.location.trim(),
                educationLevel: formData.educationLevel,
                preferredLearning: formData.preferredLearning,
            };

            await saveOnboardingProfile(user.id, profileData);

            setSaveMessage('Profile saved successfully! Your recommendations will be personalized.');

            if (onSave) {
                onSave(profileData);
            }

            // Clear message after a delay
            setTimeout(() => setSaveMessage(null), 4000);
        } catch (error) {
            console.error('Failed to save personalization profile:', error);
            setSaveMessage('Failed to save profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBack = () => {
        scrollToTop();
        onBack();
    };

    const currentStep = PROFILE_STEPS[activeStep];
    const CurrentStepIcon = currentStep.icon;
    const isFirstStep = activeStep === 0;
    const isLastStep = activeStep === PROFILE_STEPS.length - 1;

    const goToNextStep = () => {
        setActiveStep((step) => Math.min(step + 1, PROFILE_STEPS.length - 1));
        scrollToTop();
    };

    const goToPreviousStep = () => {
        setActiveStep((step) => Math.max(step - 1, 0));
        scrollToTop();
    };

    const inputClassName = 'w-full px-4 py-3 rounded-[20px] border border-subtle bg-surface-layer text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 dark:text-white dark:placeholder:text-slate-500';
    const mutedTextClassName = isDarkMode ? 'text-slate-400' : 'text-slate-500';
    const cardClassName = 'border-subtle bg-surface-layer shadow-sm hover:shadow-sm hover:border-subtle';

    const renderStepContent = () => {
        if (currentStep.id === 'basic') {
            return (
                <Card className={cardClassName}>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => handleFieldChange('fullName', e.target.value)}
                                placeholder="Your full name"
                                className={inputClassName}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Age
                                </label>
                                <input
                                    type="number"
                                    value={formData.age}
                                    onChange={(e) => handleFieldChange('age', e.target.value)}
                                    placeholder="Age"
                                    min="10"
                                    max="100"
                                    className={inputClassName}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                    Location
                                </label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        placeholder="City"
                                        className={`${inputClassName} pl-10`}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            );
        }

        if (currentStep.id === 'education') {
            return (
                <Card className={cardClassName}>
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Course/Field of Study
                            </label>
                            <input
                                type="text"
                                value={formData.courseOfStudy}
                                onChange={(e) => handleFieldChange('courseOfStudy', e.target.value)}
                                placeholder="e.g., Computer Science, Medicine"
                                className={inputClassName}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                                Education Level
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {EDUCATION_LEVELS.map((level) => (
                                    <button
                                        key={level.value}
                                        type="button"
                                        onClick={() => handleFieldChange('educationLevel', level.value)}
                                        className={`px-4 py-3 rounded-[20px] text-sm font-semibold transition-all border ${formData.educationLevel === level.value
                                                ? 'bg-brand-500 text-white border-brand-500 shadow-lg shadow-brand-500/20'
                                                : 'bg-surface-body text-slate-600 border-subtle hover:border-brand-500/30 dark:text-slate-300'
                                            }`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>
            );
        }

        if (currentStep.id === 'goals') {
            return (
                <div className="space-y-4">
                    <Card className={cardClassName}>
                        <div className="flex items-center gap-2 mb-4">
                            <Briefcase size={19} className="text-brand-500" />
                            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                                Experience Level
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {EXPERIENCE_LEVELS.map((level) => (
                                <button
                                    key={level.value}
                                    type="button"
                                    onClick={() => handleFieldChange('experience', level.value)}
                                    className={`w-full p-4 rounded-[20px] text-left transition-all border ${formData.experience === level.value
                                            ? 'bg-brand-500/10 border-brand-500 text-slate-950 dark:text-white'
                                            : 'bg-surface-body border-subtle text-slate-700 hover:border-brand-500/30 dark:text-slate-300'
                                        }`}
                                >
                                    <div className="font-semibold">{level.label}</div>
                                    <div className={`text-sm ${mutedTextClassName}`}>{level.desc}</div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Card className={cardClassName}>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                            Career Goals
                        </h3>
                        <p className={`text-sm mb-4 ${mutedTextClassName}`}>Select the outcomes you want Edutu to support.</p>
                        <div className="flex flex-wrap gap-2">
                            {GOAL_OPTIONS.map((goal) => (
                                <button
                                    key={goal}
                                    type="button"
                                    onClick={() => handleMultiSelect('goals', goal)}
                                    className={`px-4 py-2.5 rounded-[20px] text-sm font-semibold transition-all border ${formData.goals.includes(goal)
                                            ? 'bg-brand-500 text-white border-brand-500'
                                            : 'bg-surface-body text-slate-600 border-subtle hover:border-brand-500/30 dark:text-slate-300'
                                        }`}
                                >
                                    {goal}
                                </button>
                            ))}
                        </div>
                    </Card>
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <Card className={cardClassName}>
                    <div className="flex items-center gap-2 mb-2">
                        <Heart size={19} className="text-brand-500" />
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                            Interests
                        </h3>
                    </div>
                    <p className={`text-sm mb-4 ${mutedTextClassName}`}>Choose areas that should shape your opportunity feed.</p>
                    <div className="flex flex-wrap gap-2">
                        {INTEREST_OPTIONS.map((interest) => (
                            <button
                                key={interest}
                                type="button"
                                onClick={() => handleMultiSelect('interests', interest)}
                                className={`px-4 py-2.5 rounded-[20px] text-sm font-semibold transition-all border ${formData.interests.includes(interest)
                                        ? 'bg-brand-500 text-white border-brand-500'
                                        : 'bg-surface-body text-slate-600 border-subtle hover:border-brand-500/30 dark:text-slate-300'
                                    }`}
                            >
                                {interest}
                            </button>
                        ))}
                    </div>
                </Card>

                <Card className={cardClassName}>
                    <div className="flex items-center gap-2 mb-2">
                        <BookOpen size={19} className="text-brand-500" />
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                            Learning Preferences
                        </h3>
                    </div>
                    <p className={`text-sm mb-4 ${mutedTextClassName}`}>Tell us how you prefer to learn and act.</p>
                    <div className="flex flex-wrap gap-2">
                        {LEARNING_STYLE_OPTIONS.map((style) => (
                            <button
                                key={style}
                                type="button"
                                onClick={() => handleMultiSelect('preferredLearning', style)}
                                className={`px-4 py-2.5 rounded-[20px] text-sm font-semibold transition-all border ${formData.preferredLearning.includes(style)
                                        ? 'bg-brand-500 text-white border-brand-500'
                                        : 'bg-surface-body text-slate-600 border-subtle hover:border-brand-500/30 dark:text-slate-300'
                                    }`}
                            >
                                {style}
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className={`min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
                <div className="text-center">
                    <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">Loading your profile...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-surface-body text-slate-950 dark:text-white ${isDarkMode ? 'dark' : ''}`}>
            <div className="sticky top-0 z-10 border-b border-subtle bg-surface-body/90 backdrop-blur-xl">
                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] border border-subtle bg-surface-layer text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                            aria-label="Back"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                                Personalization
                            </h1>
                            <p className={`text-sm ${mutedTextClassName}`}>
                                Step {activeStep + 1} of {PROFILE_STEPS.length}
                            </p>
                        </div>
                        {isLastStep && (
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[20px] border border-brand-500/20 bg-brand-500 text-white shadow-lg shadow-brand-500/20 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-70"
                                aria-label="Save personalization profile"
                                title="Save profile"
                            >
                                {isSaving ? (
                                    <Loader2 size={18} className="animate-spin" />
                                ) : (
                                    <Save size={18} />
                                )}
                            </button>
                        )}
                    </div>
                    {saveMessage && (
                        <p className={`mt-3 text-sm flex items-center gap-2 ${saveMessage.includes('Failed') ? 'text-red-500' : 'text-emerald-500'}`}>
                            <CheckCircle2 size={16} />
                            {saveMessage}
                        </p>
                    )}
                </div>
            </div>

            <div className="p-4 pb-28">
                <section className="relative overflow-hidden rounded-[20px] border border-brand-500/20 bg-gradient-to-br from-brand-500 to-indigo-600 p-5 text-white shadow-lg shadow-brand-500/15">
                    <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:14px_14px]" />
                    <div className="relative">
                        <div className="mb-5 flex items-center gap-2">
                            {PROFILE_STEPS.map((step, index) => (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => setActiveStep(index)}
                                    className={`h-2 flex-1 rounded-full transition-all ${index <= activeStep ? 'bg-white' : 'bg-white/25'}`}
                                    aria-label={`Go to ${step.title}`}
                                />
                            ))}
                        </div>
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[20px] bg-white/15 ring-1 ring-white/20">
                                <CurrentStepIcon size={22} />
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-white/70">
                                    Personalization profile
                                </p>
                                <h2 className="mt-1 text-2xl font-black tracking-tight">
                                    {currentStep.title}
                                </h2>
                                <p className="mt-2 text-sm font-medium leading-relaxed text-white/78">
                                    {currentStep.subtitle}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="mt-5">
                    {renderStepContent()}
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-subtle bg-surface-body/92 p-4 backdrop-blur-xl">
                <div className="mx-auto flex max-w-3xl items-center gap-3">
                    <Button
                        variant="secondary"
                        onClick={isFirstStep ? handleBack : goToPreviousStep}
                        className="h-12 flex-1 rounded-[20px]"
                    >
                        {isFirstStep ? 'Back' : 'Previous'}
                    </Button>
                    <Button
                        onClick={isLastStep ? handleSave : goToNextStep}
                        disabled={isSaving}
                        className="h-12 flex-[1.4] rounded-[20px]"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={18} className="animate-spin mr-2" />
                                Saving...
                            </>
                        ) : isLastStep ? (
                            <>
                                <Save size={18} className="mr-2" />
                                Save Profile
                            </>
                        ) : (
                            <>
                                Continue
                                <ChevronRight size={18} className="ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PersonalizationProfileScreen;

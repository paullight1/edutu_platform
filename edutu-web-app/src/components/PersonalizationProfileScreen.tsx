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
        <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
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
                            <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                                Personalization Profile
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Customize your recommendations
                            </p>
                        </div>
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2"
                        >
                            {isSaving ? (
                                <Loader2 size={16} className="animate-spin mr-2" />
                            ) : (
                                <Save size={16} className="mr-2" />
                            )}
                            Save
                        </Button>
                    </div>
                    {saveMessage && (
                        <p className={`mt-3 text-sm flex items-center gap-2 ${saveMessage.includes('Failed') ? 'text-red-500' : 'text-green-600 dark:text-green-400'
                            }`}>
                            <CheckCircle2 size={16} />
                            {saveMessage}
                        </p>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-6 pb-24">
                {/* Info Banner */}
                <Card className="bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 dark:bg-gray-800/50">
                    <div className="flex items-start gap-3">
                        <Target className="text-primary mt-1" size={24} />
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-white">
                                Help us personalize your experience
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                The information you provide helps us recommend the most relevant
                                opportunities, courses, and resources tailored specifically for you.
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Basic Info */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <User size={20} className="text-primary" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Basic Information
                        </h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={formData.fullName}
                                onChange={(e) => handleFieldChange('fullName', e.target.value)}
                                placeholder="Your full name"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Age
                                </label>
                                <input
                                    type="number"
                                    value={formData.age}
                                    onChange={(e) => handleFieldChange('age', e.target.value)}
                                    placeholder="Age"
                                    min="10"
                                    max="100"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Location
                                </label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => handleFieldChange('location', e.target.value)}
                                        placeholder="City, Country"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Education */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <GraduationCap size={20} className="text-blue-500" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Education
                        </h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Course/Field of Study
                            </label>
                            <input
                                type="text"
                                value={formData.courseOfStudy}
                                onChange={(e) => handleFieldChange('courseOfStudy', e.target.value)}
                                placeholder="e.g., Computer Science, Medicine, Business"
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Education Level
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {EDUCATION_LEVELS.map((level) => (
                                    <button
                                        key={level.value}
                                        type="button"
                                        onClick={() => handleFieldChange('educationLevel', level.value)}
                                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${formData.educationLevel === level.value
                                                ? 'bg-primary text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            }`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Experience Level */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Briefcase size={20} className="text-green-500" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Experience Level
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {EXPERIENCE_LEVELS.map((level) => (
                            <button
                                key={level.value}
                                type="button"
                                onClick={() => handleFieldChange('experience', level.value)}
                                className={`w-full p-4 rounded-xl text-left transition-all ${formData.experience === level.value
                                        ? 'bg-primary/10 border-2 border-primary'
                                        : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                                    }`}
                            >
                                <div className="font-medium text-gray-800 dark:text-white">
                                    {level.label}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {level.desc}
                                </div>
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Interests */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Heart size={20} className="text-red-500" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Interests
                        </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Select all areas that interest you
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {INTEREST_OPTIONS.map((interest) => (
                            <button
                                key={interest}
                                type="button"
                                onClick={() => handleMultiSelect('interests', interest)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${formData.interests.includes(interest)
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 ring-2 ring-red-500'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {interest}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Goals */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <Target size={20} className="text-purple-500" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Career Goals
                        </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        What do you want to achieve?
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {GOAL_OPTIONS.map((goal) => (
                            <button
                                key={goal}
                                type="button"
                                onClick={() => handleMultiSelect('goals', goal)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${formData.goals.includes(goal)
                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {goal}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Learning Preferences */}
                <Card className="dark:bg-gray-800 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen size={20} className="text-orange-500" />
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                            Learning Preferences
                        </h3>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        How do you prefer to learn?
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {LEARNING_STYLE_OPTIONS.map((style) => (
                            <button
                                key={style}
                                type="button"
                                onClick={() => handleMultiSelect('preferredLearning', style)}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${formData.preferredLearning.includes(style)
                                        ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-2 ring-orange-500'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {style}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Save Button (bottom) */}
                <div className="pt-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full py-4"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 size={20} className="animate-spin mr-2" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={20} className="mr-2" />
                                Save Personalization Profile
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PersonalizationProfileScreen;

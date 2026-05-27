import React, { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Save, Camera, Loader2, GraduationCap, Target } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { authService, type Profile } from '../lib/auth';
import profileImageService from '../services/profileImage';
import type { AppUser } from '../types/user';
import type { OnboardingState } from '../types/onboarding';

interface EditProfileScreenProps {
  user: AppUser | null;
  setUser: (user: AppUser | null) => void;
  onBack: () => void;
}

type ProfileFormData = {
  name: string;
  age: string;
  email: string;
  phone: string;
  location: string;
  courseOfStudy: string;
  educationLevel: string;
  interests: string;
  goals: string;
};

const EMPTY_FORM: ProfileFormData = {
  name: '',
  age: '',
  email: '',
  phone: '',
  location: '',
  courseOfStudy: '',
  educationLevel: '',
  interests: '',
  goals: ''
};

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const toList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ user, setUser, onBack }) => {
  const { isDarkMode } = useDarkMode();
  const [formData, setFormData] = useState<ProfileFormData>({
    ...EMPTY_FORM,
    name: user?.name || '',
    age: user?.age !== undefined ? user.age.toString() : '',
    email: user?.email || '',
    courseOfStudy: user?.courseOfStudy || ''
  });
  const [profileImage, setProfileImage] = useState<string | null>(user?.avatarUrl || null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadProfileData = async () => {
      if (!user) return;

      setFormData((prev) => ({
        ...prev,
        name: user.name || '',
        age: user.age !== undefined ? user.age.toString() : '',
        email: user.email || '',
        courseOfStudy: user.courseOfStudy || ''
      }));

      try {
        const [avatarUrl, profile] = await Promise.all([
          profileImageService.getProfileImageUrl(user.id),
          authService.getProfile(user.id)
        ]);

        if (avatarUrl) setProfileImage(avatarUrl);

        if (profile) {
          const preferences = (profile.preferences || {}) as Record<string, unknown>;
          const onboardingState = preferences.onboarding as OnboardingState | undefined;
          const onboarding = onboardingState?.data;

          setFormData((prev) => ({
            ...prev,
            name: profile.full_name || profile.name || prev.name,
            age: typeof profile.age === 'number' ? String(profile.age) : prev.age,
            email: profile.email || prev.email,
            phone: typeof preferences.phone === 'string' ? preferences.phone : '',
            location: typeof preferences.location === 'string' ? preferences.location : onboarding?.location || '',
            courseOfStudy: typeof preferences.course_of_study === 'string' ? preferences.course_of_study : onboarding?.courseOfStudy || prev.courseOfStudy,
            educationLevel: typeof preferences.education_level === 'string' ? preferences.education_level : onboarding?.educationLevel || '',
            interests: Array.isArray(preferences.interests) ? preferences.interests.join(', ') : onboarding?.interests?.join(', ') || '',
            goals: Array.isArray(preferences.goals) ? preferences.goals.join(', ') : onboarding?.goals?.join(', ') || ''
          }));
        }
      } catch (error) {
        console.error('Failed to load profile data:', error);
      }
    };

    void loadProfileData();
  }, [user]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const handleFieldChange =
    (field: keyof ProfileFormData) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData((prev) => ({ ...prev, [field]: event.target.value }));
      };

  const triggerImagePicker = () => fileInputRef.current?.click();

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setSaveMessage('Choose a valid image file.');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      setSaveMessage('Profile photo must be below 2MB.');
      event.target.value = '';
      return;
    }

    if (!user?.id) {
      setSaveMessage('Sign in again before updating your profile photo.');
      return;
    }

    setIsUploadingImage(true);
    setSaveMessage('Uploading profile photo...');

    try {
      const result = await profileImageService.uploadResizedProfileImage(user.id, file);
      if (result.success && result.url) {
        setProfileImage(result.url);
        setUser({ ...user, avatarUrl: result.url });
        setSaveMessage('Profile photo updated.');
      } else {
        setSaveMessage(result.error || 'Failed to upload profile photo.');
      }
    } catch (error) {
      console.error('Failed to upload profile image:', error);
      setSaveMessage('Something went wrong while uploading. Please try again.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
      setTimeout(() => setSaveMessage(null), 3500);
    }
  };

  const handleSave = async (event?: FormEvent<HTMLFormElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setSaveMessage('Add your full name before saving.');
      return;
    }

    const parsedAge = formData.age.trim() ? parseInt(formData.age, 10) : undefined;
    if (parsedAge !== undefined && (Number.isNaN(parsedAge) || parsedAge < 13)) {
      setSaveMessage('Enter a valid age.');
      return;
    }

    setIsSaving(true);
    try {
      await authService.updateUserProfile({
        name: trimmedName,
        full_name: trimmedName,
        age: parsedAge,
        course_of_study: formData.courseOfStudy.trim()
      });

      const currentUser = await authService.getCurrentUser();
      if (!currentUser) {
        setSaveMessage('Could not update profile: user not found.');
        return;
      }

      const profile = await authService.getProfile(currentUser.id);
      const existingPrefs = (profile?.preferences || {}) as Record<string, unknown>;
      const interests = toList(formData.interests);
      const goals = toList(formData.goals);
      const existingOnboarding = existingPrefs.onboarding as OnboardingState | undefined;

      const preferences: Record<string, unknown> = {
        ...existingPrefs,
        phone: formData.phone.trim(),
        location: formData.location.trim(),
        course_of_study: formData.courseOfStudy.trim(),
        education_level: formData.educationLevel,
        interests,
        goals,
        onboarding: {
          completed: existingOnboarding?.completed ?? false,
          completedAt: existingOnboarding?.completedAt ?? new Date().toISOString(),
          data: {
            ...(existingOnboarding?.data || {}),
            fullName: trimmedName,
            age: parsedAge ?? null,
            courseOfStudy: formData.courseOfStudy.trim(),
            interests,
            goals,
            educationLevel: formData.educationLevel,
            location: formData.location.trim()
          }
        }
      };

      const profileData: Profile = {
        user_id: currentUser.id,
        name: trimmedName,
        full_name: trimmedName,
        age: parsedAge,
        email: formData.email.trim() || currentUser.email,
        preferences,
        updated_at: new Date().toISOString(),
      };

      await authService.upsertProfile(profileData);

      const nextUser: AppUser = {
        ...currentUser,
        name: trimmedName,
        email: formData.email.trim() || currentUser.email,
        courseOfStudy: formData.courseOfStudy.trim(),
        avatarUrl: profileImage || undefined
      };
      if (parsedAge !== undefined) nextUser.age = parsedAge;
      setUser(nextUser);
      setSaveMessage('Profile updated.');
      setTimeout(() => setSaveMessage(null), 2500);
      onBack();
    } catch (error) {
      console.error('Error updating profile:', error);
      setSaveMessage('Something went wrong while saving your profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full rounded-[18px] border-0 bg-slate-100 px-4 py-3 text-slate-950 outline-none ring-1 ring-transparent transition focus:ring-brand-500 dark:bg-white/8 dark:text-white';
  const iconInputClass = `${inputClass} pl-11`;
  const labelClass = 'mb-2 block text-sm font-bold text-slate-600 dark:text-slate-300';

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-950 dark:bg-gray-950 dark:text-white animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-gray-950/95">
        <div className="flex items-center gap-3 p-4">
          <Button variant="secondary" onClick={handleBack} className="h-11 w-11 rounded-full p-0 border-0 bg-white dark:bg-white/10">
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight">Edit Profile</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Keep your opportunity profile accurate</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} className="h-11 rounded-full px-5">
            {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
            Save
          </Button>
        </div>
        {saveMessage && (
          <p className="mx-4 mb-3 rounded-[18px] bg-brand-500/10 px-4 py-3 text-sm font-semibold text-brand-600 dark:text-brand-300">
            {saveMessage}
          </p>
        )}
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="mx-auto max-w-2xl space-y-4 p-4 pb-28">
        <Card className="border-0 bg-white shadow-sm dark:bg-white/6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[20px] bg-brand-500 text-white">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User size={34} />
                )}
                {isUploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-black/45">
                    <Loader2 size={24} className="animate-spin text-white" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={triggerImagePicker}
                disabled={isUploadingImage}
                className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg shadow-brand-500/20 disabled:opacity-60"
                aria-label="Upload profile photo"
              >
                <Camera size={16} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black">Profile photo</h3>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                Upload a clear image below 2MB.
              </p>
              <button type="button" onClick={triggerImagePicker} className="mt-2 text-sm font-bold text-brand-500">
                Choose image
              </button>
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-white shadow-sm dark:bg-white/6">
          <h3 className="mb-4 text-base font-black">Basic information</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Full name</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={formData.name} onChange={handleFieldChange('name')} className={iconInputClass} placeholder="Your full name" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Age</label>
                <div className="relative">
                  <Calendar size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" value={formData.age} onChange={handleFieldChange('age')} min="13" max="100" className={iconInputClass} placeholder="Optional" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Education level</label>
                <select value={formData.educationLevel} onChange={handleFieldChange('educationLevel')} className={inputClass}>
                  <option value="">Select level</option>
                  <option value="high-school">High School</option>
                  <option value="undergraduate">Undergraduate</option>
                  <option value="graduate">Graduate</option>
                  <option value="postgraduate">Postgraduate</option>
                  <option value="professional">Professional</option>
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>Email address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" value={formData.email} onChange={handleFieldChange('email')} className={iconInputClass} placeholder="you@example.com" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Phone number</label>
                <div className="relative">
                  <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="tel" value={formData.phone} onChange={handleFieldChange('phone')} className={iconInputClass} placeholder="Optional" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" value={formData.location} onChange={handleFieldChange('location')} className={iconInputClass} placeholder="City, Country" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-white shadow-sm dark:bg-white/6">
          <h3 className="mb-4 text-base font-black">Opportunity profile</h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Course or field of study</label>
              <div className="relative">
                <GraduationCap size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={formData.courseOfStudy} onChange={handleFieldChange('courseOfStudy')} className={iconInputClass} placeholder="e.g. Computer Science, Medicine" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Opportunity interests</label>
              <input type="text" value={formData.interests} onChange={handleFieldChange('interests')} className={inputClass} placeholder="Scholarships, internships, fellowships" />
            </div>

            <div>
              <label className={labelClass}>Current goals</label>
              <div className="relative">
                <Target size={18} className="absolute left-4 top-4 text-slate-400" />
                <textarea value={formData.goals} onChange={handleFieldChange('goals')} className={`${iconInputClass} min-h-24 resize-none pt-3`} placeholder="What opportunities are you working toward?" />
              </div>
            </div>
          </div>
        </Card>

        <Button type="submit" className="h-12 w-full rounded-full" disabled={!formData.name.trim() || isSaving}>
          {isSaving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
          Save Changes
        </Button>
      </form>
    </div>
  );
};

export default EditProfileScreen;

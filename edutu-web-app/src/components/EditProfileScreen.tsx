import React, { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Save, Camera, Loader2 } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { authService, type Profile } from '../lib/auth';
import profileImageService from '../services/profileImage';
import type { AppUser } from '../types/user';
import type { OnboardingProfileData } from '../types/onboarding';

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
  bio: string;
  courseOfStudy: string;
  interests: string;
  goals: string;
  experience: string;
  educationLevel: string;
  preferredLearning: string;
};

const DEFAULT_FORM: ProfileFormData = {
  name: '',
  age: '',
  email: 'user@example.com',
  phone: '+234 123 456 7890',
  location: 'Lagos, Nigeria',
  bio: 'Passionate about technology and personal growth. Always looking for new opportunities to learn and make an impact.',
  courseOfStudy: '',
  interests: 'Technology, Entrepreneurship, Education',
  goals: 'Complete Python Course, Apply to Scholarships, Build Portfolio',
  experience: 'intermediate',
  educationLevel: 'undergraduate',
  preferredLearning: 'visual, hands-on'
};

const EditProfileScreen: React.FC<EditProfileScreenProps> = ({ user, setUser, onBack }) => {
  const { isDarkMode } = useDarkMode();
  const [formData, setFormData] = useState<ProfileFormData>({
    ...DEFAULT_FORM,
    name: user?.name || DEFAULT_FORM.name,
    age: user?.age !== undefined ? user.age.toString() : DEFAULT_FORM.age
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const loadProfileData = async () => {
      if (user) {
        // Load basic user info
        setFormData((prev) => ({
          ...prev,
          name: user.name,
          age: user.age !== undefined ? user.age.toString() : '',
          courseOfStudy: user.courseOfStudy || ''
        }));

        // Load profile image from Supabase
        try {
          const avatarUrl = await profileImageService.getProfileImageUrl();
          if (avatarUrl) {
            setProfileImage(avatarUrl);
          }
        } catch (error) {
          console.error('Failed to load profile image:', error);
        }

        // Load more detailed profile data from the database
        try {
          const profile = await authService.getProfile(user.id);
          if (profile) {
            // Update form with profile data if it exists
            setFormData((prev) => ({
              ...prev,
              email: profile.email || prev.email,
              bio: profile.bio || prev.bio,
              location: profile.preferences?.location || prev.location,
              courseOfStudy: profile.preferences?.course_of_study || user.courseOfStudy || prev.courseOfStudy,
            }));

            // Load onboarding data if it exists
            const onboarding = profile.preferences?.onboarding as OnboardingProfileData | undefined;
            if (onboarding) {
              setFormData((prev) => ({
                ...prev,
                courseOfStudy: onboarding.courseOfStudy,
                interests: onboarding.interests.join(', '),
                goals: onboarding.goals.join(', '),
                experience: onboarding.experience,
                educationLevel: onboarding.educationLevel,
                preferredLearning: onboarding.preferredLearning.join(', '),
                location: onboarding.location
              }));
            }
          }
        } catch (error) {
          console.error('Failed to load profile data:', error);
        }
      }
    };

    loadProfileData();
  }, [user, setFormData]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const handleFieldChange =
    (field: keyof ProfileFormData) =>
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const value = event.target.value;
        setFormData((prev) => ({
          ...prev,
          [field]: value
        }));
      };

  const triggerImagePicker = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setSaveMessage('Please choose a valid image file.');
      return;
    }

    setIsUploadingImage(true);
    setSaveMessage('Uploading profile photo...');

    try {
      // Upload to Supabase Storage with resizing
      const result = await profileImageService.uploadResizedProfileImage(file);

      if (result.success && result.url) {
        setProfileImage(result.url);
        setSaveMessage('Profile photo updated successfully!');
      } else {
        setSaveMessage(result.error || 'Failed to upload profile photo.');
      }
    } catch (error) {
      console.error('Failed to upload profile image:', error);
      setSaveMessage('Something went wrong while uploading. Please try again.');
    } finally {
      setIsUploadingImage(false);
      setTimeout(() => setSaveMessage(null), 3500);
    }
  };

  const handleSave = async (event?: FormEvent<HTMLFormElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();

    if (!formData.name || !formData.age) {
      setSaveMessage('Please complete the required fields before saving.');
      return;
    }

    const parsedAge = parseInt(formData.age, 10);
    if (Number.isNaN(parsedAge)) {
      setSaveMessage('Age must be a number.');
      return;
    }

    try {
      // Update user in auth metadata
      await authService.updateUserProfile({
        name: formData.name,
        full_name: formData.name,
        age: parsedAge,
        course_of_study: formData.courseOfStudy
      });

      // Update user in the profiles table
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        // Get existing profile to preserve other data
        let profile = await authService.getProfile(currentUser.id);

        // Build updated preferences that include onboarding data
        const onboardingData = {
          fullName: formData.name,
          age: parsedAge,
          courseOfStudy: formData.courseOfStudy,
          interests: formData.interests.split(',').map(i => i.trim()).filter(i => i),
          goals: formData.goals.split(',').map(g => g.trim()).filter(g => g),
          experience: formData.experience,
          location: formData.location,
          educationLevel: formData.educationLevel,
          preferredLearning: formData.preferredLearning.split(',').map(l => l.trim()).filter(l => l)
        };

        // If we already have onboarding data in the profile, merge it appropriately
        let preferences = profile?.preferences || {};

        // Update onboarding data if profile exists
        if (preferences.onboarding) {
          preferences = {
            ...preferences,
            onboarding: {
              ...preferences.onboarding,
              ...onboardingData,
              // Ensure completion flag is maintained
              completed: (preferences.onboarding as any).completed || false
            }
          };
        } else {
          // For new profiles, create onboarding object
          preferences = {
            ...preferences,
            onboarding: {
              ...onboardingData,
              completed: true, // Mark as completed since user edited it
              completedAt: new Date().toISOString()
            }
          };
        }

        const profileData: Profile = {
          user_id: currentUser.id,
          name: formData.name,
          full_name: formData.name,
          age: parsedAge,
          email: formData.email,
          bio: formData.bio,
          preferences,
          updated_at: new Date().toISOString(),
        };

        await authService.upsertProfile(profileData);

        // Update the user in the app state
        const nextUser: AppUser = {
          ...currentUser,
          name: formData.name,
          courseOfStudy: formData.courseOfStudy
        };
        if (Number.isFinite(parsedAge)) {
          nextUser.age = parsedAge;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
          delete (nextUser as { age?: number }).age;
        }
        setUser(nextUser);
        setSaveMessage('Your profile has been updated successfully.');
        setTimeout(() => setSaveMessage(null), 3500);
        onBack();
      } else {
        setSaveMessage('Could not update profile: user not found.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setSaveMessage('Something went wrong while saving your profile. Please try again.');
    }
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
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
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Edit Profile</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Update your personal information</p>
            </div>
            <Button onClick={handleSave} className="px-4 py-2">
              <Save size={16} className="mr-2" />
              Save
            </Button>
          </div>
          {saveMessage && (
            <p className="mt-2 text-sm text-primary">{saveMessage}</p>
          )}
        </div>
      </div>

      <form onSubmit={(event) => handleSave(event)} className="p-4 space-y-6">
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <div className="text-center">
            <div className="relative inline-block mb-4">
              <div className="w-24 h-24 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center mx-auto overflow-hidden relative">
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User size={40} className="text-white" />
                )}
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={24} className="text-white animate-spin" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={triggerImagePicker}
                disabled={isUploadingImage}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <Camera size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />
            </div>
            <h3 className="font-semibold text-gray-800 dark:text-white mb-2">Profile Picture</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Click the camera icon to update your photo</p>
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Basic Information</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Full Name
              </label>
              <div className="relative">
                <User size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={handleFieldChange('name')}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Age
              </label>
              <div className="relative">
                <Calendar size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  value={formData.age}
                  onChange={handleFieldChange('age')}
                  min="16"
                  max="30"
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your age"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={handleFieldChange('email')}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <Phone size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={handleFieldChange('phone')}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your phone number"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Location
              </label>
              <div className="relative">
                <MapPin size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={formData.location}
                  onChange={handleFieldChange('location')}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="Enter your location"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Course of Study
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.courseOfStudy}
                  onChange={handleFieldChange('courseOfStudy')}
                  className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                  placeholder="e.g., Computer Science"
                />
              </div>
            </div>
          </div>
        </Card>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">About You</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={handleFieldChange('bio')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                placeholder="Tell us about yourself..."
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Interests
              </label>
              <input
                type="text"
                value={formData.interests}
                onChange={handleFieldChange('interests')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="Your interests (comma separated)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current Goals
              </label>
              <textarea
                value={formData.goals}
                onChange={handleFieldChange('goals')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all resize-none"
                placeholder="What are your current goals?"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Education Level
              </label>
              <select
                value={formData.educationLevel}
                onChange={handleFieldChange('educationLevel')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="high-school">High School</option>
                <option value="undergraduate">Undergraduate</option>
                <option value="graduate">Graduate</option>
                <option value="postgraduate">Postgraduate</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Experience Level
              </label>
              <select
                value={formData.experience}
                onChange={handleFieldChange('experience')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="beginner">Beginner (Just starting out)</option>
                <option value="intermediate">Intermediate (Some experience)</option>
                <option value="advanced">Advanced (Experienced)</option>
                <option value="expert">Expert (Highly experienced)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Preferred Learning Styles
              </label>
              <input
                type="text"
                value={formData.preferredLearning}
                onChange={handleFieldChange('preferredLearning')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                placeholder="Your preferred learning styles (comma separated)"
              />
            </div>
          </div>
        </Card>

        <div className="pt-4">
          <Button type="submit" className="w-full" disabled={!formData.name || !formData.age}>
            <Save size={16} className="mr-2" />
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditProfileScreen;

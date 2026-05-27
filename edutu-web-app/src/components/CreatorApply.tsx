import React, { useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Users,
  TrendingUp,
  Award,
  ChevronRight,
  CheckCircle,
  BookOpen,
  Briefcase,
  GraduationCap,
  Heart,
  Globe,
  Linkedin,
  FileText,
  Twitter,
  Youtube,
  Instagram,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { authService } from '../lib/auth';
import { submitCreatorApplication } from '../services/creator';
import type { AppUser } from '../types/user';

interface CreatorApplyProps {
  user: AppUser | null;
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const CreatorApply: React.FC<CreatorApplyProps> = ({ user, onBack, onNavigate }) => {
  const { isDarkMode } = useDarkMode();
  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [motivation, setMotivation] = useState<string>('');
  const [opportunityType, setOpportunityType] = useState<string>('');
  const [opportunityName, setOpportunityName] = useState<string>('');
  const [linkedinUrl, setLinkedinUrl] = useState<string>('');
  const [portfolioUrl, setPortfolioUrl] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [kycFile, setKycFile] = useState<File | null>(null);
  const [kycImageUrl, setKycImageUrl] = useState<string>('');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({
    twitter: '',
    linkedin: '',
    youtube: '',
    instagram: '',
  });

  const motivations = [
    { id: 'share_knowledge', label: 'Share knowledge', icon: <BookOpen size={20} />, desc: 'Help others learn from your experience' },
    { id: 'earn_income', label: 'Earn income', icon: <TrendingUp size={20} />, desc: 'Monetize your expertise' },
    { id: 'build_portfolio', label: 'Build portfolio', icon: <Briefcase size={20} />, desc: 'Showcase your achievements' },
    { id: 'help_others', label: 'Help others', icon: <Heart size={20} />, desc: 'Make a positive impact' },
    { id: 'grow_network', label: 'Grow network', icon: <Users size={20} />, desc: 'Connect with ambitious learners' },
  ];

  const opportunityTypes = [
    { id: 'scholarship', label: 'Scholarship', icon: <GraduationCap size={24} /> },
    { id: 'fellowship', label: 'Fellowship', icon: <Award size={24} /> },
    { id: 'internship', label: 'Internship', icon: <Briefcase size={24} /> },
    { id: 'job', label: 'Job', icon: <FileText size={24} /> },
    { id: 'program', label: 'Program', icon: <BookOpen size={24} /> },
    { id: 'other', label: 'Other', icon: <Sparkles size={24} /> },
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
    setError(null);
    if (step === 2 && !motivation) {
      setError('Please select your primary motivation');
      return;
    }
    if (step === 3 && (!opportunityType || !opportunityName)) {
      setError('Please select an opportunity type and enter its name');
      return;
    }
    if (step === 4 && !bio) {
      setError('Please write a short bio');
      return;
    }
    setStep(step + 1);
    scrollToTop();
  };

  const handleSocialLinkChange = (platform: string, value: string) => {
    setSocialLinks((prev) => ({ ...prev, [platform]: value }));
  };

  const handleKycUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setKycFile(file);
      setKycImageUrl(file.name);
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      setError('Please sign in to apply');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const application = await submitCreatorApplication(user.id, {
        full_name: user.name || '',
        email: user.email || '',
        motivation,
        opportunity_type: opportunityType,
        opportunity_name: opportunityName,
        linkedin_url: linkedinUrl,
        portfolio_url: portfolioUrl,
        bio,
        kyc_image_url: kycImageUrl,
        social_links: socialLinks,
      });

      setApplicationId(application.id);
      setStep(6);
    } catch (err) {
      console.error('Failed to submit application:', err);
      setError('Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderIntro = () => (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-accent rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Sparkles size={40} className="text-white" />
        </div>
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-3">
          Become an Edutu Creator
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg max-w-lg mx-auto">
          Share your success story and help thousands of students achieve their goals
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-700 text-center">
          <Users size={32} className="text-blue-600 dark:text-blue-400 mx-auto mb-3" />
          <div className="text-2xl font-bold text-gray-800 dark:text-white">10K+</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Students Reached</div>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-700 text-center">
          <Award size={32} className="text-green-600 dark:text-green-400 mx-auto mb-3" />
          <div className="text-2xl font-bold text-gray-800 dark:text-white">500+</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Success Stories</div>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-700 text-center">
          <TrendingUp size={32} className="text-purple-600 dark:text-purple-400 mx-auto mb-3" />
          <div className="text-2xl font-bold text-gray-800 dark:text-white">85%</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Revenue Share</div>
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10 border-primary/20 dark:border-primary/30">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4">Creator Benefits</h3>
        <div className="space-y-3">
          {[
            'Earn 85% revenue from your roadmaps',
            'Reach thousands of ambitious students',
            'Build your personal brand and authority',
            'Access creator analytics and insights',
            'Priority support and featured placement',
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-3">
              <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">{benefit}</span>
            </div>
          ))}
        </div>
      </Card>

      <Button onClick={handleNext} className="w-full py-4 text-lg">
        Get Started
        <ChevronRight size={20} />
      </Button>
    </div>
  );

  const renderMotivation = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">What motivates you?</h2>
        <p className="text-gray-600 dark:text-gray-400">Select your primary motivation for becoming a creator</p>
      </div>

      <div className="space-y-3">
        {motivations.map((m) => (
          <button
            key={m.id}
            onClick={() => setMotivation(m.id)}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
              motivation === m.id
                ? 'border-primary bg-primary/10 dark:bg-primary/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 bg-white dark:bg-gray-800'
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              motivation === m.id
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {m.icon}
            </div>
            <div>
              <div className="font-medium text-gray-800 dark:text-white">{m.label}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">{m.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <Button onClick={handleNext} disabled={!motivation} className="w-full">
        Continue
      </Button>
    </div>
  );

  const renderAchievement = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Your Achievement</h2>
        <p className="text-gray-600 dark:text-gray-400">Tell us about the opportunity you succeeded in</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Opportunity Type</label>
        <div className="grid grid-cols-3 gap-3">
          {opportunityTypes.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpportunityType(t.id)}
              className={`p-4 rounded-2xl border-2 text-center transition-all flex flex-col items-center gap-2 ${
                opportunityType === t.id
                  ? 'border-primary bg-primary/10 dark:bg-primary/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary/50 bg-white dark:bg-gray-800'
              }`}
            >
              <div className={opportunityType === t.id ? 'text-primary' : 'text-gray-500 dark:text-gray-400'}>
                {t.icon}
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Opportunity Name</label>
        <input
          type="text"
          value={opportunityName}
          onChange={(e) => setOpportunityName(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
          placeholder="e.g., Chevening Scholarship 2024"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LinkedIn URL</label>
        <div className="relative">
          <Linkedin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="https://linkedin.com/in/yourprofile"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Portfolio URL</label>
        <div className="relative">
          <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="url"
            value={portfolioUrl}
            onChange={(e) => setPortfolioUrl(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="https://yourportfolio.com"
          />
        </div>
      </div>

      <Button onClick={handleNext} disabled={!opportunityType || !opportunityName} className="w-full">
        Continue
      </Button>
    </div>
  );

  const renderVerification = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Verification & Bio</h2>
        <p className="text-gray-600 dark:text-gray-400">Upload a document and tell your story</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">KYC Document</label>
        <label className={`flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          kycFile
            ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-600'
            : 'border-gray-300 dark:border-gray-600 hover:border-primary dark:hover:border-primary bg-gray-50 dark:bg-gray-800'
        }`}>
          <input type="file" accept="image/*,.pdf" onChange={handleKycUpload} className="hidden" />
          {kycFile ? (
            <>
              <CheckCircle size={24} className="text-green-500" />
              <span className="text-green-700 dark:text-green-400 font-medium">{kycImageUrl}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setKycFile(null);
                  setKycImageUrl('');
                }}
                className="ml-2 text-red-500 hover:text-red-600"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <Upload size={24} className="text-gray-400" />
              <span className="text-gray-600 dark:text-gray-400">Upload ID or certificate</span>
            </>
          )}
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Your Story / Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          placeholder="Share your journey, what you learned, and how you can help others..."
          rows={5}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Social Links</label>
        <div className="space-y-3">
          {[
            { key: 'twitter', icon: <Twitter size={18} />, placeholder: 'Twitter/X profile URL' },
            { key: 'linkedin', icon: <Linkedin size={18} />, placeholder: 'LinkedIn profile URL' },
            { key: 'youtube', icon: <Youtube size={18} />, placeholder: 'YouTube channel URL' },
            { key: 'instagram', icon: <Instagram size={18} />, placeholder: 'Instagram profile URL' },
          ].map((s) => (
            <div key={s.key} className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{s.icon}</div>
              <input
                type="url"
                value={socialLinks[s.key]}
                onChange={(e) => handleSocialLinkChange(s.key, e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder={s.placeholder}
              />
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleNext} disabled={!bio} className="w-full">
        Continue
      </Button>
    </div>
  );

  const renderReview = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Review Your Application</h2>
        <p className="text-gray-600 dark:text-gray-400">Make sure everything looks good before submitting</p>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          Motivation
        </h3>
        <p className="text-gray-600 dark:text-gray-400 capitalize">{motivation.replace('_', ' ')}</p>
      </Card>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <Award size={18} className="text-primary" />
          Achievement
        </h3>
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-500 dark:text-gray-400">Type:</span> <span className="text-gray-800 dark:text-white capitalize ml-1">{opportunityType}</span></div>
          <div><span className="text-gray-500 dark:text-gray-400">Name:</span> <span className="text-gray-800 dark:text-white ml-1">{opportunityName}</span></div>
          {linkedinUrl && <div><span className="text-gray-500 dark:text-gray-400">LinkedIn:</span> <span className="text-primary ml-1 truncate inline-block max-w-xs">{linkedinUrl}</span></div>}
          {portfolioUrl && <div><span className="text-gray-500 dark:text-gray-400">Portfolio:</span> <span className="text-primary ml-1 truncate inline-block max-w-xs">{portfolioUrl}</span></div>}
        </div>
      </Card>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <h3 className="font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
          <FileText size={18} className="text-primary" />
          Bio & Verification
        </h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">{bio}</p>
        {kycFile && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle size={16} className="text-green-500" />
            <span className="text-gray-600 dark:text-gray-400">{kycImageUrl}</span>
          </div>
        )}
        {Object.values(socialLinks).some((v) => v) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(socialLinks).filter(([, v]) => v).map(([key]) => (
              <span key={key} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-600 dark:text-gray-400 capitalize">
                {key}
              </span>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
      )}

      <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full py-4">
        {isSubmitting ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Submit Application
          </>
        )}
      </Button>
    </div>
  );

  const renderSuccess = () => (
    <div className="space-y-8 text-center">
      <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
        <CheckCircle size={48} className="text-white" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-3">Application Submitted!</h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Your creator application is under review. We'll notify you once it's processed.
        </p>
      </div>

      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <div className="space-y-2 text-sm">
          <div><span className="text-gray-500 dark:text-gray-400">Application ID:</span></div>
          <div className="font-mono text-primary">{applicationId}</div>
          <div className="mt-3"><span className="text-gray-500 dark:text-gray-400">Status:</span> <span className="text-yellow-600 dark:text-yellow-400 font-medium">Pending Review</span></div>
          <div><span className="text-gray-500 dark:text-gray-400">Estimated time:</span> <span className="text-gray-800 dark:text-white">3-5 business days</span></div>
        </div>
      </Card>

      <Button onClick={() => onNavigate?.('creator-dashboard')} className="w-full py-4">
        Go to Creator Dashboard
        <ChevronRight size={20} />
      </Button>
    </div>
  );

  const stepTitles: Record<number, string> = {
    1: 'Welcome',
    2: 'Motivation',
    3: 'Achievement',
    4: 'Verification',
    5: 'Review',
    6: 'Submitted',
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
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Creator Application</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {step < 6 ? `Step ${step} of 5: ${stepTitles[step]}` : stepTitles[step]}
              </p>
            </div>
          </div>
          {step < 6 && (
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    s <= step ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {step === 1 && renderIntro()}
        {step === 2 && renderMotivation()}
        {step === 3 && renderAchievement()}
        {step === 4 && renderVerification()}
        {step === 5 && renderReview()}
        {step === 6 && renderSuccess()}
      </div>
    </div>
  );
};

export default CreatorApply;

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  Users,
  Clock,
  Download,
  MessageCircle,
  Play,
  FileText,
  ExternalLink,
  CheckCircle,
  Circle
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '../hooks/useAuth';
import { usePackageAnalytics } from '../hooks/usePackageAnalytics';
import type { CommunityStory } from '../types/community';
import { getCommunityStory } from '../services/communityMarketplaceSupabase';
import {
  getCommunityPackage,
  updatePackageTaskProgress,
  downloadAllPackageTemplates,
  askPackageCreator,
  addPackageReview,
  type CommunityPackage,
  type PackageTask
} from '../services/packageService';

interface PackageDetailProps {
  packageId: string;
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

const PackageDetail: React.FC<PackageDetailProps> = ({ packageId, onBack, onNavigate }) => {
  const [packageData, setPackageData] = useState<CommunityPackage | null>(null);
  const [communityStoryData, setCommunityStoryData] = useState<CommunityStory | null>(null);
  const [activeTab, setActiveTab] = useState('roadmap');
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const { isDarkMode } = useDarkMode();
  const { user } = useAuth();

  // Determine which data to use
  const currentData = packageData || communityStoryData;

  // Helper function to get the appropriate data regardless of type
  const getDisplayData = () => {
    if (packageData) {
      return packageData;
    } else if (communityStoryData) {
      // Convert CommunityStory to match CommunityPackage interface
      return {
        id: communityStoryData.id,
        title: communityStoryData.title,
        shortDescription: communityStoryData.summary,
        fullDescription: communityStoryData.story,
        coverImageUrl: communityStoryData.image,
        difficulty: communityStoryData.difficulty,
        estimatedCompletionTime: communityStoryData.duration || '2-3 hours',
        price: communityStoryData.price === 'Free' ? 0 : 100, // Simplified
        tags: communityStoryData.tags,
        creator: {
          id: communityStoryData.id, // Placeholder
          name: communityStoryData.creator.name,
          shortBio: communityStoryData.creator.title || communityStoryData.creator.name,
          avatarUrl: communityStoryData.creator.avatar || '',
          credibilityBadge: communityStoryData.creator.verified ? 'Verified' : undefined
        },
        includedItems: communityStoryData.outcomes || [],
        createdAt: communityStoryData.createdAt || new Date().toISOString(),
        version: '1.0.0',
        roadmap: communityStoryData.roadmap.map((stage, index) => ({
          stepId: stage.id,
          title: stage.title,
          description: stage.description || '',
          tasks: stage.tasks.map(task => ({
            taskId: task.id,
            text: task.title,
            done: false
          })),
          estimatedTime: stage.duration || '30 mins',
          attachments: [],
          progressState: 'todo' as const
        })),
        templates: [], // No templates in CommunityStory
        resources: communityStoryData.resources.map(res => ({
          id: res.id,
          title: res.title,
          url: res.url || '',
          type: res.type,
          notes: res.notes || ''
        })),
        personalStory: {
          text: communityStoryData.story,
          proofs: [] // No proofs in CommunityStory
        },
        tips: {
          dos: [], // No tips in CommunityStory
          donts: [] // No tips in CommunityStory
        },
        reviews: [], // No reviews in CommunityStory
        progress: {
          packageId: communityStoryData.id,
          completedTasks: [],
          percentComplete: 0
        }
      } as CommunityPackage;
    }
    return null;
  };

  useEffect(() => {
    const fetchPackageData = async () => {
      try {
        setLoading(true);

        // First try to get as CommunityPackage
        const packageResult = await getCommunityPackage(packageId);
        if (packageResult) {
          setPackageData(packageResult);
          return;
        }

        // If not found as a package, try to get as CommunityStory
        const storyResult = await getCommunityStory(packageId);
        if (storyResult) {
          setCommunityStoryData(storyResult);
        }
      } catch (error) {
        console.error('Error fetching package data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPackageData();
  }, [packageId]);

  const { trackTaskComplete, trackTemplateDownload } = usePackageAnalytics(packageId);

  const toggleTask = async (taskId: string) => {
    if (!displayData || !user) return;

    // Find the task and step that contains it
    let taskToToggle: PackageTask | null = null;
    let stepIndex = -1;

    for (let i = 0; i < displayData.roadmap.length; i++) {
      const step = displayData.roadmap[i];
      const taskIndex = step.tasks.findIndex(task => task.taskId === taskId);
      if (taskIndex !== -1) {
        taskToToggle = step.tasks[taskIndex];
        stepIndex = i;
        break;
      }
    }

    if (taskToToggle && stepIndex !== -1) {
      // Toggle the task status
      const updatedTask: PackageTask = {
        ...taskToToggle,
        done: !taskToToggle.done
      };

      // Update the package data
      const updatedRoadmap = [...displayData.roadmap];
      updatedRoadmap[stepIndex] = {
        ...updatedRoadmap[stepIndex],
        tasks: updatedRoadmap[stepIndex].tasks.map(task =>
          task.taskId === taskId ? updatedTask : task
        )
      };

      // Update the appropriate state based on which data type we're using
      if (packageData) {
        setPackageData({
          ...packageData,
          roadmap: updatedRoadmap
        });
      } else if (communityStoryData) {
        // For CommunityStory, we won't update this way since it doesn't have the same structure
        // We'll just update the main packageData state to trigger a re-render
        setPackageData({
          ...displayData,
          roadmap: updatedRoadmap
        } as CommunityPackage);
      }

      // Update progress on the backend
      try {
        await updatePackageTaskProgress(displayData.id, taskId, updatedTask.done);

        // Track the task completion if the task is marked as done
        if (updatedTask.done) {
          trackTaskComplete(taskId);
        }
      } catch (error) {
        console.error('Error updating task progress:', error);
        // Revert the UI change if API call fails
        if (packageData) {
          setPackageData(packageData);
        } else if (communityStoryData) {
          setPackageData(displayData as CommunityPackage);
        }
      }
    }
  };

  const handleDownloadAll = async () => {
    if (!displayData) return;

    try {
      const blob = await downloadAllPackageTemplates(displayData.id);
      if (blob) {
        // Create a download link for the blob
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${displayData.title.replace(/\s+/g, '_')}_templates.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        // Track template download
        trackTemplateDownload();
      } else {
        // If blob is null, that means we don't have the actual file yet, so let's still track
        trackTemplateDownload();
      }
    } catch (error) {
      console.error('Error downloading templates:', error);
    }
  };

  const handleAskCreator = async () => {
    if (!displayData || !user) return;

    // In a real implementation, this would open a modal to get the user's question
    // For now, we'll just use a generic message
    const message = "I have a question about your package.";

    try {
      await askPackageCreator(displayData.id, user.id, message);
      // Show success message to user
      alert('Your question has been sent to the creator!');
    } catch (error) {
      console.error('Error sending question to creator:', error);
      alert('Failed to send your question. Please try again.');
    }
  };

  const handleAddReview = async () => {
    if (!displayData || !user || rating <= 0 || !reviewText.trim()) return;

    try {
      await addPackageReview(displayData.id, user.id, rating, reviewText);
      // Reset form
      setRating(0);
      setReviewText('');
      // Show success message to user
      alert('Your review has been submitted successfully!');
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit your review. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className={`p-4 min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayData = getDisplayData();
  if (!displayData) {
    return (
      <div className={`p-4 min-h-screen ${isDarkMode ? 'dark' : ''}`}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">Package not found</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">The requested package could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalTasks = displayData.roadmap.reduce((acc, step) => acc + step.tasks.length, 0);
  const completedTasks = displayData.roadmap.reduce((acc, step) => {
    const stepCompleted = step.tasks.filter(task => task.done).length;
    return acc + stepCompleted;
  }, 0);

  const progressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className={`min-h-screen transition-theme ${isDarkMode ? 'dark bg-gray-900' : 'bg-white'}`}>
      {/* Header Section */}
      <div className={`border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onBack}
              className={`p-2 ${isDarkMode ? 'dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600' : ''}`}
            >
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Community Marketplace
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Expert roadmaps and guides
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">Your progress</span>
            <span className="text-gray-500 dark:text-gray-400">{progressPercentage}%</span>
          </div>
          <div className="w-full h-2 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/40 backdrop-blur-sm">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-accent-400 shadow-[0_12px_32px_-18px_rgba(6,182,212,0.9)] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Package Header */}
        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div className="md:w-2/5">
            <img
              src={displayData.coverImageUrl}
              alt={displayData.title}
              className="w-full h-48 object-cover rounded-xl"
            />
          </div>
          <div className="md:w-3/5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {displayData.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              {displayData.shortDescription}
            </p>

            {/* Creator Chip */}
            <div className={`mt-4 p-3 rounded-xl flex items-center gap-3 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
              {displayData.creator.avatarUrl && (
                <img
                  src={displayData.creator.avatarUrl}
                  alt={displayData.creator.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              )}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {displayData.creator.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {displayData.creator.shortBio || displayData.creator.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <Card className={`mb-6 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Star size={16} className="text-yellow-500" />
              </span>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Rating</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {(displayData.price === 0 ? 4.8 : (displayData.price === 100 ? 4.9 : 4.7)).toFixed(1)} ({displayData.price === 0 ? 128 : 85} users)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Clock size={16} className="text-blue-500" />
              </span>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Duration</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {displayData.estimatedCompletionTime}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <Users size={16} className="text-green-500" />
              </span>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Difficulty</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {displayData.difficulty}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                {displayData.price === 0 ? (
                  <span className="text-green-500 text-xs font-bold">FREE</span>
                ) : (
                  <span className="text-blue-500 font-semibold">${displayData.price}</span>
                )}
              </span>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Price</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {displayData.price === 0 ? 'Free' : `$${displayData.price}`}
                </p>
              </div>
            </div>
          </div>

          {/* Included Items */}
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-900 dark:text-white">What's included:</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {displayData.includedItems.map((item, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isDarkMode
                      ? 'bg-purple-900/30 text-purple-300 border border-purple-700/50'
                      : 'bg-purple-100 text-purple-800 border border-purple-200'
                  }`}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4 flex flex-wrap gap-2">
            {displayData.tags.map((tag) => (
              <span
                key={tag}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  isDarkMode
                    ? 'bg-blue-900/30 text-blue-300 border border-blue-700/50'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </Card>

        {/* Main Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Button 
            className="w-full flex items-center justify-center gap-2"
            onClick={() => setActiveTab('roadmap')}
          >
            <Play size={16} />
            Start Guide
          </Button>
          
          <Button 
            variant="secondary" 
            className="w-full flex items-center justify-center gap-2"
            onClick={() => setActiveTab('templates')}
          >
            <FileText size={16} />
            View Templates
          </Button>
          
          <Button 
            variant="secondary" 
            className="w-full flex items-center justify-center gap-2"
            onClick={() => setActiveTab('resources')}
          >
            <ExternalLink size={16} />
            View Resources
          </Button>
          
          <Button 
            variant="secondary" 
            className="w-full flex items-center justify-center gap-2"
            onClick={handleAskCreator}
          >
            <MessageCircle size={16} />
            Ask Creator
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="flex space-x-8">
            {[
              { id: 'roadmap', label: 'Roadmap', icon: Play },
              { id: 'templates', label: 'Templates', icon: FileText },
              { id: 'resources', label: 'Resources', icon: ExternalLink },
              { id: 'story', label: 'Personal Story', icon: Users },
              { id: 'tips', label: 'Tips', icon: Star },
              { id: 'reviews', label: 'Reviews', icon: MessageCircle },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* Roadmap Tab */}
          {activeTab === 'roadmap' && (
            <div className="space-y-4">
              {displayData.roadmap.map((step, stepIndex) => (
                <Card
                  key={step.stepId}
                  className={`p-4 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>
                      <span className="font-semibold text-sm">{stepIndex + 1}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {step.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {step.description}
                      </p>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Estimated time: {step.estimatedTime}
                      </div>

                      <div className="mt-3 space-y-2">
                        {step.tasks.map((task) => (
                          <div key={task.taskId} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={task.done}
                              onChange={() => toggleTask(task.taskId)}
                              className="mt-1 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className={`flex-1 ${
                              task.done
                                ? 'text-gray-500 dark:text-gray-400 line-through'
                                : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {task.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === 'templates' && (
            <div className="space-y-4">
              <div className="flex justify-end mb-4">
                <Button
                  variant="secondary"
                  className="flex items-center gap-2"
                  onClick={handleDownloadAll}
                >
                  <Download size={16} />
                  Download All
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayData.templates.map((template) => (
                  <Card
                    key={template.id}
                    className={`p-4 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <FileText size={20} className="text-blue-500" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {template.title}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {template.fileType}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={() => {
                          // Download single template
                          const link = document.createElement('a');
                          link.href = template.fileUrl;
                          link.download = template.title.replace(/\s+/g, '_');
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                      >
                        Download
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Resources Tab */}
          {activeTab === 'resources' && (
            <div className="space-y-4">
              {displayData.resources.map((resource) => (
                <Card
                  key={resource.id}
                  className={`p-4 flex items-center justify-between ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}
                >
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {resource.title}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {resource.notes}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    as="a"
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={16} className="mr-1" />
                    Open
                  </Button>
                </Card>
              ))}
            </div>
          )}

          {/* Personal Story Tab */}
          {activeTab === 'story' && (
            <Card className={`p-6 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Creator's Journey
              </h3>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                {displayData.personalStory.text}
              </p>

              {displayData.personalStory.proofs.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Proof of Success</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {displayData.personalStory.proofs.map((proof, index) => (
                      <div key={index} className="aspect-video">
                        <img
                          src={proof}
                          alt={`Proof ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Tips Tab */}
          {activeTab === 'tips' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className={`p-6 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}>
                <h3 className="text-lg font-semibold text-green-600 mb-4 flex items-center gap-2">
                  <CheckCircle size={20} />
                  Do's
                </h3>
                <ul className="space-y-3">
                  {displayData.tips.dos.map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span className="text-gray-700 dark:text-gray-300">{tip}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className={`p-6 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}>
                <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
                  <Circle size={20} />
                  Don'ts
                </h3>
                <ul className="space-y-3">
                  {displayData.tips.donts.map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-red-500 mt-1">✕</span>
                      <span className="text-gray-700 dark:text-gray-300">{tip}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}

          {/* Reviews Tab */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              {/* Write Review */}
              {user && (
                <Card className={`p-6 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                    Write a Review
                  </h3>
                  <div className="flex items-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRating(star)}
                        className={`text-2xl ${star <= rating ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder="Share your experience with this guide..."
                    className={`w-full p-3 rounded-lg border ${
                      isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    rows={3}
                  />
                  <div className="mt-4">
                    <Button onClick={handleAddReview}>
                      Submit Review
                    </Button>
                  </div>
                </Card>
              )}

              {/* Reviews List */}
              <div className="space-y-4">
                {displayData.reviews.map((review) => (
                  <Card
                    key={review.id}
                    className={`p-4 ${isDarkMode ? 'dark:bg-gray-800 dark:border-gray-700' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          {[...Array(5)].map((_, i) => (
                            <span
                              key={i}
                              className={`text-sm ${i < review.rating ? 'text-yellow-400' : 'text-gray-300'}`}
                            >
                              ★
                            </span>
                          ))}
                        </div>
                        <h4 className="font-medium text-gray-900 dark:text-white mt-1">
                          Anonymous User
                        </h4>
                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                          {review.comment}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackageDetail;
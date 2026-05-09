// This file extends the existing community marketplace service
// to include package-specific functionality

import type {
  CommunityStory,
  CommunityStoryStats,
  CommunityResource,
  CommunityRoadmapStage
} from '../types/community';

// Define new types for the package functionality
export interface PackageStep {
  stepId: string;
  title: string;
  description: string;
  tasks: PackageTask[];
  estimatedTime: string;
  attachments?: string[];
  progressState: 'todo' | 'in-progress' | 'done';
}

export interface PackageTask {
  taskId: string;
  text: string;
  done: boolean;
}

export interface PackageTemplate {
  id: string;
  title: string;
  fileUrl: string;
  fileType: string;
}

export interface PackageResource {
  id: string;
  title: string;
  url: string;
  type: string;
  notes?: string;
}

export interface PersonalStory {
  text: string;
  proofs: string[];
}

export interface PackageTips {
  dos: string[];
  donts: string[];
}

export interface PackageReview {
  id: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PackageProgress {
  packageId: string;
  completedTasks: string[];
  percentComplete: number;
}

export interface CommunityPackage {
  id: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  coverImageUrl: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedCompletionTime: string;
  price: number;
  tags: string[];
  creator: {
    id: string;
    name: string;
    shortBio: string;
    avatarUrl: string;
    credibilityBadge?: string;
  };
  includedItems: string[];
  createdAt: string;
  version: string;
  roadmap: PackageStep[];
  templates: PackageTemplate[];
  resources: PackageResource[];
  personalStory: PersonalStory;
  tips: PackageTips;
  reviews: PackageReview[];
  progress?: PackageProgress;
}

// Service function to get a single package by ID
export async function getCommunityPackage(id: string): Promise<CommunityPackage | null> {
  // In a real implementation, this would call an API endpoint
  // For now, we'll create sample data for the Mastercard Foundation package
  if (id === 'mc-001') {
    return {
      id: "mc-001",
      title: "Mastercard Foundation Scholarship — Full Step-by-Step Guide",
      shortDescription: "Exact process used to win the Mastercard Foundation Scholarship: essays, timeline, templates.",
      fullDescription: "This comprehensive guide walks you through every step of the Mastercard Foundation Scholarship application process. From preparing your personal statement to securing recommendation letters, this roadmap provides the exact strategy used by successful scholars.",
      coverImageUrl: "/images/mastercard-cover.jpg",
      difficulty: "Intermediate",
      estimatedCompletionTime: "2–3 hours",
      price: 0,
      tags: ["Scholarship", "Mastercard", "Interview prep", "Application"],
      creator: {
        id: "creator-aliyah",
        name: "Aliyah Musa",
        shortBio: "Mastercard Scholar — University of Edinburgh, GPA 4.52/5.0",
        avatarUrl: "/images/aliyah.jpg",
        credibilityBadge: "Verified Scholar"
      },
      includedItems: [
        "Personal Statement Template",
        "CV Template",
        "Recommendation Letter Template", 
        "Interview Prep Materials",
        "Timeline Tracker"
      ],
      createdAt: new Date().toISOString(),
      version: "1.0.0",
      roadmap: [
        {
          stepId: "step-1",
          title: "Research & Preparation",
          description: "Understand the scholarship requirements and prepare your materials",
          tasks: [
            { taskId: "task-1", text: "Read scholarship guidelines carefully", done: false },
            { taskId: "task-2", text: "Gather required documents", done: false },
            { taskId: "task-3", text: "Create application timeline", done: false }
          ],
          estimatedTime: "30 mins",
          attachments: [],
          progressState: "todo"
        },
        {
          stepId: "step-2", 
          title: "Personal Statement",
          description: "Craft a compelling personal statement that stands out",
          tasks: [
            { taskId: "task-4", text: "Outline your background & journey", done: false },
            { taskId: "task-5", text: "Draft personal statement", done: false },
            { taskId: "task-6", text: "Review and edit with feedback", done: false }
          ],
          estimatedTime: "1 hour",
          attachments: [],
          progressState: "todo"
        },
        {
          stepId: "step-3",
          title: "CV & Supporting Documents",
          description: "Prepare a scholarship-worthy CV and supporting documents",
          tasks: [
            { taskId: "task-7", text: "Update CV with key achievements", done: false },
            { taskId: "task-8", text: "Prepare academic transcripts", done: false },
            { taskId: "task-9", text: "Gather certificates and awards", done: false }
          ],
          estimatedTime: "45 mins",
          attachments: [],
          progressState: "todo"
        },
        {
          stepId: "step-4",
          title: "Submit & Follow Up", 
          description: "Finalize and submit your application",
          tasks: [
            { taskId: "task-10", text: "Final review of all materials", done: false },
            { taskId: "task-11", text: "Submit application", done: false },
            { taskId: "task-12", text: "Follow up as needed", done: false }
          ],
          estimatedTime: "30 mins",
          attachments: [],
          progressState: "todo"
        }
      ],
      templates: [
        { id: "tmpl-1", title: "Personal Statement Template", fileUrl: "/templates/essay.pdf", fileType: "PDF" },
        { id: "tmpl-2", title: "CV Template", fileUrl: "/templates/cv.docx", fileType: "DOCX" },
        { id: "tmpl-3", title: "Recommendation Letter Template", fileUrl: "/templates/rec-letter.docx", fileType: "DOCX" }
      ],
      resources: [
        { id: "res-1", title: "Mastercard Foundation Official Site", url: "https://mastercardfdn.org", type: "link", notes: "Official scholarship information" },
        { id: "res-2", title: "Interview Preparation Video", url: "https://youtube.com/interview-tips", type: "video", notes: "Tips for scholarship interviews" },
        { id: "res-3", title: "Application Timeline", url: "/resources/timeline.pdf", type: "document", notes: "Step-by-step timeline" }
      ],
      personalStory: {
        text: "When I first heard about the Mastercard Foundation Scholarship, I was intimidated. The application process seemed complex and competitive. However, with a structured approach and the right resources, I was able to successfully navigate the process. This guide contains all the strategies and templates that I used to win my scholarship, including specific examples of what made my application stand out.",
        proofs: [
          "/images/scholarship-proof-1.jpg",
          "/images/scholarship-proof-2.jpg"
        ]
      },
      tips: {
        dos: [
          "Start early with the application process",
          "Customize each essay for the specific program",
          "Secure recommendation letters well in advance",
          "Proofread all documents multiple times"
        ],
        donts: [
          "Wait until the last minute to apply",
          "Use generic essays across different applications",
          "Ask for recommendations without giving context",
          "Submit documents without reviewing them"
        ]
      },
      reviews: [
        { 
          id: "rev-1", 
          userId: "user-123", 
          rating: 5, 
          comment: "This guide was incredibly helpful! The step-by-step approach made the whole process much less overwhelming.", 
          createdAt: "2023-10-15" 
        },
        { 
          id: "rev-2", 
          userId: "user-456", 
          rating: 4, 
          comment: "Great templates and resources. Some steps could be more detailed but overall very useful.", 
          createdAt: "2023-09-22" 
        }
      ],
      progress: {
        packageId: "mc-001",
        completedTasks: [],
        percentComplete: 0
      }
    };
  }
  
  return null;
}

// Service function to update task progress
export async function updatePackageTaskProgress(
  packageId: string, 
  taskId: string, 
  done: boolean
): Promise<void> {
  // In a real implementation, this would make an API call to update the task status
  console.log(`Updating task ${taskId} in package ${packageId} to ${done ? 'done' : 'not done'}`);
  
  // This is where we would typically send a PATCH request to an endpoint like:
  // PATCH /api/packages/:id/progress with { taskId, done }
}

// Service function to download all templates
export async function downloadAllPackageTemplates(packageId: string): Promise<Blob | null> {
  // In a real implementation, this would fetch a zip file from an API
  console.log(`Downloading all templates for package ${packageId}`);
  
  // This is where we would typically make a GET request to an endpoint like:
  // GET /api/packages/:id/templates/bundle
  return null;
}

// Service function to ask the creator a question
export async function askPackageCreator(
  packageId: string, 
  userId: string, 
  message: string
): Promise<void> {
  // In a real implementation, this would make an API call to send a message to the creator
  console.log(`Sending message to creator of package ${packageId}: ${message}`);
  
  // This is where we would typically make a POST request to an endpoint like:
  // POST /api/packages/:id/questions with { userId, message }
}

// Service function to add a review
export async function addPackageReview(
  packageId: string,
  userId: string,
  rating: number,
  comment: string
): Promise<void> {
  // In a real implementation, this would make an API call to add a review
  console.log(`Adding review for package ${packageId}: ${rating} stars - ${comment}`);

  // This is where we would typically make a POST request to an endpoint like:
  // POST /api/packages/:id/reviews with { userId, rating, comment }
}

// Service function to get packages for marketplace display
export async function getPackageMarketplaceList(): Promise<CommunityPackage[]> {
  // In a real implementation, this would fetch packages from an API
  // For now, we'll return the sample package
  const samplePackage = await getCommunityPackage('mc-001');
  return samplePackage ? [samplePackage] : [];
}
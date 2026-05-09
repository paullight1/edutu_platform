# n8n Integration Guide

This document explains how to integrate Edutu with n8n for automated opportunity updates and personalized recommendations.

## Components

### Frontend Components
- `src/services/n8nIntegration.ts`: Handles sending data to n8n webhook
- `src/services/personalizedRecommendations.ts`: Implements recommendation algorithms
- `src/hooks/usePersonalizedOpportunities.ts`: Hook for fetching and filtering personalized opportunities
- `src/components/AllOpportunities.tsx`: Updated UI to show personalized opportunities with match scores

### Backend Requirements (Not implemented in this frontend-only project)
- Webhook endpoint to receive n8n updates
- Database for storing opportunities
- Authentication system to associate opportunities with users

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/edutu-opportunities
```

### n8n Workflow Setup

1. Create a new workflow in n8n
2. Add a Webhook trigger with the same URL specified in VITE_N8N_WEBHOOK_URL
3. Add your data processing nodes to format opportunity data
4. You can send data to the webhook using the following format:

```json
{
  "action": "update_opportunities",
  "data": [
    {
      "id": "unique-opportunity-id",
      "title": "Opportunity Title",
      "organization": "Organization Name",
      "category": "Category",
      "deadline": "YYYY-MM-DD",
      "location": "Location",
      "description": "Description",
      "requirements": ["Requirement 1", "Requirement 2"],
      "benefits": ["Benefit 1", "Benefit 2"],
      "applicationProcess": ["Step 1", "Step 2"],
      "image": "https://image-url.com/image.jpg",
      "difficulty": "Easy|Medium|Hard",
      "applicants": "Number of applicants",
      "successRate": "Success rate percentage",
      "applyUrl": "https://apply-url.com"
    }
  ],
  "timestamp": "2023-12-05T10:00:00Z",
  "userId": "user-id-if-applicable"
}
```

## Implementation Details

### Opportunity Data Flow

1. Opportunities are fetched from the API via `fetchOpportunities()` in `src/services/opportunities.ts`
2. If a userId is provided, the opportunities are automatically sent to n8n via webhook
3. The `usePersonalizedOpportunities` hook fetches opportunities and applies personalized filtering
4. Match scores are calculated based on user preferences and displayed in the UI

### Personalization Algorithm

The algorithm calculates match scores based on:
- User interests vs opportunity category/title
- Preferred location vs opportunity location
- Preferred categories
- Experience level vs opportunity difficulty
- Career goals alignment

The UI shows match percentages and allows users to adjust their preferences in real-time.

## API Services

### n8n Integration Service

```typescript
import { sendOpportunitiesToN8n, updateOpportunitiesInN8n, addOpportunityToN8n } from './services/n8nIntegration';
```

Functions available:
- `sendOpportunitiesToN8n(action, data, userId)`: Generic function to send any data to n8n
- `updateOpportunitiesInN8n(opportunities, userId)`: Send multiple opportunities
- `addOpportunityToN8n(opportunity, userId)`: Send a single opportunity
- `deleteOpportunityInN8n(opportunityId, userId)`: Mark opportunity for deletion

### Personalized Recommendations Service

```typescript
import { 
  formatUserProfileForRecommendations,
  calculateMatchScore,
  getPersonalizedOpportunities
} from './services/personalizedRecommendations';
```

## UI Updates

The `AllOpportunities` component now shows:
- Personalized opportunities sorted by match score
- Percentage match indicators
- User preference filters
- Ability to adjust preferences in real-time

## Testing

A test file is provided at `src/services/testIntegration.ts` that demonstrates the integration with sample data.

Run the test with:
```typescript
import { runIntegrationTests } from './services/testIntegration';
runIntegrationTests();
```

## Backend Implementation (Required for Production)

For production use, you'll need to implement a backend webhook endpoint similar to:

```
POST /api/n8n/webhook
```

This endpoint should:
1. Validate the request is coming from n8n
2. Process the action (update_opportunities, add_opportunity, etc.)
3. Store the data in your database
4. Return appropriate responses to n8n
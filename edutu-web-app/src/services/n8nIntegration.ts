import type { Opportunity } from '../types/opportunity';

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL as string;

interface N8nWebhookPayload {
  action: string;
  data: Opportunity | Opportunity[];
  timestamp: string;
  userId?: string;
}

/**
 * Sends opportunity data to n8n webhook
 */
export async function sendOpportunitiesToN8n(
  action: string,
  data: Opportunity | Opportunity[],
  userId?: string
): Promise<boolean> {
  if (!N8N_WEBHOOK_URL) {
    console.warn('N8N_WEBHOOK_URL is not defined in environment variables');
    return false;
  }

  try {
    const payload: N8nWebhookPayload = {
      action,
      data,
      timestamp: new Date().toISOString(),
      userId
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Successfully sent data to n8n:', result);
    return true;
  } catch (error) {
    console.error('Error sending data to n8n:', error);
    return false;
  }
}

/**
 * Updates opportunities in n8n
 */
export async function updateOpportunitiesInN8n(
  opportunities: Opportunity[],
  userId?: string
): Promise<boolean> {
  return sendOpportunitiesToN8n('update_opportunities', opportunities, userId);
}

/**
 * Adds a single opportunity to n8n
 */
export async function addOpportunityToN8n(
  opportunity: Opportunity,
  userId?: string
): Promise<boolean> {
  return sendOpportunitiesToN8n('add_opportunity', opportunity, userId);
}

/**
 * Deletes an opportunity in n8n
 */
export async function deleteOpportunityInN8n(
  opportunityId: string,
  userId?: string
): Promise<boolean> {
  return sendOpportunitiesToN8n('delete_opportunity', { id: opportunityId }, userId);
}
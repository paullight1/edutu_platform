# Connecting Your n8n Automation to Edutu

This guide explains how to connect your existing n8n automation to the Edutu application to receive opportunity updates and personalized recommendations.

## Prerequisites

- An existing n8n workflow that prepares opportunity data
- Access to your n8n instance to configure webhooks
- Your Edutu application deployed or running locally

## Step 1: Configure Your n8n Workflow

1. **Locate your existing workflow** in n8n that processes opportunity data.

2. **Add an HTTP Response node** at the end of your workflow if not already present. This node will send data back to your Edutu application.

3. **Configure the response data** to match the expected format. Your n8n workflow should output data in this format:

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

## Step 2: Set Up Your n8n Webhook URL

1. In your n8n workflow, you need to configure the HTTP Request node (or Webhook node) that targets your Edutu application.

2. The target URL will be your Edutu backend endpoint. For a production setup, this might be:
   ```
   https://your-edutu-domain.com/api/n8n/webhook
   ```
   
   For development, if you're using a service like ngrok to expose your local server:
   ```
   https://your-ngrok-url.ngrok.io/api/n8n/webhook
   ```

3. Configure the HTTP Request node with:
   - **Method**: POST
   - **URL**: Your Edutu webhook endpoint
   - **Body**: Send the formatted JSON payload from Step 1
   - **Headers**: 
     - `Content-Type: application/json`

## Step 3: Configure Environment Variables in Edutu

1. In your Edutu project, update the `.env` file with your n8n webhook URL:

```bash
# URL where n8n will send opportunity updates
VITE_N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook-trigger-id
```

Note: This variable is used when Edutu sends data *to* n8n. Your actual webhook endpoint will receive data from n8n.

## Step 4: Implement Backend Webhook Endpoint (Required for Production)

Since Edutu is a frontend application, you need a backend service to receive webhooks from n8n. The basic structure in `src/pages/api/n8nWebhook.ts` shows how this could work, but you'll need to implement it on an actual backend.

### For a Node.js/Express Backend:
```javascript
// Example backend endpoint (not in the frontend code)
app.post('/api/n8n/webhook', async (req, res) => {
  try {
    const { success, message } = await handleN8nWebhook(req.body);
    res.status(success ? 200 : 400).json({ success, message });
  } catch (error) {
    console.error('Error processing n8n webhook:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
```

### For Vercel Functions (if using Vercel):
Create `api/n8n-webhook.js`:
```javascript
// api/n8n-webhook.js (Vercel function)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { success, message } = await handleN8nWebhook(req.body);
    res.status(success ? 200 : 400).json({ success, message });
  } catch (error) {
    console.error('Error processing n8n webhook:', error);
    res.status(500).json({ message: 'Server error' });
  }
}
```

## Step 5: Testing the Connection

1. **Test locally first** using tools like ngrok to expose your local development server:
   ```bash
   npx ngrok http 5173  # If using Vite dev server on port 5173
   ```

2. **Update your n8n workflow** to use the ngrok URL temporarily during testing.

3. **In your Edutu application**, you can manually test the integration by calling:
   ```javascript
   import { runIntegrationTests } from './src/services/testIntegration';
   runIntegrationTests();
   ```

## Step 6: Securing Your Webhook

To prevent unauthorized access to your webhook endpoint:

1. **Add authentication headers** in your n8n HTTP Request node:
   - Add headers like `Authorization: Bearer YOUR_SECRET_TOKEN`
   - Or use custom headers to verify the request comes from n8n

2. **Validate the request** in your backend webhook handler:
   - Check for proper authentication headers
   - Validate the payload structure
   - Consider using webhook signatures for verification

## Step 7: Verify the Integration

1. **Check your server logs** when n8n sends data to verify the connection is working.

2. **Monitor the browser console** for any issues with receiving or processing the opportunities.

3. **Verify personalized recommendations** appear in the Edutu UI based on user profile data.

## Troubleshooting

### Common Issues:

- **"CORS error"**: This occurs when n8n tries to call your frontend directly. Webhooks should always go to a backend service, never directly to the frontend.
  
- **"Webhook not found"**: Ensure your backend endpoint is properly deployed and accessible.

- **"Invalid payload"**: Verify that n8n is sending data in the correct format as specified in Step 1.

- **"Unauthorized"**: Check that any authentication headers are properly configured.

### Debugging Tips:

1. Check your n8n execution logs for any errors in the HTTP Request node.
2. Add logging in your webhook endpoint to see the incoming data.
3. Use browser developer tools to check for any frontend errors when processing opportunities.
4. Verify environment variables are properly set and accessible.

## Advanced: Real-Time Opportunity Updates

For real-time updates from n8n to Edutu:
- Implement a messaging system (like WebSocket or Server-Sent Events)
- Use a queue system (like Redis or RabbitMQ) between n8n and your backend
- Add caching mechanisms to prevent over-fetching

## Example n8n Configuration

Here's a simplified example of how your n8n workflow might be structured:

1. **Trigger node** (e.g., Schedule, Webhook, or Manual)
2. **Data processing nodes** (transform your data sources into Edutu format)
3. **HTTP Request node** to send data to your Edutu backend
4. **Response node** (optional, for debugging)

This configuration will push opportunity data from your automation to Edutu whenever the workflow runs.
create table if not exists public.admin_settings (
  key text primary key default 'global',
  settings jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

insert into public.admin_settings (key, settings)
values (
  'global',
  '{
    "platform": {
      "siteName": "Edutu",
      "supportEmail": "support@edutu.org",
      "maintenanceMode": false,
      "allowRegistrations": true,
      "requireApproval": false
    },
    "content": {
      "autoModerate": true,
      "requireCreatorApproval": true,
      "maxUploadSize": 10,
      "allowedFileTypes": ["jpg", "jpeg", "png", "pdf"]
    },
    "notifications": {
      "adminEmail": "admin@edutu.org",
      "notifyNewUsers": true,
      "notifyNewOpportunities": false,
      "notifyReports": true,
      "dailyDigest": true
    },
    "security": {
      "maxLoginAttempts": 5,
      "passwordMinLength": 8,
      "requireStrongPassword": true,
      "sessionDuration": 24
    },
    "api": {
      "apiKey": "Managed on the server",
      "webhookUrl": "https://api.edutu.org/webhooks",
      "rateLimitPerMinute": 100
    }
  }'::jsonb
)
on conflict (key) do nothing;

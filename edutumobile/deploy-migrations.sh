#!/bin/bash
# Edutu Mobile - Database Deployment Script
# Runs all pending Supabase migrations in order

set -e

echo "🚀 Edutu Mobile - Database Migration Deployment"
echo "================================================"

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install it first:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one from .env.example"
    exit 1
fi

echo ""
echo "📋 Pending Migrations:"
echo "   003_add_creator_status.sql     - Creator status column for profiles"
echo "   004_payment_system.sql         - Payment tables and functions"
echo "   005_convert_user_id_to_text.sql - UUID to text conversion"
echo "   006_creator_applications_rls.sql - Creator applications RLS"
echo ""

read -p "⚠️  This will modify your production database. Continue? (y/N): " confirm
if [[ "$confirm" != [yY] && "$confirm" != [yY][eE][sS] ]]; then
    echo "❌ Aborted."
    exit 0
fi

echo ""
echo "🔄 Pushing migrations..."

# Push all pending migrations
supabase db push

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migrations applied successfully!"
    echo ""
    echo "📝 Next Steps:"
    echo "   1. Deploy RevenueCat webhook function:"
    echo "      supabase functions deploy revenuecat-webhook"
    echo ""
    echo "   2. Set webhook secret in Supabase:"
    echo "      supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-secret"
    echo ""
    echo "   3. Configure RevenueCat webhook URL in dashboard:"
    echo "      https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook"
    echo ""
else
    echo ""
    echo "❌ Migration failed. Check the output above for errors."
    exit 1
fi

# Edutu Mobile - Database Deployment Script (PowerShell)
# Runs all pending Supabase migrations in order

Write-Host "`n🚀 Edutu Mobile - Database Migration Deployment" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Check if Supabase CLI is installed
try {
    $null = Get-Command supabase -ErrorAction Stop
} catch {
    Write-Host "`n❌ Supabase CLI not found. Install it first:" -ForegroundColor Red
    Write-Host "   npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# Check if .env file exists
if (-Not (Test-Path ".env")) {
    Write-Host "`n❌ .env file not found. Please create one from .env.example" -ForegroundColor Red
    exit 1
}

Write-Host "`n📋 Pending Migrations:" -ForegroundColor Yellow
Write-Host "   003_add_creator_status.sql     - Creator status column for profiles"
Write-Host "   004_payment_system.sql         - Payment tables and functions"
Write-Host "   005_convert_user_id_to_text.sql - UUID to text conversion"
Write-Host "   006_creator_applications_rls.sql - Creator applications RLS"

$confirm = Read-Host "`n⚠️  This will modify your production database. Continue? (y/N)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "`n❌ Aborted." -ForegroundColor Red
    exit 0
}

Write-Host "`n🔄 Pushing migrations..." -ForegroundColor Cyan

# Push all pending migrations
supabase db push

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Migrations applied successfully!" -ForegroundColor Green
    Write-Host "`n📝 Next Steps:" -ForegroundColor Cyan
    Write-Host "   1. Deploy RevenueCat webhook function:"
    Write-Host "      supabase functions deploy revenuecat-webhook"
    Write-Host ""
    Write-Host "   2. Set webhook secret in Supabase:"
    Write-Host "      supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-secret"
    Write-Host ""
    Write-Host "   3. Configure RevenueCat webhook URL in dashboard:"
    Write-Host "      https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook"
    Write-Host ""
} else {
    Write-Host "`n❌ Migration failed. Check the output above for errors." -ForegroundColor Red
    exit 1
}

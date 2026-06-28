-- Edutu Seed Data
-- Realistic sample data for development and demo environments.
-- Run via: psql <connection-string> -f supabase/seed.sql

-- ============================================================
-- Sample Users (requires profiles table with user_id as TEXT)
-- ============================================================

-- Student: Chiamaka Adebayo, Computer Science student at UNILAG
INSERT INTO public.profiles (user_id, full_name, email, role, country, age, degree_pursuit, school, skills, interests, goals, creator_status, credits_balance, created_at, updated_at)
VALUES ('seed-student-001', 'Chiamaka Adebayo', 'chiamaka@example.ng', 'user', 'Nigeria', 21, 'BSc', 'University of Lagos', '["Python","Data Science","Public Speaking"]', '["Technology","Research","Social Impact"]', '["Get Scholarship","Land a Job"]', 'none', 150, NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Creator: Dr. Oluwaseun Okafor, Career Coach
INSERT INTO public.profiles (user_id, full_name, email, role, country, age, degree_pursuit, school, skills, interests, goals, creator_status, credits_balance, created_at, updated_at)
VALUES ('seed-creator-001', 'Dr. Oluwaseun Okafor', 'seun@example.ng', 'user', 'Nigeria', 35, 'PhD', 'University of Ibadan', '["Career Coaching","Mentorship","Curriculum Design"]', '["Education","Technology","Business"]', '["Get Mentor","Build Skills"]', 'approved', 5000, NOW() - INTERVAL '6 months', NOW())
ON CONFLICT (user_id) DO NOTHING;

-- Admin
INSERT INTO public.profiles (user_id, full_name, email, role, country, created_at, updated_at)
VALUES ('seed-admin-001', 'Admin Edutu', 'admin@edutu.com', 'admin', 'Nigeria', NOW(), NOW())
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Sample Opportunities
-- ============================================================

INSERT INTO public.opportunities (title, description, summary, organization, category, location, remote, deadline, application_url, status, featured, stipend, created_at, updated_at)
VALUES
(
  'MTN Foundation Science & Technology Scholarship 2026',
  'The MTN Foundation Scholarship provides financial support to high-performing Nigerian students in Science and Technology disciplines at Nigerian public tertiary institutions. The scholarship covers tuition, book allowance, and a stipend for the academic year.',
  'Annual scholarship for Nigerian STEM undergraduates — tuition + ₦200,000 stipend.',
  'MTN Foundation',
  'STEM',
  'Nigeria',
  false,
  '2026-09-30',
  'https://www.mtnonline.com/foundation/scholarships',
  'active',
  true,
  '₦200,000/year',
  NOW() - INTERVAL '30 days',
  NOW()
),
(
  'Andela Technical Leadership Program 2026',
  'A six-month immersive program for experienced African software engineers to accelerate their careers as global technology leaders. Includes mentorship, real-world projects, and job placement with partner companies.',
  '6-month career accelerator for African technologists — mentorship + job placement.',
  'Andela',
  'Technology',
  'Remote (Africa)',
  true,
  '2026-07-31',
  'https://andela.com/apply',
  'active',
  true,
  'Paid',
  NOW() - INTERVAL '15 days',
  NOW()
),
(
  'NNPC/TotalEnergies National Merit Scholarship 2026',
  'Annual scholarship for Nigerian undergraduates across all disciplines in accredited Nigerian tertiary institutions. Selection is based on academic merit and a national aptitude test.',
  'Nigerian undergraduate scholarship — all disciplines — ₦150,000 annual award.',
  'NNPC/TotalEnergies',
  'General',
  'Nigeria',
  false,
  '2026-10-31',
  'https://scholarships.total.com.ng',
  'active',
  true,
  '₦150,000/year',
  NOW() - INTERVAL '45 days',
  NOW()
),
(
  'Tony Elumelu Foundation Entrepreneurship Programme 2026',
  'The TEF Entrepreneurship Programme provides $5,000 seed capital, 12 weeks of business training, mentorship, and networking opportunities to 1,000 African entrepreneurs annually across all 54 African countries.',
  '$5,000 seed capital + mentorship + training for African entrepreneurs.',
  'Tony Elumelu Foundation',
  'Entrepreneurship',
  'All 54 African Countries',
  true,
  '2026-03-31',
  'https://www.tefconnect.com',
  'active',
  true,
  '$5,000 seed',
  NOW() - INTERVAL '60 days',
  NOW()
),
(
  'Chevening Scholarship — Nigerian Cohort 2026',
  'The UK government''s fully-funded global scholarship programme for future leaders. Covers full tuition, living expenses, return airfare, and additional grants for a one-year Master''s degree at any UK university.',
  'Fully funded UK Master''s — tuition, living costs, airfare — for future Nigerian leaders.',
  'Chevening / UK FCDO',
  'General',
  'United Kingdom',
  false,
  '2026-11-07',
  'https://www.chevening.org/apply',
  'active',
  true,
  'Fully funded',
  NOW() - INTERVAL '20 days',
  NOW()
),
(
  'Flutterwave Graduate Trainee Program 2026',
  'A 12-month rotational graduate programme at Flutterwave for recent Nigerian graduates in Engineering, Product, and Business functions. Includes structured training, mentorship, and potential full-time conversion.',
  '12-month graduate programme at Africa''s leading payments company — Lagos.',
  'Flutterwave',
  'Technology',
  'Lagos, Nigeria',
  false,
  '2026-08-15',
  'https://flutterwave.com/careers',
  'active',
  false,
  'Competitive',
  NOW() - INTERVAL '10 days',
  NOW()
),
(
  'Seplat Energy JV Scholarship 2026',
  'Scholarship for undergraduate students from Seplat''s host communities in Edo and Delta states. Covers full tuition and provides an annual stipend for the duration of the degree programme.',
  'Full tuition scholarship for Edo/Delta state undergraduates in Nigerian universities.',
  'Seplat Energy',
  'Engineering',
  'Edo & Delta States, Nigeria',
  false,
  '2026-09-15',
  'https://seplatenergy.com/scholarships',
  'active',
  false,
  'Full tuition + stipend',
  NOW() - INTERVAL '25 days',
  NOW()
),
(
  'Dangote Group Graduate Engineering Program 2026',
  'Entry-level engineering positions at Dangote Group for fresh graduates in Mechanical, Electrical, Chemical, and Civil Engineering. Includes 6 months of structured training before deployment to production facilities.',
  'Graduate engineering roles at Africa''s largest conglomerate — Lagos/Kano.',
  'Dangote Group',
  'Engineering',
  'Lagos & Kano, Nigeria',
  false,
  '2026-08-30',
  'https://dangote.com/careers',
  'active',
  false,
  'Competitive salary',
  NOW() - INTERVAL '5 days',
  NOW()
),
(
  'Bank of Industry Youth Entrepreneurship Support 2026',
  'The BOI YES programme provides business financing, entrepreneurship training, and mentorship to young Nigerian entrepreneurs with viable business plans. Loan amounts range from ₦1M to ₦10M at single-digit interest.',
  '₦1M–₦10M business financing + training for young Nigerian entrepreneurs.',
  'Bank of Industry',
  'Entrepreneurship',
  'Nigeria',
  false,
  '2026-12-15',
  'https://boi.ng/yes-programme',
  'active',
  false,
  '₦1M–₦10M loan',
  NOW() - INTERVAL '35 days',
  NOW()
),
(
  'Covenant University Data Science Internship 2026',
  'A 3-month summer internship at Covenant University''s Data Science Research Lab for Nigerian undergraduates in Computer Science, Statistics, or Mathematics. Includes hands-on projects in machine learning and AI.',
  '3-month ML/AI research internship at CU Data Science Lab — Ota, Ogun State.',
  'Covenant University',
  'Technology',
  'Ota, Ogun State, Nigeria',
  false,
  '2026-06-30',
  'https://covenantuniversity.edu.ng/research/internships',
  'active',
  false,
  '₦75,000/month',
  NOW() - INTERVAL '3 days',
  NOW()
);

-- ============================================================
-- Sample Goals
-- ============================================================

INSERT INTO public.goals (user_id, title, description, priority, deadline, progress, status, created_at, updated_at)
VALUES
('seed-student-001', 'Complete 5 scholarship applications by July', 'Research and submit complete applications for MTN Foundation, NNPC/Total, PTDF, Seplat, and Chevening scholarships.', 'High', '2026-07-31', 40, 'active', NOW() - INTERVAL '14 days', NOW()),
('seed-student-001', 'Improve Python skills to intermediate level', 'Complete DataCamp Python track, build 3 portfolio projects, and contribute to one open-source project.', 'Medium', '2026-09-30', 25, 'active', NOW() - INTERVAL '21 days', NOW()),
('seed-student-001', 'Prepare for Andela Technical Leadership Program', 'Polish GitHub profile, complete 10 LeetCode challenges, write technical blog post, prepare for technical interview.', 'High', '2026-07-15', 15, 'active', NOW() - INTERVAL '7 days', NOW());

-- ============================================================
-- Sample Notifications
-- ============================================================

INSERT INTO public.user_notifications (user_id, kind, title, body, severity, read_at, created_at)
VALUES
('seed-student-001', 'goal-reminder', 'Goal deadline approaching', 'Complete 5 scholarship applications by July is due in 2 weeks. You are 40% done.', 'warning', NULL, NOW() - INTERVAL '2 hours'),
('seed-student-001', 'opportunity-highlight', 'New scholarship match!', 'Flutterwave Graduate Trainee Program matches your Technology interest. Applications close August 15.', 'info', NULL, NOW() - INTERVAL '1 day'),
('seed-student-001', 'goal-progress', 'Progress update', 'You made progress on Improve Python skills this week. Keep it up!', 'info', NOW(), NOW() - INTERVAL '3 days'),
('seed-student-001', 'system', 'Welcome to Edutu!', 'Complete your profile to get personalized opportunity recommendations.', 'info', NOW(), NOW() - INTERVAL '14 days'),
('seed-student-001', 'admin-broadcast', 'New feature: AI Roadmap Generator', 'Generate a personalised application roadmap for any opportunity with our AI assistant.', 'info', NULL, NOW() - INTERVAL '6 hours');

-- ============================================================
-- Sample Creator Content
-- ============================================================

INSERT INTO public.community_stories (creator_id, title, description, type, visibility, metadata, created_at, updated_at)
VALUES
('seed-creator-001', 'Path to a Tech Career in Nigeria', 'A step-by-step roadmap from university to your first tech job, covering skill development, portfolio building, internship strategies, and interview preparation tailored to the Nigerian tech ecosystem.', 'roadmap', 'published', '{"difficulty":"Intermediate","duration":"6 months","steps":6,"category":"Career"}', NOW() - INTERVAL '3 months', NOW()),
('seed-creator-001', 'Winning the Chevening Scholarship', 'Detailed application strategy based on my experience as a Chevening Scholar. Covers personal statement writing, reference letter strategy, university selection, and interview preparation.', 'roadmap', 'published', '{"difficulty":"Advanced","duration":"3 months","steps":8,"category":"Scholarship"}', NOW() - INTERVAL '2 months', NOW()),
('seed-creator-001', 'From Intern to Full-Stack Developer', '6-month skill-building plan: HTML/CSS → JavaScript → React → Node.js → DevOps basics → job applications. Includes project milestones and recommended Nigerian tech communities.', 'roadmap', 'published', '{"difficulty":"Beginner","duration":"6 months","steps":10,"category":"Skill"}', NOW() - INTERVAL '1 month', NOW());

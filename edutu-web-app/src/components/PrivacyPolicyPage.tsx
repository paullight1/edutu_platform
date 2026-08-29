import React from 'react';
import LegalDocPage, { type LegalSection } from './LegalDocPage';

const sections: LegalSection[] = [
    {
        heading: '1. Information We Collect',
        body: [
            'We collect the information you give us when you create an account, build your profile, and use Edutu to discover opportunities. This helps us match you with scholarships, internships, and fellowships that fit your goals.',
            [
                'Account details such as your name, email address, and sign-in method.',
                'Profile information such as your education level, country, interests, and career goals.',
                'Activity data such as opportunities you save, apply to, or search for.',
                'Device and usage data such as your browser type, general location, and how you interact with the product.',
            ],
        ],
    },
    {
        heading: '2. How We Use Your Information',
        body: [
            'We use your information to run Edutu and make global opportunities easier to reach.',
            [
                'To personalise the opportunities and recommendations we show you.',
                'To send deadline reminders and updates you have opted into.',
                'To improve our matching, search, and recommendations.',
                'To keep the platform secure and prevent misuse.',
            ],
        ],
    },
    {
        heading: '3. How We Share Information',
        body: [
            'We do not sell your personal information. We only share it with trusted service providers who help us operate Edutu (for example authentication, hosting, and analytics), and only to the extent needed to provide the service. We may also share information when required by law.',
        ],
    },
    {
        heading: '4. Your Rights and Choices',
        body: [
            'You are in control of your data. You can access, update, or delete your profile information at any time from your settings. You can also opt out of non-essential emails, and you can request a copy or deletion of your account data by contacting us.',
        ],
    },
    {
        heading: '5. Data Retention and Security',
        body: [
            'We keep your information only as long as your account is active or as needed to provide the service and meet legal obligations. We use industry-standard safeguards to protect your data, though no method of transmission over the internet is completely secure.',
        ],
    },
    {
        heading: '6. Account Deletion',
        body: [
            'You can permanently delete your Edutu account and all associated data at any time.',
            [
                'In the mobile app: go to Profile → Settings → Delete Account. Your profile, chats, goals, CVs, saved opportunities, and billing records are all removed.',
                'By email: send us a deletion request using the button below from the email address linked to your account, and we will delete your account and confirm within 30 days.',
            ],
        ],
        cta: {
            label: 'Email us to delete your account',
            href: 'mailto:my.edutu@gmail.com?subject=Account%20Deletion%20Request&body=Please%20delete%20my%20Edutu%20account%20and%20all%20associated%20data.%0A%0AAccount%20email%3A%20',
        },
    },
    {
        heading: '7. Contact Us',
        body: [
            'If you have any questions about this Privacy Policy or how we handle your data, reach out to us at my.edutu@gmail.com and our team will help.',
        ],
        cta: {
            label: 'Email us',
            href: 'mailto:my.edutu@gmail.com?subject=Privacy%20Question',
        },
    },
];

const PrivacyPolicyPage: React.FC = () => (
    <LegalDocPage
        eyebrow="Privacy"
        title="Privacy Policy"
        lastUpdated="July 7, 2026"
        intro="Your trust matters to us. This policy explains what information Edutu collects, how we use it, and the choices you have. We keep it plain so you always know where you stand."
        sections={sections}
        seoPath="/privacy"
    />
);

export default PrivacyPolicyPage;

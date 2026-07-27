import React from 'react';
import LegalDocPage, { type LegalSection } from './LegalDocPage';

const sections: LegalSection[] = [
    {
        heading: '1. Acceptance of Terms',
        body: [
            'By creating an account or using Edutu, you agree to these Terms of Service. If you do not agree, please do not use the platform. These terms apply to everyone who accesses Edutu, whether as a learner, mentor, or visitor.',
        ],
    },
    {
        heading: '2. Using Edutu',
        body: [
            'Edutu helps you discover scholarships, internships, fellowships, and related opportunities. You agree to use the platform only for lawful purposes and to provide accurate information in your profile.',
            [
                'You are responsible for keeping your account credentials secure.',
                'You must be old enough to form a binding contract in your country.',
                'You may not misuse, scrape, or attempt to disrupt the service.',
            ],
        ],
    },
    {
        heading: '3. Opportunities and Third-Party Content',
        body: [
            'Edutu curates opportunities from many sources. While we work hard to keep listings accurate and up to date, we do not own or control third-party programs and cannot guarantee eligibility, availability, or outcomes. Always confirm details on the official provider website before applying.',
        ],
    },
    {
        heading: '4. Your Content',
        body: [
            'You keep ownership of the information and content you add to Edutu. By posting it, you grant us the permission needed to display and process it so we can provide the service, such as matching you with relevant opportunities.',
        ],
    },
    {
        heading: '5. Disclaimers and Limitation of Liability',
        body: [
            'Edutu is provided on an "as is" basis. We do our best to keep it reliable, but we do not guarantee that the service will always be available or error-free. To the fullest extent allowed by law, Edutu is not liable for any indirect or consequential loss arising from your use of the platform.',
        ],
    },
    {
        heading: '6. Changes and Contact',
        body: [
            'We may update these terms from time to time. If we make significant changes, we will let you know. Continued use of Edutu after changes means you accept the updated terms. Questions? Contact us at my.edutu@gmail.com.',
        ],
    },
];

const TermsPage: React.FC = () => (
    <LegalDocPage
        eyebrow="Legal"
        title="Terms of Service"
        lastUpdated="July 7, 2026"
        intro="These terms set out the simple rules for using Edutu. We keep them clear so you know what to expect from us, and what we expect from you."
        sections={sections}
        seoPath="/terms"
    />
);

export default TermsPage;

import React from 'react';
import { Link } from 'react-router-dom';
import { Github, Linkedin, Twitter } from 'lucide-react';
import { getDocsUrl, isExternalDocsUrl } from '../lib/apiProductUrls';

const docsUrl = getDocsUrl();

type FooterLink = {
    label: string;
    to: string;
    /** external / hash links render as a plain anchor */
    external?: boolean;
};

type FooterColumn = {
    title: string;
    links: FooterLink[];
};

const columns: FooterColumn[] = [
    {
        title: 'Product',
        links: [
            { label: 'Opportunities', to: '/opportunities' },
            { label: 'Platform', to: '/#platform', external: true },
            { label: 'Become a Mentor', to: '/mentor' },
            { label: 'Events', to: '/events' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About', to: '/about' },
            { label: 'Our Impact', to: '/impact' },
            { label: 'What We Believe', to: '/what-we-believe' },
            { label: 'Blog', to: '/blog' },
            { label: 'Careers', to: '/careers' },
            { label: 'Download App', to: '/download' },
        ],
    },
    {
        title: 'Resources',
        links: [
            { label: 'Help Center', to: '/help' },
            { label: 'Developer Docs', to: docsUrl, external: isExternalDocsUrl() },
            { label: 'Scholarship Engine', to: '/scholarship-engine' },
            { label: 'Privacy Policy', to: '/privacy' },
            { label: 'Terms of Service', to: '/terms' },
        ],
    },
];

const linkClass =
    'block text-[13px] text-text-secondary no-underline transition hover:text-brand md:text-[14px]';

const FooterLinkItem: React.FC<{ link: FooterLink }> = ({ link }) => {
    if (link.external) {
        return (
            <a href={link.to} className={linkClass}>
                {link.label}
            </a>
        );
    }
    return (
        <Link to={link.to} className={linkClass}>
            {link.label}
        </Link>
    );
};

/**
 * Shared marketing footer used across public pages. Every text link routes to a
 * real page so nothing dead-ends.
 */
const SiteFooter: React.FC<{ version?: string }> = ({ version = 'v0.1.2' }) => {
    return (
        <footer className="border-t border-subtle px-4 py-10 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-[1200px]">
                <div className="mb-10 grid grid-cols-2 gap-x-6 gap-y-8 md:mb-16 md:grid-cols-4 md:gap-12">
                    <div className="col-span-2 md:col-span-1">
                        <Link to="/" className="mb-3 flex items-center gap-2 no-underline">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-display text-xl font-bold tracking-tight text-text-primary">edutu</span>
                        </Link>
                        <p className="max-w-[20rem] text-[13px] leading-[1.5] text-text-muted md:text-[14px] md:leading-[1.7]">
                            Find scholarships, jobs, and programs from around the world. We help
                            you plan your next big step.
                        </p>
                    </div>

                    {columns.map((column) => (
                        <div key={column.title}>
                            <h4 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-primary md:mb-4 md:text-[12px]">
                                {column.title}
                            </h4>
                            <div className="space-y-2 md:space-y-3">
                                {column.links.map((link) => (
                                    <FooterLinkItem key={link.label} link={link} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col items-center justify-between border-t border-subtle pt-6 md:flex-row md:pt-8">
                    <span className="text-[11px] text-text-muted md:text-[12px]">
                        © {new Date().getFullYear()} Edutu Inc. All rights reserved. {version}
                    </span>
                    <div className="mt-3 flex items-center gap-4 md:mt-0 md:gap-6">
                        <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" aria-label="Edutu on X" className="p-1.5 text-text-muted transition hover:text-brand md:p-2"><Twitter size={18} /></a>
                        <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" aria-label="Edutu on LinkedIn" className="p-1.5 text-text-muted transition hover:text-brand md:p-2"><Linkedin size={18} /></a>
                        <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" aria-label="Edutu on GitHub" className="p-1.5 text-text-muted transition hover:text-brand md:p-2"><Github size={18} /></a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default SiteFooter;

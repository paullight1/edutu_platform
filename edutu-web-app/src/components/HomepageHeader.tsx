import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowRight, Menu, Search, X } from 'lucide-react';

const groups = [
    { title: 'Explore', links: [
        { label: 'Opportunities', to: '/opportunities' },
        { label: 'Events', to: '/events' },
        { label: 'Blog', to: '/blog' },
    ] },
    { title: 'About Edutu', links: [
        { label: 'About us', to: '/about' },
        { label: 'Our impact', to: '/impact' },
        { label: 'What we believe', to: '/what-we-believe' },
        { label: 'Edutu For You', to: '/edutuforyou' },
    ] },
    { title: 'Help', links: [
        { label: 'Help Center', to: '/help' },
    ] },
];

export default function HomepageHeader({ onGetStarted, publicMode = false, fixed = false, darkAtTop = false }: { onGetStarted: () => void; publicMode?: boolean; fixed?: boolean; darkAtTop?: boolean }) {
    const { isSignedIn } = useAuth();
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const previousOverflow = document.body.style.overflow;
        const previousFocus = document.activeElement as HTMLElement | null;
        document.body.style.overflow = 'hidden';
        panelRef.current?.querySelector<HTMLElement>('button, a')?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key !== 'Tab') return;
            const items = panelRef.current?.querySelectorAll<HTMLElement>('a[href], button');
            if (!items?.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            previousFocus?.focus();
        };
    }, [open]);

    return (
        <header className={`homepage-header${publicMode ? ' homepage-header-public' : ''}${fixed ? ' homepage-header-fixed' : ''}${darkAtTop ? ' homepage-header-dark-top' : ''}`}>
            <div className="homepage-header-inner">
                <Link to="/" className="homepage-logo" aria-label="Edutu home">
                    <img src="/edutu-logo.png" alt="" />
                    <span>edutu</span>
                </Link>
                <nav className="homepage-desktop-nav" aria-label="Primary navigation">
                    <Link to="/opportunities">Opportunities</Link>
                    <Link to="/about">About Edutu</Link>
                </nav>
                <div className="homepage-header-actions">
                    <Link className="homepage-login" to={isSignedIn ? '/dashboard' : '/auth?mode=sign-in&screen=full'}>
                        {isSignedIn ? 'Dashboard' : 'Sign in'}
                    </Link>
                    <Link to="/opportunities" className="homepage-icon-button" aria-label="Search opportunities"><Search size={23} /></Link>
                    <button type="button" className="homepage-icon-button" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={open} aria-controls="homepage-menu" onClick={() => setOpen(true)}><Menu size={26} /></button>
                </div>
            </div>
            {open && (
                <div className="homepage-menu-backdrop" onClick={() => setOpen(false)}>
                    <div ref={panelRef} id="homepage-menu" className="homepage-menu" role="dialog" aria-modal="true" aria-labelledby="homepage-menu-title" onClick={(event) => event.stopPropagation()}>
                        <div className="homepage-menu-heading"><h2 id="homepage-menu-title">Explore Edutu</h2><button className="homepage-icon-button" type="button" aria-label="Close menu" onClick={() => setOpen(false)}><X size={26} /></button></div>
                        <nav className="homepage-menu-groups" aria-label="All pages">
                            {groups.map((group) => <div key={group.title}><h3>{group.title}</h3>{group.links.map((item) => <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>{item.label}<ArrowRight size={18} aria-hidden="true" /></Link>)}</div>)}
                        </nav>
                        <div className="homepage-menu-bottom"><p>Make room for your next chapter.</p><button type="button" className="homepage-button homepage-button-blue" onClick={() => { setOpen(false); onGetStarted(); }}>Get started free <ArrowRight size={20} /></button></div>
                    </div>
                </div>
            )}
        </header>
    );
}

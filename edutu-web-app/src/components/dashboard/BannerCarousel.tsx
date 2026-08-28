import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export type BannerAd = {
  image: string;
  url: string;
  alt: string;
  eyebrow?: string;
  title: string;
  subtitle: string;
  cta?: string;
};

// These launch creatives are right-sized for the 1200 × 300 dashboard card.
// Copy stays in HTML so it remains crisp, accessible, and easy to update.
export const DEFAULT_BANNERS: BannerAd[] = [
  {
    image: "/advertising/dashboard-launch-mobile.png",
    url: "/download",
    alt: "Edutu mobile app floating above a glowing horizon with opportunity cards",
    eyebrow: "Coming soon to the web",
    title: "Edutu is landing in your browser",
    subtitle:
      "AI coaching, CV tools, and smarter application support are on the way.",
    cta: "See what is coming",
  },
  {
    image: "/advertising/dashboard-ai-matching.png",
    url: "/opportunities",
    alt: "Learner profile connected to scholarships and global opportunities by an AI compass",
    eyebrow: "AI-powered matching",
    title: "Find your next open door",
    subtitle:
      "Personalized scholarships, fellowships, and internships for your goals.",
    cta: "Explore opportunities",
  },
  {
    image: "/advertising/dashboard-mobile-features.png",
    url: "/download",
    alt: "Edutu mobile opportunity feed with saved cards, deadlines, and an application path",
    eyebrow: "Edutu mobile",
    title: "Save it. Track it. Make a move.",
    subtitle:
      "Keep every deadline and application in view — with the web experience coming soon.",
    cta: "Explore the app",
  },
  {
    image: "/advertising/dashboard-edutu-for-you.png",
    url: "/edutuforyou",
    alt: "African learners standing before a bright doorway to global opportunity",
    eyebrow: "Edutu For You",
    title: "One million young people. One open door.",
    subtitle:
      "Our impact program brings global opportunity closer to African learners.",
    cta: "See the impact",
  },
];

const BannerCarousel = React.memo(function BannerCarousel({
  banners,
  mobileHeight,
}: {
  banners: BannerAd[];
  mobileHeight?: string;
}) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    setCurrent((previous) => (previous < banners.length ? previous : 0));
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1 || isPaused || reduceMotion) return;
    const timer = setInterval(() => {
      setCurrent((previous) => (previous + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length, isPaused, reduceMotion]);

  useEffect(() => {
    // Fetch the upcoming slide ahead of the rotation so it never flashes in.
    if (banners.length <= 1) return;
    const next = new Image();
    next.src = banners[(current + 1) % banners.length].image;
  }, [banners, current]);

  if (banners.length === 0) return null;

  const activeBanner = banners[current];
  const isExternal = activeBanner.url?.startsWith("http");

  return (
    <div
      className="group relative w-full overflow-hidden rounded-[20px] bg-[#06152f] shadow-[0_18px_45px_-28px_rgba(6,21,47,0.9)]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      style={
        mobileHeight
          ? { height: mobileHeight, maxWidth: "800px", margin: "0 auto" }
          : {}
      }
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.a
          key={`${activeBanner.image}-${current}`}
          href={activeBanner.url || undefined}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          aria-label={activeBanner.title}
          className={`relative block w-full overflow-hidden ${
            activeBanner.url ? "cursor-pointer" : "pointer-events-none"
          }`}
          style={
            mobileHeight
              ? { height: mobileHeight }
              : { aspectRatio: "1200 / 300" }
          }
          initial={reduceMotion ? false : { opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
          transition={{
            duration: reduceMotion ? 0 : 0.45,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <img
            src={activeBanner.image}
            alt={activeBanner.alt}
            className="absolute inset-0 h-full w-full object-cover"
            loading={current === 0 ? "eager" : "lazy"}
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06152f]/95 via-[#06152f]/65 to-[#06152f]/5" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
          <div className="absolute inset-0 flex items-center px-5 py-4 sm:px-8">
            <div className="max-w-[72%] text-left sm:max-w-[58%]">
              {activeBanner.eyebrow ? (
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[#ffd166] sm:text-xs">
                  {activeBanner.eyebrow}
                </span>
              ) : null}
              <span className="mt-1 block text-base font-bold leading-tight tracking-tight text-white drop-shadow-sm sm:text-2xl">
                {activeBanner.title}
              </span>
              <span className="mt-1 block max-w-[32rem] text-[0.68rem] font-medium leading-relaxed text-white/80 drop-shadow-sm sm:text-sm">
                {activeBanner.subtitle}
              </span>
              {activeBanner.cta ? (
                <span className="mt-2 inline-flex rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[0.6rem] font-semibold text-white backdrop-blur-sm sm:mt-3 sm:px-3 sm:py-1.5 sm:text-xs">
                  {activeBanner.cta}
                  <ChevronRight size={13} className="ml-1" aria-hidden="true" />
                </span>
              ) : null}
            </div>
          </div>
        </motion.a>
      </AnimatePresence>

      {banners.length > 1 ? (
        <div className="absolute bottom-3 right-4 rounded-full bg-black/25 px-2.5 py-2 backdrop-blur-sm">
          <div
            className="flex items-center gap-1.5"
            role="tablist"
            aria-label="Dashboard promotions"
          >
            {banners.map((banner, index) => (
              <button
                key={banner.image}
                type="button"
                role="tab"
                aria-selected={index === current}
                aria-label={`Show promotion ${index + 1}`}
                onClick={() => {
                  setCurrent(index);
                  setIsPaused(false);
                }}
                className={`h-1.5 rounded-full transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                  index === current
                    ? "w-1.5 bg-white"
                    : "w-1.5 bg-white/45 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">
        Promotion {current + 1} of {banners.length}: {activeBanner.title}
      </span>
    </div>
  );
});

export default BannerCarousel;

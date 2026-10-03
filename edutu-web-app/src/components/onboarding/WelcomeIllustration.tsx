import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";

/** Original vector artwork: a member's profile connecting to opportunities. */
export default function WelcomeIllustration() {
  const id = useId();
  const reducedMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-labelledby={`${id}-title`}
      className="relative w-full max-w-[290px] md:max-w-[340px]"
      fill="none"
    >
      <title id={`${id}-title`}>Your profile connected to new opportunities</title>
      <defs>
        <linearGradient id={`${id}-blue`} x1="118" y1="70" x2="240" y2="220" gradientUnits="userSpaceOnUse">
          <stop stopColor="#347BFF" />
          <stop offset="1" stopColor="#2354D8" />
        </linearGradient>
      </defs>
      <circle cx="180" cy="140" r="116" fill="#2563EB" fillOpacity="0.06" />
      <circle cx="180" cy="140" r="88" stroke="#2563EB" strokeOpacity="0.16" strokeDasharray="4 8" />
      <path d="M70 114C82 62 117 39 170 33M290 166C278 220 243 243 190 248" stroke="#2563EB" strokeOpacity="0.2" strokeWidth="2" strokeLinecap="round" />
      <motion.g
        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <rect x="109" y="61" width="150" height="178" rx="22" fill="#1549B0" fillOpacity="0.08" />
        <rect x="103" y="53" width="150" height="178" rx="22" fill="white" stroke="#D9E5FC" strokeWidth="2" />
        <rect x="115" y="65" width="126" height="91" rx="14" fill={`url(#${id}-blue)`} />
        <circle cx="178" cy="97" r="16" fill="#DBEAFF" />
        <path d="M149 142C149 121 162 116 178 116C194 116 207 121 207 142" fill="#DBEAFF" />
        <rect x="123" y="173" width="86" height="7" rx="3.5" fill="#263E6C" />
        <rect x="123" y="188" width="108" height="6" rx="3" fill="#DFE9F9" />
        <rect x="123" y="202" width="66" height="6" rx="3" fill="#DFE9F9" />
        <circle cx="238" cy="68" r="21" fill="#D9F8EF" stroke="white" strokeWidth="4" />
        <path d="M229 68L235 74L247 62" stroke="#079E78" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
      <motion.g
        animate={reducedMotion ? undefined : { y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="39" y="122" width="70" height="60" rx="17" fill="#E5F8F2" stroke="white" strokeWidth="3" transform="rotate(-10 74 152)" />
        <path d="M53 146L74 135L95 146L74 157L53 146Z" fill="#09A77D" />
        <path d="M61 152V164C70 170 79 170 87 164V152" stroke="#09A77D" strokeWidth="3" strokeLinecap="round" />
      </motion.g>
      <motion.g
        animate={reducedMotion ? undefined : { y: [0, 5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="254" y="104" width="69" height="62" rx="17" fill="#FFF3D7" stroke="white" strokeWidth="3" transform="rotate(10 288 135)" />
        <path d="M271 148L301 121L292 151L283 139L271 148Z" fill="#EDA92B" stroke="#EDA92B" strokeWidth="2" strokeLinejoin="round" />
        <path d="M283 139L301 121" stroke="#FFF3D7" strokeWidth="2" />
      </motion.g>
      <motion.g
        animate={reducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <path d="M71 63V77M64 70H78M280 212V226M273 219H287" stroke="#347BFF" strokeWidth="3" strokeLinecap="round" />
        <circle cx="298" cy="71" r="5" fill="#16B38D" />
        <circle cx="84" cy="218" r="4" fill="#F2BB4A" />
      </motion.g>
    </svg>
  );
}

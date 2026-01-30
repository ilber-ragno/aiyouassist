export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981"/>
          <stop offset="100%" stopColor="#25d366"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logoBg)"/>
      <path d="M136 148 h240 a36 36 0 0 1 36 36 v144 a36 36 0 0 1-36 36 H236 l-60 52 v-52 H176 a36 36 0 0 1-36-36 V184 a36 36 0 0 1 36-36z" fill="white" fillOpacity="0.93"/>
      <circle cx="216" cy="256" r="16" fill="#10b981"/>
      <circle cx="296" cy="256" r="16" fill="#10b981"/>
      <circle cx="256" cy="216" r="12" fill="#059669"/>
      <circle cx="256" cy="296" r="12" fill="#059669"/>
      <line x1="232" y1="248" x2="248" y2="228" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
      <line x1="264" y1="228" x2="280" y2="248" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
      <line x1="232" y1="264" x2="248" y2="284" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
      <line x1="264" y1="284" x2="280" y2="264" stroke="#059669" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="256" cy="256" r="10" fill="#047857"/>
    </svg>
  );
}

export function LogoWhite({ size = 32, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      width={size}
      height={size}
      className={className}
    >
      <path d="M136 148 h240 a36 36 0 0 1 36 36 v144 a36 36 0 0 1-36 36 H236 l-60 52 v-52 H176 a36 36 0 0 1-36-36 V184 a36 36 0 0 1 36-36z" fill="white" fillOpacity="0.9"/>
      <circle cx="216" cy="256" r="16" fill="white" fillOpacity="0.6"/>
      <circle cx="296" cy="256" r="16" fill="white" fillOpacity="0.6"/>
      <circle cx="256" cy="216" r="12" fill="white" fillOpacity="0.5"/>
      <circle cx="256" cy="296" r="12" fill="white" fillOpacity="0.5"/>
      <line x1="232" y1="248" x2="248" y2="228" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.5"/>
      <line x1="264" y1="228" x2="280" y2="248" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.5"/>
      <line x1="232" y1="264" x2="248" y2="284" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.5"/>
      <line x1="264" y1="284" x2="280" y2="264" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.5"/>
      <circle cx="256" cy="256" r="10" fill="white" fillOpacity="0.7"/>
    </svg>
  );
}

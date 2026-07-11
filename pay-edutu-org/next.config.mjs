/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Paystack webhook must read the raw request body to verify the HMAC
  // signature — App Router route handlers already give us req.text(), so no
  // special body-parser config is needed here.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Never render inside a frame — blocks clickjacking on checkout/admin.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js inline runtime + styled-jsx need these two.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "form-action 'self' https://checkout.paystack.com",
              'upgrade-insecure-requests',
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;

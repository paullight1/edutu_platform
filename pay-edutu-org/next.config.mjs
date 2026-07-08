/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Paystack webhook must read the raw request body to verify the HMAC
  // signature — App Router route handlers already give us req.text(), so no
  // special body-parser config is needed here.
};

export default nextConfig;

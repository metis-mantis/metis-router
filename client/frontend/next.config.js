/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    swcMinify: true,
    output: 'standalone',
    experimental: {
        outputFileTracingRoot: undefined,
    },
}

module.exports = nextConfig
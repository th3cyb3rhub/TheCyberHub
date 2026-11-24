import type { NextConfig } from 'next'
import type { Configuration } from 'webpack'
import { withSentryConfig } from '@sentry/nextjs'
import { contentSecurityPolicy } from './src/lib/security/csp'

const nextConfig: NextConfig = {
    // Enable ESLint and TypeScript checking during builds
    eslint: {
        ignoreDuringBuilds: false,
    },

    typescript: {
        ignoreBuildErrors: false,
    },

    // Enable experimental features for better SEO and performance
    experimental: {
        optimizePackageImports: ['lucide-react'],
        scrollRestoration: true,
    },

    // Optimize images
    images: {
        formats: ['image/webp', 'image/avif'],
        deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
        imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
        minimumCacheTTL: 31536000, // 1 year cache
        dangerouslyAllowSVG: true,
        contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '*.amazonaws.com',
            },
            {
                protocol: 'https',
                hostname: 'avatars.githubusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'lh3.googleusercontent.com',
            },
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
            {
                protocol: 'https',
                hostname: 'cdn.thecyberhub.org',
            },
        ],
    },

    // Compiler optimizations
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production',
    },

    // Enhanced Security headers
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains; preload',
                    },
                    ...(process.env.NODE_ENV === 'production' ? [{
                        key: 'Content-Security-Policy',
                        value: contentSecurityPolicy(process.env.NEXT_PUBLIC_API_URL),
                    }] : []),
                ],
            },
            // The service worker must be re-checked on every load so a new version reaches members promptly
            {
                source: '/sw.js',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=0, must-revalidate',
                    },
                    {
                        key: 'Content-Type',
                        value: 'application/javascript; charset=utf-8',
                    },
                ],
            },
            // Cache static assets
            {
                source: '/favicon.ico',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
            {
                source: '/_next/static/(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=31536000, immutable',
                    },
                ],
            },
        ]
    },

    // Enhanced redirects for SEO
    async redirects() {
        return [
            // Tool redirects
            {
                source: '/jwt',
                destination: '/tools/jwt-analyzer',
                permanent: true,
            },
            {
                source: '/subdomain',
                destination: '/tools/subfinder',
                permanent: true,
            },
            {
                source: '/ssl',
                destination: '/tools/ssl-checker',
                permanent: true,
            },
            // Public profiles live at /user/:username (/profile is the signed-in member's own page)
            {
                source: '/profile/:username((?!sessions$|edit$)[^/]+)',
                destination: '/user/:username',
                permanent: true,
            },
            // Legacy redirects
            {
                source: '/jwt-tool',
                destination: '/tools/jwt-analyzer',
                permanent: true,
            },
            {
                source: '/subdomain-finder',
                destination: '/tools/subfinder',
                permanent: true,
            },
            // Cheatsheet redirects
            {
                source: '/linux',
                destination: '/cheatsheets/linux-commands',
                permanent: true,
            },
            {
                source: '/nmap',
                destination: '/cheatsheets/nmap',
                permanent: true,
            },
        ]
    },

    // Rewrites for API and special cases
    async rewrites() {
        return [
            {
                source: '/tools/:tool',
                destination: '/tools/:tool',
            },
        ]
    },

    // Output configuration for better performance
    // Note: 'standalone' output is for production deployments only
    ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' as const } : {}),
    poweredByHeader: false,
    compress: true,

    // Disable caching in development
    onDemandEntries: {
        maxInactiveAge: 15 * 1000,
        pagesBufferLength: 2,
    },

    // Webpack optimizations with proper typing
    webpack: (config: Configuration, { isServer }: { isServer: boolean }) => {
        if (!isServer) {
            config.resolve = config.resolve || {}
            config.resolve.fallback = {
                ...config.resolve.fallback,
                fs: false,
                net: false,
                tls: false,
            }
        }
        return config
    },
}

// Sentry is optional - only wrap if DSN is configured
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
    ? withSentryConfig(nextConfig, { silent: true })
    : nextConfig

export default finalConfig

// cache-bust-trigger-1
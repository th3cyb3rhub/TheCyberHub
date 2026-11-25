/**
 * React Query Client Configuration
 * 
 * Configures the QueryClient with optimal settings for caching,
 * retries, and stale time management.
 * 
 * Requirements: 3.2, 3.6
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { errorStatus } from '@/lib/authErrors';

// ============================================
// Query Client Configuration
// ============================================

/** An answer the API gave on purpose (4xx): repeating the request does not change it */
const isClientError = (error: unknown) => {
    const status = errorStatus(error);
    return status !== undefined && status >= 400 && status < 500;
};

/**
 * Create a new QueryClient with default options
 */
export const createQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: {
            // Data is considered fresh for 5 minutes
            staleTime: 5 * 60 * 1000,
            // Keep unused data in cache for 30 minutes
            gcTime: 30 * 60 * 1000,
            // Retry failed requests up to 3 times, but never an answer the API gave on purpose (4xx: a
            // refused session, a rate limit): repeating it does not change it, and every repeat of a
            // refused sign-in would ask for a new access token again
            retry: (failureCount: number, error: unknown) => !isClientError(error) && failureCount < 3,
            // Exponential backoff for retries (1s, 2s, 4s)
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            // Don't refetch on window focus (can be enabled per-query)
            refetchOnWindowFocus: false,
            // Don't refetch on reconnect by default
            refetchOnReconnect: 'always',
            // Network mode - always try to fetch
            networkMode: 'always',
        },
        mutations: {
            // Retry mutations once on failure, unless the API refused them on purpose
            retry: (failureCount: number, error: unknown) => !isClientError(error) && failureCount < 1,
            // Network mode for mutations
            networkMode: 'always',
        },
    },
});

// ============================================
// Query Keys
// ============================================

/**
 * Centralized query keys for cache management
 */
export const queryKeys = {
    // Auth
    // The signed-in account. The key carries the account id (read from the access token), so one
    // account's cached profile is never served to another.
    auth: {
        me: (userId: string | null) => ['auth', 'me', userId ?? 'unknown'] as const,
        sessions: (userId: string | null) => ['auth', 'sessions', userId ?? 'unknown'] as const,
    },
    
    // Users
    users: {
        all: ['users'] as const,
        list: (params?: Record<string, unknown>) => ['users', 'list', params] as const,
        detail: (id: string) => ['users', 'detail', id] as const,
        profile: (username: string) => ['users', 'profile', username] as const,
    },
    
    // Challenges
    challenges: {
        all: ['challenges'] as const,
        list: (params?: Record<string, unknown>) => ['challenges', 'list', params] as const,
        detail: (id: string) => ['challenges', 'detail', id] as const,
        byCategory: (category: string) => ['challenges', 'category', category] as const,
    },
    
    // Events
    events: {
        all: ['events'] as const,
        list: (params?: Record<string, unknown>) => ['events', 'list', params] as const,
        detail: (id: string) => ['events', 'detail', id] as const,
        upcoming: ['events', 'upcoming'] as const,
    },
    
    // Blogs
    blogs: {
        all: ['blogs'] as const,
        list: (params?: Record<string, unknown>) => ['blogs', 'list', params] as const,
        detail: (id: string) => ['blogs', 'detail', id] as const,
    },
    
    // Forums
    forums: {
        all: ['forums'] as const,
        list: (params?: Record<string, unknown>) => ['forums', 'list', params] as const,
        detail: (id: string) => ['forums', 'detail', id] as const,
        discussions: (forumId: string) => ['forums', forumId, 'discussions'] as const,
    },
    
    // Notifications
    notifications: {
        all: ['notifications'] as const,
        unread: ['notifications', 'unread'] as const,
        count: ['notifications', 'count'] as const,
    },
    
    // Search
    search: (query: string, type?: string) => ['search', query, type] as const,
};

// ============================================
// Stale Time Configurations
// ============================================

/**
 * Stale time configurations for different data types
 */
export const staleTimes = {
    // User data - relatively stable
    user: 5 * 60 * 1000, // 5 minutes
    
    // Lists - may change more frequently
    list: 2 * 60 * 1000, // 2 minutes
    
    // Detail pages - can be cached longer
    detail: 5 * 60 * 1000, // 5 minutes
    
    // Real-time data - short cache
    realtime: 30 * 1000, // 30 seconds
    
    // Static data - long cache
    static: 60 * 60 * 1000, // 1 hour
    
    // Notifications - check frequently
    notifications: 60 * 1000, // 1 minute
};

// ============================================
// Exports
// ============================================

export { QueryClientProvider };

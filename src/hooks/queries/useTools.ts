import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import * as api from '@/lib/api/tools';
import { FALLBACK_REGISTRY, findTool, mergeRegistry, type Registry, type ToolMeta } from '@/lib/tools/registry';
import type { CveSeverity, ToolCapability } from '@/types/tools';

/** One place for every tools query key */
export const toolKeys = {
    all: ['tools'] as const,
    registry: () => ['tools', 'registry'] as const,
    capabilities: () => ['tools', 'capabilities'] as const,
    cve: (id: string) => ['tools', 'cve', id] as const,
    cveSearch: (params: object) => ['tools', 'cve-search', params] as const,
    whois: (domain: string) => ['tools', 'whois', domain] as const,
    dns: (name: string, types: string) => ['tools', 'dns', name, types] as const,
    ip: (ip: string) => ['tools', 'ip', ip] as const,
    adminSettings: () => ['tools', 'admin', 'settings'] as const,
    adminStats: (days: number) => ['tools', 'admin', 'stats', days] as const,
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The tools list. Renders the built-in list at once and swaps in the API's answer when it
 * arrives, so the index never waits on the network and still works when the API is down.
 */
export function useToolsRegistry(): Registry & { isLoading: boolean; isError: boolean } {
    const query = useQuery({
        queryKey: toolKeys.registry(),
        queryFn: api.getToolsRegistry,
        staleTime: MINUTE,
        retry: 1,
    });
    const registry = useMemo(() => (query.data ? mergeRegistry(query.data) : FALLBACK_REGISTRY), [query.data]);
    return { ...registry, isLoading: query.isLoading, isError: query.isError };
}

/** What each server tool allows right now: enabled, why not, limits. Empty until it loads. */
export function useToolCapabilities() {
    return useQuery({
        queryKey: toolKeys.capabilities(),
        queryFn: api.getToolCapabilities,
        staleTime: MINUTE,
        retry: 1,
    });
}

export interface ToolState {
    tool: ToolMeta | undefined;
    capability: ToolCapability | undefined;
    /** False only when the API says the tool is switched off; unknown counts as available */
    available: boolean;
    /** Why it is off, as the API's reason code */
    reason: string | null;
}

/** The registry entry and the live capability of one tool, by page slug */
export function useTool(slug: string): ToolState {
    const registry = useToolsRegistry();
    const { data: capabilities } = useToolCapabilities();
    const tool = findTool(registry.tools, slug);
    const capability = tool ? capabilities?.[tool.id] : undefined;
    const available = !!tool && tool.enabled && capability?.enabled !== false;
    const reason = capability && capability.enabled === false ? (capability.reason ?? 'unknown') : tool && !tool.enabled ? 'unknown' : null;
    return { tool, capability, available, reason };
}

// ---- Passive tools ---------------------------------------------------------
// A failed lookup is not retried automatically: the visitor retries, so a run is never spent twice.

const lookupOptions = { retry: false, refetchOnWindowFocus: false } as const;

export function useCveSearch(params: { keyword: string; severity: CveSeverity | ''; page: number } | null) {
    return useQuery({
        queryKey: toolKeys.cveSearch(params ?? {}),
        queryFn: () => api.searchCves(params!),
        enabled: !!params,
        staleTime: HOUR,
        ...lookupOptions,
    });
}

export function useCve(id: string | null) {
    return useQuery({
        queryKey: toolKeys.cve(id ?? ''),
        queryFn: () => api.getCve(id!),
        enabled: !!id,
        staleTime: 24 * HOUR,
        ...lookupOptions,
    });
}

export function useWhois(domain: string | null) {
    return useQuery({
        queryKey: toolKeys.whois(domain ?? ''),
        queryFn: () => api.lookupWhois(domain!),
        enabled: !!domain,
        staleTime: 6 * HOUR,
        ...lookupOptions,
    });
}

export function useDns(name: string | null, types?: string[]) {
    const key = (types ?? []).join(',');
    return useQuery({
        queryKey: toolKeys.dns(name ?? '', key),
        queryFn: () => api.lookupDns(name!, types),
        enabled: !!name,
        staleTime: MINUTE,
        ...lookupOptions,
    });
}

export function useIp(ip: string | null) {
    return useQuery({
        queryKey: toolKeys.ip(ip ?? ''),
        queryFn: () => api.lookupIp(ip!),
        enabled: !!ip,
        staleTime: 6 * HOUR,
        ...lookupOptions,
    });
}

// ---- Active tools: a mutation each, never retried ---------------------------

const runOptions = { retry: false } as const;

export const useHeaderScan = () => useMutation({ mutationFn: api.scanHeaders, ...runOptions });
export const useCorsScan = () => useMutation({ mutationFn: api.testCors, ...runOptions });
export const useSubdomains = () => useMutation({ mutationFn: api.findSubdomains, ...runOptions });
export const useTakeoverScan = () => useMutation({ mutationFn: api.checkTakeover, ...runOptions });
export const useSslCheck = () => useMutation({ mutationFn: api.checkSsl, ...runOptions });

// ---- Admin -----------------------------------------------------------------

export function useAdminToolSettings(enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: [...toolKeys.adminSettings(), user?.id ?? null],
        queryFn: api.getAdminToolSettings,
        enabled: enabled && !!user,
        staleTime: 15_000,
        retry: false,
    });
}

export function useAdminToolStats(days: number, enabled = true) {
    const { user } = useAuth();
    return useQuery({
        queryKey: [...toolKeys.adminStats(days), user?.id ?? null],
        queryFn: () => api.getAdminToolStats(days),
        enabled: enabled && !!user,
        staleTime: MINUTE,
        retry: false,
    });
}

/** Saves a kill switch, cap or blocked-target change and puts the answer in the cache */
export function useUpdateToolSettings() {
    const qc = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: api.updateAdminToolSettings,
        retry: false,
        onSuccess: (settings) => {
            qc.setQueryData([...toolKeys.adminSettings(), user?.id ?? null], settings);
            // The public list and capabilities follow the switches
            qc.invalidateQueries({ queryKey: toolKeys.registry() });
            qc.invalidateQueries({ queryKey: toolKeys.capabilities() });
        },
    });
}

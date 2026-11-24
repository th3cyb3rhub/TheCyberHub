import {
    Bug, Database, Diff, FileCode, FileText, Globe, Hash, Key, Link as LinkIcon, Lock, Network, Radio, Search, Shield,
    ShieldCheck, Terminal, Wifi, type LucideIcon,
} from 'lucide-react';
import type { ToolIconName } from '@/lib/tools/registry';

const ICONS: Record<ToolIconName, LucideIcon> = {
    bug: Bug,
    search: Search,
    wifi: Wifi,
    globe: Globe,
    shield: Shield,
    'shield-check': ShieldCheck,
    lock: Lock,
    key: Key,
    terminal: Terminal,
    hash: Hash,
    'file-code': FileCode,
    database: Database,
    'file-text': FileText,
    radio: Radio,
    link: LinkIcon,
    network: Network,
    diff: Diff,
    markdown: FileText,
};

export function ToolIcon({ name, className = 'h-5 w-5' }: { name: ToolIconName; className?: string }) {
    const Icon = ICONS[name] ?? Shield;
    return <Icon className={className} aria-hidden="true" />;
}

import { Cloud, KeyRound, BookOpen, Laptop } from 'lucide-react';
import { TRUST_LABELS, trustKind, type ToolMeta } from '@/lib/tools/registry';
import { chip, tone } from './styles';

const STYLE = {
    browser: { icon: Laptop, tone: tone.good },
    reference: { icon: BookOpen, tone: tone.neutral },
    server: { icon: Cloud, tone: tone.info },
    'server-login': { icon: KeyRound, tone: tone.warn },
} as const;

/** Where the tool runs: your browser, our server, or a reference page. Text and icon, not colour alone. */
export function TrustBadge({ tool }: { tool: Pick<ToolMeta, 'kind' | 'auth'> }) {
    const kind = trustKind(tool);
    const { icon: Icon, tone: toneClass } = STYLE[kind];
    const { label, hint } = TRUST_LABELS[kind];
    return (
        <span className={`${chip} ${toneClass}`} title={hint} data-testid="trust-badge" data-trust={kind}>
            <Icon className="h-3 w-3" aria-hidden="true" /> {label}
        </span>
    );
}

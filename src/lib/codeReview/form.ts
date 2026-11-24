import { CR_SEVERITIES, type CrAdminSnippet, type CrDifficulty, type CrExploitExample, type CrFindingInput, type CrSeverity, type CrSnippetPayload } from '@/types/codeReview';
import { CR_LIMITS, CR_RESERVED_SLUGS } from './constants';

/**
 * The editor's form: the values as text, what is sent, and the checks. The API stays the judge, but
 * every rule it has that can be known without the other findings of the server (limits, ranges
 * that fit the code, findings that do not overlap) is checked here as the author types.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const CWE = /^CWE-\d{1,5}$/;

let counter = 0;
/** A local React key for a row that has no id yet */
export const rowKey = () => `row-${++counter}`;

export interface FindingRow {
    key: string;
    lineStart: string;
    lineEnd: string;
    title: string;
    vulnerabilityType: string;
    severity: CrSeverity;
    cwe: string;
    owasp: string;
    explanation: string;
    exploitDescription: string;
    exploitPayload: string;
    exploitResult: string;
    fixDescription: string;
    fixCode: string;
}
export interface HintRow { key: string; text: string; cost: string }

export interface CrFormValues {
    title: string;
    slug: string;
    description: string;
    language: string;
    category: string;
    difficulty: CrDifficulty;
    /** Text so an empty box is not "0". 0 means "use the points table". */
    points: string;
    /** Comma separated */
    tags: string;
    vulnerableCode: string;
    findings: FindingRow[];
    hints: HintRow[];
    explanation: string;
    fixedCode: string;
    exploitedCode: string;
    fixedExploitedCode: string;
    exploitTitle: string;
    exploitDescription: string;
    exploitPayload: string;
    exploitResult: string;
    isPublished: boolean;
}

export const newFinding = (range?: { start: number; end: number }): FindingRow => ({
    key: rowKey(),
    lineStart: range ? String(range.start) : '',
    lineEnd: range ? String(range.end) : '',
    title: '', vulnerabilityType: 'other', severity: 'medium', cwe: '', owasp: '', explanation: '',
    exploitDescription: '', exploitPayload: '', exploitResult: '', fixDescription: '', fixCode: '',
});
export const newHint = (): HintRow => ({ key: rowKey(), text: '', cost: String(CR_LIMITS.hintCostDefault) });

export const emptySnippet = (): CrFormValues => ({
    title: '', slug: '', description: '', language: 'python', category: 'sqli', difficulty: 'easy', points: '0', tags: '',
    vulnerableCode: '', findings: [], hints: [], explanation: '', fixedCode: '', exploitedCode: '', fixedExploitedCode: '',
    exploitTitle: '', exploitDescription: '', exploitPayload: '', exploitResult: '', isPublished: false,
});

// ---------------------------------------------------------------------------
// Code and lines: the same rules as the API, so both count the same way
// ---------------------------------------------------------------------------

/** LF line endings, trailing blank space and blank lines at the end removed; indentation is kept */
export const normaliseCode = (text: string): string => String(text).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
/** The number of lines of the code once it is stored. Empty text has no lines. */
export const countLines = (text: string): number => { const n = normaliseCode(text); return n ? n.split('\n').length : 0; };
export const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export interface FindingProblem { index: number; field: 'lineStart' | 'lineEnd'; message: string }

const whole = (text: string): number | null => (/^\d{1,6}$/.test(text.trim()) ? Number(text.trim()) : null);

/**
 * What is wrong with the ranges of the findings against code of `lineCount` lines: a missing or
 * non-numeric line, an end before its start, a range past the last line, or two findings that
 * share a line (a mark could then match either, and grading would depend on the pairing).
 */
export function findingProblems(rows: Pick<FindingRow, 'lineStart' | 'lineEnd'>[], lineCount: number): FindingProblem[] {
    const problems: FindingProblem[] = [];
    const valid: { index: number; start: number; end: number }[] = [];
    rows.forEach((row, index) => {
        const start = whole(row.lineStart);
        const end = whole(row.lineEnd);
        if (start === null || start < 1) { problems.push({ index, field: 'lineStart', message: 'Enter the first line as a whole number, 1 or more' }); return; }
        if (end === null || end < 1) { problems.push({ index, field: 'lineEnd', message: 'Enter the last line as a whole number, 1 or more' }); return; }
        if (end < start) { problems.push({ index, field: 'lineEnd', message: 'The last line cannot be before the first line' }); return; }
        if (start > lineCount) { problems.push({ index, field: 'lineStart', message: `The first line is past the end of the code (${lineCount} ${lineCount === 1 ? 'line' : 'lines'})` }); return; }
        if (end > lineCount) { problems.push({ index, field: 'lineEnd', message: `The last line is past the end of the code (${lineCount} ${lineCount === 1 ? 'line' : 'lines'})` }); return; }
        valid.push({ index, start, end });
    });
    const sorted = [...valid].sort((a, b) => a.start - b.start || a.index - b.index);
    for (let i = 1; i < sorted.length; i += 1) {
        const earlier = sorted.slice(0, i).reduce((best, f) => (f.end > best.end ? f : best));
        if (sorted[i].start <= earlier.end) {
            problems.push({ index: sorted[i].index, field: 'lineStart', message: `Overlaps finding ${earlier.index + 1}: findings cannot share lines` });
        }
    }
    return problems;
}

/** The lines each valid finding covers, for painting the preview. Rows that do not parse are left out. */
export function findingBands(rows: Pick<FindingRow, 'lineStart' | 'lineEnd'>[], lineCount: number): { start: number; end: number; index: number }[] {
    const out: { start: number; end: number; index: number }[] = [];
    rows.forEach((row, index) => {
        const start = whole(row.lineStart);
        const end = whole(row.lineEnd);
        if (start !== null && end !== null && start >= 1 && end >= start && start <= lineCount) out.push({ start, end: Math.min(end, lineCount), index });
    });
    return out;
}

// ---------------------------------------------------------------------------
// Snippet -> form
// ---------------------------------------------------------------------------

export function fromSnippet(s: CrAdminSnippet): CrFormValues {
    const ex = s.exploitExample ?? {};
    return {
        title: s.title,
        slug: s.slug,
        description: s.description,
        language: s.language,
        category: s.category,
        difficulty: s.difficulty,
        points: String(s.points ?? 0),
        tags: s.tags.join(', '),
        vulnerableCode: s.vulnerableCode,
        findings: s.findings.map((f) => ({
            key: rowKey(),
            lineStart: String(f.lineStart), lineEnd: String(f.lineEnd),
            title: f.title ?? '', vulnerabilityType: f.vulnerabilityType, severity: f.severity,
            cwe: f.cwe ?? '', owasp: f.owasp ?? '', explanation: f.explanation,
            exploitDescription: f.exploit?.description ?? '', exploitPayload: f.exploit?.payload ?? '', exploitResult: f.exploit?.result ?? '',
            fixDescription: f.fix?.description ?? '', fixCode: f.fix?.code ?? '',
        })),
        hints: [...s.hints].sort((a, b) => a.order - b.order).map((h) => ({ key: rowKey(), text: h.text, cost: String(h.cost) })),
        explanation: s.explanation,
        fixedCode: s.fixedCode,
        exploitedCode: s.exploitedCode,
        fixedExploitedCode: s.fixedExploitedCode,
        exploitTitle: ex.title ?? '',
        exploitDescription: ex.description ?? '',
        exploitPayload: ex.payload ?? '',
        exploitResult: ex.result ?? '',
        isPublished: s.isPublished,
    };
}

// ---------------------------------------------------------------------------
// Form -> payload
// ---------------------------------------------------------------------------

/** Tags as the editor keeps them: trimmed, no empties, no repeats (compared without case) */
export function parseTags(text: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of text.split(/[,\n]/)) {
        const tag = raw.trim();
        const id = tag.toLowerCase();
        if (tag && !seen.has(id)) { seen.add(id); out.push(tag); }
    }
    return out;
}

const trimmed = (s: string) => s.trim();

function toFinding(r: FindingRow): CrFindingInput {
    const out: CrFindingInput = {
        lineStart: Number(r.lineStart), lineEnd: Number(r.lineEnd),
        vulnerabilityType: r.vulnerabilityType, severity: r.severity, explanation: trimmed(r.explanation),
    };
    if (trimmed(r.title)) out.title = trimmed(r.title);
    if (trimmed(r.cwe)) out.cwe = trimmed(r.cwe).toUpperCase();
    if (trimmed(r.owasp)) out.owasp = trimmed(r.owasp);
    if (r.exploitDescription.trim() || r.exploitPayload.trim() || r.exploitResult.trim()) {
        out.exploit = { description: trimmed(r.exploitDescription), payload: r.exploitPayload, result: r.exploitResult };
    }
    if (r.fixDescription.trim() || r.fixCode.trim()) out.fix = { description: trimmed(r.fixDescription), code: r.fixCode };
    return out;
}

function toExample(v: CrFormValues): CrExploitExample | undefined {
    if (!v.exploitTitle.trim() && !v.exploitDescription.trim() && !v.exploitPayload.trim() && !v.exploitResult.trim()) return undefined;
    return { title: trimmed(v.exploitTitle), description: trimmed(v.exploitDescription), payload: v.exploitPayload, result: v.exploitResult };
}

/**
 * What the API is sent. The code is sent as typed (the API normalises it the same way this form
 * counts lines). On an edit the optional texts are always sent, so clearing one clears it; the
 * slug is only sent for a new exercise.
 */
export function buildPayload(v: CrFormValues, mode: 'create' | 'edit'): CrSnippetPayload {
    const payload: CrSnippetPayload = {
        title: trimmed(v.title),
        description: trimmed(v.description),
        language: v.language,
        category: v.category,
        difficulty: v.difficulty,
        points: v.points.trim() === '' ? 0 : Number(v.points),
        tags: parseTags(v.tags),
        vulnerableCode: v.vulnerableCode,
        findings: v.findings.map(toFinding),
        hints: v.hints.map((h) => ({ text: trimmed(h.text), cost: h.cost.trim() === '' ? NaN : Number(h.cost) })),
        explanation: v.explanation,
        fixedCode: v.fixedCode,
        exploitedCode: v.exploitedCode,
        fixedExploitedCode: v.fixedExploitedCode,
        isPublished: v.isPublished,
    };
    const example = toExample(v);
    if (example) payload.exploitExample = example;
    else if (mode === 'edit') payload.exploitExample = {};
    if (mode === 'create' && trimmed(v.slug)) payload.slug = trimmed(v.slug).toLowerCase();
    return payload;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

/** A slug as the API takes it: 3 to 80 characters of words joined by single hyphens, not reserved, not an id lookalike. Empty is fine (made from the title). */
export function slugProblem(slug: string): string | null {
    const s = slug.trim().toLowerCase();
    if (!s) return null;
    if (s.length < CR_LIMITS.slugMin || s.length > CR_LIMITS.slug) return `A slug has ${CR_LIMITS.slugMin} to ${CR_LIMITS.slug} characters`;
    if (!SLUG.test(s)) return 'A slug can only contain lowercase letters, numbers and single hyphens';
    if ((CR_RESERVED_SLUGS as readonly string[]).includes(s)) return 'This slug is reserved';
    if (OBJECT_ID.test(s)) return 'A slug cannot look like an id (24 hexadecimal characters)';
    return null;
}

/** The problems of a form, keyed by the API field path so server and local messages sit in the same place */
export function validateSnippet(v: CrFormValues, opts: { mode: 'create' | 'edit' }): Record<string, string> {
    const e: Record<string, string> = {};
    const title = v.title.trim();
    if (title.length < CR_LIMITS.titleMin || title.length > CR_LIMITS.title) e.title = `The title has ${CR_LIMITS.titleMin} to ${CR_LIMITS.title} characters`;
    if (opts.mode === 'create') { const p = slugProblem(v.slug); if (p) e.slug = p; }
    const description = v.description.trim();
    if (description.length < CR_LIMITS.descriptionMin || description.length > CR_LIMITS.description) e.description = `The description has ${CR_LIMITS.descriptionMin} to ${CR_LIMITS.description} characters`;

    const code = normaliseCode(v.vulnerableCode);
    if (code.length < CR_LIMITS.codeMin) e.vulnerableCode = `The code needs at least ${CR_LIMITS.codeMin} characters`;
    else if (byteLength(code) > CR_LIMITS.codeBytes) e.vulnerableCode = `The code cannot be over ${CR_LIMITS.codeBytes / 1024} KB`;

    if (v.points.trim() !== '') {
        const points = Number(v.points);
        if (!Number.isInteger(points) || points < 0 || points > CR_LIMITS.points) e.points = `Points are a whole number from 0 to ${CR_LIMITS.points} (0 uses the table)`;
    }
    const tags = parseTags(v.tags);
    if (tags.length > CR_LIMITS.tags) e.tags = `At most ${CR_LIMITS.tags} tags`;
    else if (tags.some((t) => t.length > CR_LIMITS.tagLength)) e.tags = `A tag has at most ${CR_LIMITS.tagLength} characters`;

    if (v.findings.length > CR_LIMITS.findings) e.findings = `At most ${CR_LIMITS.findings} findings`;
    const lineCount = countLines(v.vulnerableCode);
    for (const p of findingProblems(v.findings, lineCount)) e[`findings.${p.index}.${p.field}`] = p.message;
    v.findings.forEach((f, i) => {
        if (f.explanation.trim().length < CR_LIMITS.findingExplanationMin) e[`findings.${i}.explanation`] = `Explain the issue in at least ${CR_LIMITS.findingExplanationMin} characters`;
        else if (f.explanation.trim().length > CR_LIMITS.findingExplanation) e[`findings.${i}.explanation`] = `The explanation has at most ${CR_LIMITS.findingExplanation} characters`;
        if (f.title.trim().length > CR_LIMITS.findingTitle) e[`findings.${i}.title`] = `The title has at most ${CR_LIMITS.findingTitle} characters`;
        if (f.cwe.trim() && !CWE.test(f.cwe.trim().toUpperCase())) e[`findings.${i}.cwe`] = 'A CWE looks like CWE-89';
        if (f.owasp.trim().length > CR_LIMITS.owasp) e[`findings.${i}.owasp`] = `At most ${CR_LIMITS.owasp} characters`;
        if (!(CR_SEVERITIES as readonly string[]).includes(f.severity)) e[`findings.${i}.severity`] = 'Choose a severity';
        if (f.exploitDescription.length > CR_LIMITS.findingNote || f.exploitPayload.length > CR_LIMITS.findingNote || f.exploitResult.length > CR_LIMITS.findingNote) e[`findings.${i}.exploit`] = `Each exploit note has at most ${CR_LIMITS.findingNote} characters`;
        if (f.fixDescription.length > CR_LIMITS.findingNote || f.fixCode.length > CR_LIMITS.findingFixCode) e[`findings.${i}.fix`] = `The fix description has at most ${CR_LIMITS.findingNote} characters and the fix code ${CR_LIMITS.findingFixCode}`;
    });

    if (v.hints.length > CR_LIMITS.hints) e.hints = `At most ${CR_LIMITS.hints} hints`;
    v.hints.forEach((h, i) => {
        const text = h.text.trim();
        if (!text) e[`hints.${i}.text`] = 'Write the hint';
        else if (text.length > CR_LIMITS.hintText) e[`hints.${i}.text`] = `A hint has at most ${CR_LIMITS.hintText} characters`;
        const cost = Number(h.cost);
        if (h.cost.trim() === '' || !Number.isInteger(cost) || cost < 0 || cost > CR_LIMITS.hintCostMax) e[`hints.${i}.cost`] = `The cost is a whole number from 0 to ${CR_LIMITS.hintCostMax}`;
    });

    if (v.explanation.length > CR_LIMITS.overview) e.explanation = `At most ${CR_LIMITS.overview} characters`;
    for (const field of ['fixedCode', 'exploitedCode', 'fixedExploitedCode'] as const) {
        if (byteLength(normaliseCode(v[field])) > CR_LIMITS.extraCodeBytes) e[field] = `At most ${CR_LIMITS.extraCodeBytes / 1024} KB`;
    }
    if (v.isPublished && v.findings.length === 0) e.findings = 'Add at least one finding before you publish, or save it as a draft';
    return e;
}

/** Code that the global input sanitiser of the API would change: `<script>` blocks and `on...=` attributes in a body are stripped */
export function wouldBeStripped(text: string): boolean {
    return /<\s*script\b/i.test(text) || /\son[a-z]+\s*=/i.test(text);
}

/** The lines two or more findings share, for painting a conflict in the preview */
export function overlapBands(bands: { start: number; end: number }[]): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    for (let i = 0; i < bands.length; i += 1) {
        for (let j = i + 1; j < bands.length; j += 1) {
            const start = Math.max(bands[i].start, bands[j].start);
            const end = Math.min(bands[i].end, bands[j].end);
            if (start <= end) out.push({ start, end });
        }
    }
    return out;
}

/** The fields whose errors are shown as soon as they are wrong (the ranges of the findings), before the form was ever submitted */
export const isLiveError = (path: string): boolean => /^findings\.\d+\.(lineStart|lineEnd)$/.test(path);

'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, Code2, FileText, Flag, Loader2, Lock, Paperclip, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
    flattenMessagePages, useDiscardMessage, useMarkRead, useMessages, useOutbox, useReport, useSendFile, useSendMessage,
} from '@/hooks/queries/useMentorship';
import { useDocumentVisible } from '@/hooks/useDocumentVisible';
import { useNow, useViewerZone } from '@/lib/events/clock';
import { toLocalParts } from '@/lib/events/time';
import { CODE_LANGUAGES, codeProblem, groupByDay, languageLabel, looksLikeMarkup, unfenceCode } from '@/lib/mentorship/chat';
import { displayName, formatBytes, safeHttpsUrl } from '@/lib/mentorship/display';
import { chatFileProblem, CHAT_FILE_ACCEPT, LIMITS, messageProblem } from '@/lib/mentorship/schemas';
import type { Mentorship, MentorshipMessage } from '@/types/mentorship';
import { ReportDialog } from './FeedbackDialog';
import { Avatar, ErrorState, Skeleton } from './shared';
import { btnGhost, btnPrimary, btnSecondary, card, focusRing, muted, input } from './styles';

const CODE_OVERHEAD = 40;

function clock(iso: string, zone: string | null) {
    const t = toLocalParts(iso, zone ?? 'UTC').time;
    return t;
}

/** One message. Everything is rendered as text: React escapes it, and code goes in a code block, never as HTML. */
export function MessageBubble({ message, mine, zone, onRetry, onDiscard, onReport }: {
    message: MentorshipMessage; mine: boolean; zone: string | null; onRetry?: () => void; onDiscard?: () => void; onReport?: () => void;
}) {
    const code = message.contentType === 'code' && message.content !== null ? unfenceCode(message.content, message.codeLanguage) : null;
    const lang = code ? languageLabel(code.language) : null;
    // Only an https address is ever linked, whatever the message carries
    const attachmentHref = safeHttpsUrl(message.attachment?.url);
    return (
        <li className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`} data-testid="message" data-mine={mine} data-pending={message.pending ?? ''}>
            {!mine && <Avatar person={message.sender} size={28} />}
            <div className={`min-w-0 max-w-[85%] sm:max-w-[75%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className={`min-w-0 max-w-full rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-orange-700 text-white' : 'rounded-bl-md bg-gray-100 text-gray-900 dark:bg-neutral-800 dark:text-gray-100'} ${message.pending === 'sending' ? 'opacity-70' : ''}`}>
                    {message.hidden || message.content === null ? (
                        <p className="italic opacity-80">This message was hidden by a moderator.</p>
                    ) : message.contentType === 'file' && message.attachment ? (
                        attachmentHref ? (
                            <a href={attachmentHref} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 underline ${focusRing}`}>
                                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="break-all">{message.attachment.filename}</span>
                                <span className="shrink-0 text-xs opacity-80">{formatBytes(message.attachment.size)}</span>
                                <span className="sr-only">(opens in a new tab)</span>
                            </a>
                        ) : (
                            <span className="flex items-center gap-2" data-testid="attachment-unavailable">
                                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="break-all">{message.attachment.filename}</span>
                                <span className="text-xs opacity-80">(link unavailable)</span>
                            </span>
                        )
                    ) : code ? (
                        <figure className="min-w-0" data-testid="code-message">
                            {lang && <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide opacity-80">{lang}</figcaption>}
                            <pre className="max-w-full overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100 dark:bg-black"><code>{code.code}</code></pre>
                        </figure>
                    ) : (
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    )}
                </div>
                <div className={`mt-0.5 flex items-center gap-2 px-1 text-xs ${muted}`}>
                    {!mine && <span>{displayName(message.sender)}</span>}
                    <time dateTime={message.createdAt}>{clock(message.createdAt, zone)}</time>
                    {mine && !message.pending && message.isRead && <span>Read</span>}
                    {message.pending === 'sending' && <span>Sending</span>}
                    {message.pending === 'failed' && (
                        <span className="flex items-center gap-2 text-red-700 dark:text-red-400" role="alert">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" /> Not sent
                            <button type="button" className="underline" onClick={onRetry}>Retry</button>
                            <button type="button" className="underline" onClick={onDiscard}>Remove</button>
                        </span>
                    )}
                    {!mine && !message.pending && onReport && !message.hidden && (
                        <button type="button" className={`inline-flex items-center gap-1 rounded hover:text-red-700 dark:hover:text-red-400 ${focusRing}`} onClick={onReport}><Flag className="h-3 w-3" aria-hidden="true" /> Report<span className="sr-only"> this message</span></button>
                    )}
                </div>
            </div>
        </li>
    );
}

function Composer({ mentorship }: { mentorship: Mentorship }) {
    const id = useId();
    const send = useSendMessage(mentorship._id);
    const sendFile = useSendFile(mentorship._id);
    const fileRef = useRef<HTMLInputElement>(null);
    const [text, setText] = useState('');
    const [mode, setMode] = useState<'text' | 'code'>('text');
    const [language, setLanguage] = useState('');
    const [problem, setProblem] = useState<string | null>(null);
    const status = mentorship.status;

    if (!mentorship.viewer.canMessage) {
        return (
            <div className={`flex items-start gap-2 border-t border-gray-200 bg-gray-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900 ${muted}`} data-testid="chat-disabled" role="status">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {status === 'paused' ? 'This mentorship is paused, so the chat is read-only. Resume it to write again.'
                    : status === 'terminated' ? 'Staff ended this mentorship, so the chat is read-only.'
                        : 'This mentorship is completed, so the chat is read-only.'}
            </div>
        );
    }

    const fenceProblem = mode === 'code' ? codeProblem(text) : null;
    const showMarkupHint = mode === 'text' && looksLikeMarkup(text);
    const limit = mode === 'code' ? LIMITS.message - CODE_OVERHEAD : LIMITS.message;
    const submit = () => {
        const bad = messageProblem(text) ?? (mode === 'code' ? codeProblem(text) : null) ?? (text.trim().length > limit ? `A message cannot exceed ${limit} characters.` : null);
        if (bad) { setProblem(bad); return; }
        setProblem(null);
        send.mutate({ content: mode === 'code' ? text.replace(/\s+$/, '') : text.trim(), contentType: mode, codeLanguage: language || undefined });
        setText('');
    };

    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== 'Enter') return;
        // Text: Enter sends, Shift+Enter breaks the line. Code: Enter breaks the line, Ctrl or Cmd+Enter sends.
        const wantsSend = mode === 'text' ? !e.shiftKey : e.ctrlKey || e.metaKey;
        if (wantsSend) { e.preventDefault(); submit(); }
    };

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const bad = chatFileProblem(file);
        if (bad) { setProblem(bad); return; }
        setProblem(null);
        sendFile.mutate({ file });
    };

    return (
        <div className="border-t border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900" data-testid="composer">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-gray-300 p-0.5 dark:border-neutral-700" role="radiogroup" aria-label="Message type">
                    {(['text', 'code'] as const).map((m) => (
                        <label key={m} className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium focus-within:ring-2 focus-within:ring-orange-500 ${mode === m ? 'bg-orange-700 text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                            <input type="radio" className="sr-only" name={`${id}-mode`} checked={mode === m} onChange={() => { setMode(m); setProblem(null); }} />
                            {m === 'code' && <Code2 className="h-3.5 w-3.5" aria-hidden="true" />}{m === 'text' ? 'Text' : 'Code'}
                        </label>
                    ))}
                </div>
                {mode === 'code' && (
                    <>
                        <label htmlFor={`${id}-lang`} className="sr-only">Language</label>
                        <select id={`${id}-lang`} value={language} onChange={(e) => setLanguage(e.target.value)} className={`${input} !w-auto !py-1 text-xs`}>
                            {CODE_LANGUAGES.map((l) => <option key={l} value={l}>{l || 'Language'}</option>)}
                        </select>
                    </>
                )}
                <input ref={fileRef} type="file" accept={CHAT_FILE_ACCEPT} className="sr-only" onChange={onFile} aria-label="Attach a file" tabIndex={-1} data-testid="file-input" />
                <button type="button" className={`${btnGhost} !px-2.5 !py-1 text-xs`} onClick={() => fileRef.current?.click()} disabled={sendFile.isPending}>
                    {sendFile.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Paperclip className="h-4 w-4" aria-hidden="true" />} Attach
                </button>
                <span className={`text-xs ${muted}`}>Images, PDF, Word or text, up to 5 MB</span>
            </div>
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <label htmlFor={`${id}-text`} className="sr-only">Write a message</label>
                    <textarea id={`${id}-text`} rows={mode === 'code' ? 4 : 2} value={text} onChange={(e) => { setText(e.target.value); setProblem(null); }} onKeyDown={onKey}
                        placeholder={mode === 'code' ? 'Paste code. Ctrl+Enter sends.' : 'Write a message. Enter sends, Shift+Enter adds a line.'}
                        className={`${input} resize-none ${mode === 'code' ? 'font-mono text-xs' : ''}`} aria-describedby={problem ? `${id}-problem` : undefined} aria-invalid={!!problem} />
                </div>
                <button type="button" className={`${btnPrimary} !px-4`} onClick={submit} disabled={!text.trim()} aria-label="Send message"><Send className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <div className="mt-1 flex justify-between text-xs">
                <div>
                    <p id={`${id}-problem`} role="alert" className="text-red-700 dark:text-red-400">{problem ?? fenceProblem ?? (sendFile.isError ? 'The file could not be sent.' : '')}</p>
                    {showMarkupHint && !problem && (
                        <p className={muted} data-testid="markup-hint">
                            This looks like code or HTML. The server removes tags from text messages. <button type="button" className={`underline ${focusRing}`} onClick={() => { setMode('code'); setProblem(null); }}>Send it as code</button> to keep it as written.
                        </p>
                    )}
                </div>
                {text.length > limit * 0.8 && <span className={text.length > limit ? 'text-red-700 dark:text-red-400' : muted}>{text.length}/{limit}</span>}
            </div>
        </div>
    );
}

export function ChatPanel({ mentorship, active }: { mentorship: Mentorship; active: boolean }) {
    const { user } = useAuth();
    const zone = useViewerZone();
    const now = useNow(60_000);
    const query = useMessages(mentorship._id, { enabled: active });
    const outbox = useOutbox(mentorship._id);
    const visible = useDocumentVisible();
    const send = useSendMessage(mentorship._id);
    const discard = useDiscardMessage(mentorship._id);
    const report = useReport(mentorship._id);
    const [reporting, setReporting] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const prepending = useRef(false);
    const prevHeight = useRef(0);
    const [away, setAway] = useState(false);

    const messages = useMemo(() => flattenMessagePages(query.data, outbox), [query.data, outbox]);
    const groups = useMemo(() => groupByDay(messages, zone, now ?? new Date(0)), [messages, zone, now]);
    const viewerId = user?.id;
    const unread = messages.filter((m) => m.sender._id !== viewerId && !m.isRead && !m.pending).length;
    useMarkRead(mentorship._id, unread, active && visible);

    // Screen readers hear only a message that arrives at the end, not the older pages that load above
    const [announcement, setAnnouncement] = useState('');
    const lastId = useRef<string | null>(null);
    useEffect(() => {
        const last = messages[messages.length - 1];
        if (!last) return;
        if (lastId.current !== null && lastId.current !== last._id && last.sender._id !== viewerId && !last.pending) {
            const what = last.hidden || last.content === null ? 'a message that was hidden' : last.contentType === 'file' ? `a file, ${last.attachment?.filename ?? ''}` : last.contentType === 'code' ? 'a code snippet' : last.content.slice(0, 200);
            setAnnouncement(`${displayName(last.sender)}: ${what}`);
        }
        lastId.current = last._id;
    }, [messages, viewerId]);

    // Stay at the bottom while new messages arrive, unless the reader scrolled up
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el) return;
        if (prepending.current) {
            // Older messages were added above: keep the reader where they were
            if (el.scrollHeight > prevHeight.current) {
                el.scrollTop += el.scrollHeight - prevHeight.current;
                prepending.current = false;
            }
        } else if (stick.current) {
            el.scrollTop = el.scrollHeight;
        } else if (messages.length) {
            setAway(true);
        }
        prevHeight.current = el.scrollHeight;
    }, [messages.length]);

    const onScroll = () => {
        const el = listRef.current;
        if (!el) return;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (stick.current) setAway(false);
    };

    const loadOlder = useCallback(() => {
        const el = listRef.current;
        if (el) prevHeight.current = el.scrollHeight;
        stick.current = false;
        prepending.current = true;
        query.fetchNextPage();
    }, [query]);

    // Reaching the top of the list loads older messages
    useEffect(() => {
        const top = topRef.current;
        if (!top || !query.hasNextPage || query.isFetchingNextPage || typeof IntersectionObserver === 'undefined') return undefined;
        const obs = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) loadOlder(); }, { root: listRef.current, threshold: 0 });
        obs.observe(top);
        return () => obs.disconnect();
    }, [query.hasNextPage, query.isFetchingNextPage, loadOlder, messages.length]);

    const toBottom = () => { const el = listRef.current; if (el) { el.scrollTop = el.scrollHeight; stick.current = true; setAway(false); } };

    return (
        <section aria-label="Messages" className={`${card} flex h-[62vh] min-h-[26rem] flex-col sm:h-[70vh] overflow-hidden`} data-testid="chat">
            <div ref={listRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto p-4" role="log" aria-live="off" aria-label="Conversation">
                {query.isLoading ? (
                    <div className="space-y-3" role="status" aria-label="Loading messages"><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /><Skeleton className="h-10 w-3/5" /></div>
                ) : query.isError && messages.length === 0 ? (
                    <ErrorState error={query.error} onRetry={() => query.refetch()} title="Could not load the messages" />
                ) : (
                    <>
                        <div ref={topRef} className="h-px" />
                        {query.hasNextPage && (
                            <div className="mb-3 flex justify-center">
                                <button type="button" className={btnSecondary} onClick={loadOlder} disabled={query.isFetchingNextPage}>
                                    {query.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Load older messages
                                </button>
                            </div>
                        )}
                        {messages.length === 0 ? (
                            <p className={`py-10 text-center text-sm ${muted}`} data-testid="no-messages">No messages yet. Say hello and agree on how you want to work together.</p>
                        ) : groups.map((g) => (
                            <div key={g.day} className="mb-4">
                                <p className={`mb-3 text-center text-xs font-medium ${muted}`}>{g.label}</p>
                                <ul className="space-y-3">
                                    {g.messages.map((m) => (
                                        <MessageBubble key={m._id} message={m} mine={m.sender._id === viewerId} zone={zone}
                                            onRetry={() => m.contentType !== 'file' && m.content && send.mutate({ content: m.content, contentType: m.contentType === 'code' ? 'code' : 'text', codeLanguage: m.codeLanguage ?? undefined, retryOf: m._id })}
                                            onDiscard={() => discard(m._id)}
                                            onReport={mentorship.viewer.canReport ? () => setReporting(m._id) : undefined} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                        {query.isError && messages.length > 0 && <p role="alert" className="text-center text-xs text-red-700 dark:text-red-400">Could not refresh. Showing what we have.</p>}
                    </>
                )}
            </div>
            <p className="sr-only" role="status" aria-live="polite" data-testid="chat-announcement">{announcement}</p>
            {away && (
                <div className="flex justify-center border-t border-gray-100 bg-white py-1 dark:border-neutral-800 dark:bg-neutral-900">
                    <button type="button" className={`${btnGhost} !py-1 text-xs`} onClick={toBottom}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /> New messages</button>
                </div>
            )}
            <Composer mentorship={mentorship} />
            <ReportDialog open={!!reporting} onOpenChange={(o) => !o && setReporting(null)} target="message" messageId={reporting ?? undefined} pending={report.isPending} error={report.error}
                onSubmit={(v) => report.mutate(v, { onSuccess: () => setReporting(null) })} />
        </section>
    );
}

import { CallbackStatus } from '@/components/auth/CallbackStatus';

export default function Loading() {
    return <CallbackStatus provider="GitHub" state="loading" signInHref="/auth" />;
}

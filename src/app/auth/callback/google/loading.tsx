import { CallbackStatus } from '@/components/auth/CallbackStatus';

export default function Loading() {
    return <CallbackStatus provider="Google" state="loading" signInHref="/auth" />;
}

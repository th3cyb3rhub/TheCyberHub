import { pageBg, pageWrap } from '@/components/events/styles';
import { GridSkeleton } from '@/components/ctf/ListStates';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className={pageWrap}><GridSkeleton /></div>
        </div>
    );
}

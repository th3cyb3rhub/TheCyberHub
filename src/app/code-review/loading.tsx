import { pageBg, pageWrap } from '@/components/events/styles';
import { GridSkeleton } from '@/components/code-review/ListStates';

export default function Loading() {
    return (
        <div className={pageBg}>
            <div className={pageWrap}><GridSkeleton /></div>
        </div>
    );
}

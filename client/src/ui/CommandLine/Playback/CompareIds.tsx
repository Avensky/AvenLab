interface Props {
    compare: {
        added: string[];
        removed: string[];
        common: string[];
    }
}
const CompareIds = ({ compare }: Props) => {
    return (
        <div className="mb-2 grid grid-cols-3 gap-2 text-xs ">
            <div className="border p-2">
                <div className="font-semibold mb-1 event-success">Added (B \\ A)</div>
                {compare.added.length ? (
                    <div className="flex flex-wrap gap-1">
                        {compare.added.map(id => <span key={id} className="px-1 py-0.5 bg-green-100 rounded">{id}</span>)}
                    </div>
                ) : <div className="opacity-60 event-info">None</div>}
            </div>
            <div className="border p-2">
                <div className="font-semibold mb-1 event-success">Removed (A \\ B)</div>
                {compare.removed.length ? (
                    <div className="flex flex-wrap gap-1">
                        {compare.removed.map(id => <span key={id} className="px-1 py-0.5 bg-red-100 rounded">{id}</span>)}
                    </div>
                ) : <div className="opacity-60 event-info">None</div>}
            </div>
            <div className="border p-2">
                <div className="font-semibold mb-1 event-success">Common</div>
                {compare.common.length ? (
                    <div className="flex flex-wrap gap-1">
                        {compare.common.map(id => <span key={id} className="px-1 py-0.5 bg-gray-100 rounded">{id}</span>)}
                    </div>
                ) : <div className="opacity-60 event-info">None</div>}
            </div>
        </div>
    );
}

export default CompareIds;

import ByteDiff from './ByteDiff';

interface Props {
    showPayloads: boolean;
    payloadChanges: PayloadChange[];

};

type PayloadChange = {
    id: string;
    changedBytes: number;
    a: string;
    b: string;
};

const ComparePayloads = ({ showPayloads, payloadChanges }: Props) => {
    return (
        <div>
            {showPayloads && payloadChanges.length > 0 && (
                <div className="mb-2 text-md border p-2">
                    <div className="font-semibold mb-1 event-success">Payload changes (latest per ID)</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {payloadChanges.map(({ id, changedBytes, a, b }) => (
                            <div
                                key={id}
                                // className="border p-2 rounded"
                                className="border px-2 rounded hover:bg-black/10"
                            // onClick={() => useStore.getState().setFilters({ ...useStore.getState().filters, hexId: id })}
                            >
                                <div className="font-mono text-sm mb-1 event-info">{id} · <span className='event-success'>Δbytes: {changedBytes}</span></div>
                                <ByteDiff a={a} b={b} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ComparePayloads;

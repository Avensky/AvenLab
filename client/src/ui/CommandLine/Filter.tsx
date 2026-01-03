import { useStore } from "../../store";
import { useEffect, useState } from "react";

export default function Filter() {
    const filters = useStore((s) => s.filters);
    const setFilterQuery = useStore((s) => s.setFilters);

    const [hexId, setHexId] = useState("");
    const [regex, setRegex] = useState("");
    const [byteIndex, setByteIndex] = useState<number | undefined>();
    const [byteValue, setByteValue] = useState("");
    const [getDeltas, setGetDeltas] = useState(useStore.getState().filters.getDeltas);
    const [minTime, setMinTime] = useState<number | undefined>(undefined);
    const [maxTime, setMaxTime] = useState<number | undefined>(undefined);
    const [sortBy, setSortBy] = useState<"id" | "dlc" | "time">("time");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    useEffect(() => {
        setFilterQuery({
            hexId,
            regex,
            byteIndex,
            byteValue,
            getDeltas,
            minTime,
            maxTime,
            sortBy,
            sortDirection,
        });
    }, [hexId, regex, byteIndex, byteValue, getDeltas, minTime, maxTime, sortBy, sortDirection]);

    return (
        <div className="text-sm flex flex-wrap items-center gap-1 px-1">
            <div className="flex items-center  gap-1">
                <span className="text-sm text-white">Id:</span>
                <input
                    className="w-14 px-1 border rounded bg-black text-white"
                    value={hexId}
                    onChange={e => setHexId(e.target.value)}
                    placeholder="0x123"
                />
            </div>
            <div className="flex items-center gap-1">
                <span className="text-lg text-white">🔍</span>
                <input
                    className="w-36 px-1 border rounded bg-black text-white"
                    value={regex}
                    onChange={e => setRegex(e.target.value)}
                    placeholder="Search"
                />
            </div>
            <div className="flex items-center">
                <span className="text-sm text-white">Byte</span>
                <span className="text-lg text-white">{`[`}</span>
                <input
                    className="w-5 px-1 border rounded bg-black text-white"
                    value={byteIndex ?? ""}
                    onChange={e => {
                        const val = parseInt(e.target.value);
                        setByteIndex(isNaN(val) ? undefined : val);
                    }}
                    placeholder="0"
                />
                <span className="text-lg text-white">{`]`}</span>
                <span className="text-lg text-white">:</span>
                <input
                    className="w-7 px-1 border rounded bg-black text-white"
                    value={byteValue}
                    // onChange={e => setByteValue(e.target.value)}
                    onChange={e => setByteValue(e.target.value.trim().toLowerCase())}
                    // onChange={e => {
                    //     let val = e.target.value.toLowerCase().replace(/[^0-9a-f]/g, '');
                    //     setByteValue(val.length === 1 ? '0' + val : val);
                    // }}
                    placeholder="00"
                />
            </div>

            {/* <div className="flex flex-col"> */}
            <div className="flex justify-end">
                <label className="flex justify-end text-white text-sm align-middle">
                    <input
                        type="checkbox"
                        className="mr-1"
                        checked={getDeltas}
                        onChange={e => setGetDeltas(e.target.checked)}
                    />
                    Deltas
                </label>
            </div>

            <div className="flex items-center align-middle gap-1">
                {/* <span className="text-xl text-white">SORT</span> */}
                <select
                    className="w-28 px-1 border rounded bg-black text-white"
                    value={`${filters.sortBy}-${filters.sortDirection}`}
                    onChange={(e) => {
                        const [newSortBy, newDirection] = e.target.value.split("-") as
                            ["id" | "dlc" | "time", "asc" | "desc"];

                        setSortBy(newSortBy);
                        setSortDirection(newDirection);

                        setFilterQuery({
                            ...filters,
                            sortBy: newSortBy,
                            sortDirection: newDirection,
                        });
                    }}
                >
                    <option value="time-asc">Time 🔼</option>
                    <option value="time-desc">Time 🔽</option>
                    <option value="id-asc">Hex ID 🔼</option>
                    <option value="id-desc">Hex ID 🔽</option>
                    <option value="dlc-asc">Length 🔼</option>
                    <option value="dlc-desc">Length 🔽</option>
                </select>
            </div>
            {/* </div> */}



            {/* <div className="flex flex-col gap-2"> */}
            <div className="flex justify-end gap-1">
                <span className="text-sm text-white">From</span>
                <input
                    className="w-20 px-1 border rounded bg-black text-white"
                    type="number"
                    value={minTime ?? ""}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        setMinTime(isNaN(val) ? undefined : val);
                    }}
                    placeholder="start"
                />
            </div>
            <div className="flex justify-end gap-1">
                <span className="text-sm text-white">To</span>
                <input
                    className="w-20 px-1 border rounded bg-black text-white"
                    type="number"
                    value={maxTime ?? ""}
                    onChange={e => {
                        const val = parseFloat(e.target.value);
                        setMaxTime(isNaN(val) ? undefined : val);
                    }}
                    placeholder="end"
                />
            </div>
            {/* </div> */}
        </div>
    );
}
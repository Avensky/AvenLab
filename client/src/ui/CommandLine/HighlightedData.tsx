import React from "react";
import { useStore } from "../../store";

interface HighlightProps {
    data: number[];
    hexId?: string;
}

export const HighlightedData: React.FC<HighlightProps> = ({ data, hexId }) => {

    // const prevData = playbackFrames[playbackIndex - 1]?.[8] || [];
    // const currData = playbackFrames[playbackIndex][8];
    // const changed = currData.map((b, i) => b !== prevData[i]);


    const filters = useStore(s => s.filters);
    // const { byteIndex, byteValue } = filters;
    // console.log('highlights data: ', data);
    const volatilityMap = useStore(s => s.byteVolatility);
    const volatility = hexId && volatilityMap[hexId] ? volatilityMap[hexId] : [];
    // const dataBytes = Array.isArray(data) ? data : data.match(/.{1,2}/g) || [];
    const dataBytes: string[] = Array.isArray(data)
        ? data.map(b => typeof b === 'number' ? b.toString(16).padStart(2, '0') : b)
        : [];
    // const maxVol = Math.max(...volatility, 1);
    const maxVol = Math.max(...(volatility.length ? volatility : [1]));

    return (
        <span className="font-mono">
            {dataBytes.map((byte, i) => {
                // Heatmap intensity
                const volScore = volatility[i] || 0;
                const intensity = Math.max(0.1, volScore / maxVol); // minimum 10% visible
                const bgColor = `rgba(255, 255, 255, ${intensity})`; // red intensity

                // Filter match (text color)
                const filterMatch =
                    typeof filters.byteIndex === "number" &&
                    filters.byteIndex === i &&
                    filters.byteValue &&
                    byte.toLowerCase() === filters.byteValue.toLowerCase();

                const textColor = filterMatch ? "yellow" : "#09f";

                return (
                    <span
                        key={i}
                        style={{
                            backgroundColor: bgColor,
                            color: textColor,
                            padding: "0 3px",
                            borderRadius: "4px",
                            display: "inline-block",
                            marginRight: "2px",
                        }}
                    >
                        {byte.toUpperCase()}
                    </span>
                );
            })}
        </span>
    );
};
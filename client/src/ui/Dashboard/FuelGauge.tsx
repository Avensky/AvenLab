import { useEffect, useRef } from "react";

interface FuelGaugeProps {
    fuel: number;      // CAN bus fuel value (e.g. 0 to 100)
    fuelCapacity: number; // Full tank value for scaling
    scale: number;      // px size
    engineOn: boolean
}

export default function FuelGauge({ fuel, fuelCapacity, scale, engineOn }: FuelGaugeProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(null);
    // Store a smooth interpolated needle value
    const needleValue = useRef(fuel);
    // const needleValue = useRef(0);

    // Cluster start/end points clockwise (- for counterclockwise)
    const size = 160; // cluster size in px
    const radius = size / 2;
    const startAngle = -Math.PI / 2;
    const endAngle = 0;

    // Mark labels
    const labelOffset = -24 // use (-) for inside cluster
    const labelColor = 'white '
    const fontSize = '1rem';
    const font = 'monospace';
    const fontWeight = 'bold'

    // Tick and Marks
    const tickColor = 'white'; // Tick color
    const tickCount = 4 // (maxNumber/tickCount = increments) ie. 160/8 = 20
    const tickLineWidth = 2;  // Tick mark thickness
    const tickLineLength = 14; // tick Width

    // const majorStep = maxNumber / tickCount;
    // const mediumStep = majorStep / 2;
    // const minorStep = mediumStep / 4;

    // Arc attributes
    // const backgroundOffset = 0;
    // const backgroundSize = radius + backgroundOffset
    // const backgroundColor = "rgba(0, 0, 0, 0.5)"
    const arcColor = 'white';
    const arcLineWidth = 2;   // Arc line thickness

    // Arc Offset
    // const smStartAngle = startAngle + 0.1; // expand ~5-10 deg
    // const background2Color = "white"
    // const smEndAngle = endAngle - 0.1;
    // const arcLine2Width = 40;   // Arc line thickness

    // Needle
    const needleLength = radius - 7;
    const baseWidth = needleLength * 0.1;   // 10% of length
    const backOffset = needleLength * 0.25;  // 30% behind center
    const needleColorGlow = 'rgba(255, 0, 0, .8)'
    const needleShadowBlur = 10
    const needleColor = 'rgba(139, 0, 0, 1)'

    // Center dot
    const centerDotSize = 14;
    const centerDotShadowBlur = 10
    const centerDotColorGlow = "rgba(255, 0, 0, 1)";
    const centerDotColor = 'rgba(0, 0, 0, 0.85)'; // 70% transparent

    // fuel image
    const fuelPump = new Image();
    fuelPump.src = '/images/gas-station.svg';

    useEffect(() => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;
        canvas.width = size;
        canvas.height = size;

        const centerX = size / 2;
        const centerY = size / 2;

        const drawGauge = () => {
            ctx.clearRect(0, 0, size, size);

            // Background circle
            // ctx.beginPath();
            // ctx.arc(centerX, centerY, backgroundSize, 0, 2 * Math.PI);
            // ctx.fillStyle = backgroundColor;
            // ctx.fill();

            // Arc outline
            ctx.beginPath();
            ctx.lineWidth = arcLineWidth;
            ctx.strokeStyle = arcColor;
            ctx.arc(centerX, centerY, radius - arcLineWidth / 2, startAngle, endAngle, false);
            ctx.stroke();

            // Tick marks
            ctx.fillStyle = labelColor;
            ctx.font = `${fontWeight} ${fontSize} ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            for (let i = 0; i <= tickCount; i++) {
                const ratio = i / tickCount;
                const angle = startAngle + ratio * (endAngle - startAngle);

                // ticks start position
                const x1 = centerX + (radius) * Math.cos(angle);
                const y1 = centerY + (radius) * Math.sin(angle);

                // ticks end position (ie length)
                const x2 = centerX + (radius - tickLineLength) * Math.cos(angle);
                const y2 = centerY + (radius - tickLineLength) * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = "white";
                ctx.strokeStyle = i >= 4 ? 'rgba(139, 0, 0, 1)' : tickColor;
                ctx.lineWidth = tickLineWidth;
                ctx.stroke();
            }

            // Labels
            ctx.fillStyle = "white";
            ctx.font = "bold 12px monospace";
            ctx.fillStyle = labelColor;
            ctx.font = `${fontWeight} ${fontSize} ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("F", centerX + (radius + labelOffset) * Math.cos(startAngle), centerY + (radius + labelOffset) * Math.sin(startAngle));
            ctx.fillText("E", centerX + (radius + labelOffset) * Math.cos(endAngle), centerY + (radius + labelOffset) * Math.sin(endAngle));

            fuelPump.onload = () => {
                drawGauge();
            };
            const pumpWidth = 12;
            const pumpHeight = 12;

            // Calculate position (same as your "Gas" text logic)
            const pumpX = centerX + (radius + labelOffset * 1.7) * Math.cos(endAngle) - pumpWidth / 2;
            const pumpY = centerY + (radius + labelOffset * 1.7) * Math.sin(startAngle) - pumpHeight / 2;

            ctx.drawImage(fuelPump, pumpX, pumpY, pumpWidth, pumpHeight);


            // Center dot
            ctx.save(); // ✅ isolate shadow settings
            ctx.shadowColor = centerDotColorGlow;  // soft red glow
            ctx.shadowBlur = centerDotShadowBlur;  // adjust for subtlety

            ctx.beginPath();
            ctx.arc(centerX, centerY, centerDotSize, 0, 2 * Math.PI);
            ctx.fillStyle = centerDotColor;
            ctx.fill();

            ctx.restore(); // ✅ back to normal drawing state


            // Needle
            const clampedFuel = Math.max(0, Math.min(needleValue.current, fuelCapacity));

            const fuelRatio = clampedFuel / fuelCapacity;
            // const needleAngle = startAngle + fuelRatio * (endAngle - startAngle);
            const needleAngle = startAngle + (1 - fuelRatio) * (endAngle - startAngle);

            // Needle
            // const valueRatio = Math.max(0, Math.min(value / maxNumber, 1));
            // const needleAngle = smStartAngle + valueRatio * (endAngle - smStartAngle);

            // Direction vector
            const dx = Math.cos(needleAngle);
            const dy = Math.sin(needleAngle);

            // Tip point
            const tipX = centerX + needleLength * dx;
            const tipY = centerY + needleLength * dy;

            // Base center point (back from pivot)
            const baseCenterX = centerX - backOffset * dx;
            const baseCenterY = centerY - backOffset * dy;

            // Perpendicular vector for base width
            const perpX = -dy;
            const perpY = dx;

            const baseLeftX = baseCenterX + (baseWidth / 2) * perpX;
            const baseLeftY = baseCenterY + (baseWidth / 2) * perpY;

            const baseRightX = baseCenterX - (baseWidth / 2) * perpX;
            const baseRightY = baseCenterY - (baseWidth / 2) * perpY;

            // Draw needle with glow
            ctx.save();  // ✅ Save state

            ctx.shadowColor = needleColorGlow; // dark red glow
            ctx.shadowBlur = needleShadowBlur; // adjust for subtlety

            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(baseLeftX, baseLeftY);
            ctx.lineTo(baseRightX, baseRightY);
            ctx.closePath();

            ctx.fillStyle = needleColor;
            ctx.fill();
            ctx.restore(); // ✅ Reset to no shadow

        };

        const animate = () => {
            const target = engineOn ? fuel : 0;
            needleValue.current += (target - needleValue.current) * 0.05; // smaller factor = smoother

            drawGauge();
            requestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => cancelAnimationFrame(requestRef.current!);
    }, [fuel, engineOn]);

    return <canvas
        ref={canvasRef}
        style={{
            // display: "block",
            width: `${scale}px`,
            height: `${scale}px`
        }} />;
}

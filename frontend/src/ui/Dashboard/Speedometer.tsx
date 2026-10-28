import { useEffect, useRef } from "react";
interface SpeedometerProps {
    speed: number
    scale: number
    maxSpeed: number
}
export default function Speedometer({ speed, scale, maxSpeed }: SpeedometerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(null);

    // Store a smooth interpolated needle value
    const needleValue = useRef(speed);

    // programatically resizeable cluster variables
    const size = 160; // cluster size in px
    const radius = 80; // radius end of needle

    // Cluster start/end points clockwise (- for counterclockwise)
    const startAngle = (-7 * Math.PI) / 4; // ~60 deg
    const endAngle = -Math.PI / 3; // ~315 deg

    // Mark labels
    const labelOffset = -28 // use (-) for inside cluster
    const labelColor = 'white'
    const fontSize = '.8rem';
    const font = 'monospace';

    // Tick and Marks
    const tickColor = '#fff'; // Tick color

    const tickCount = 8 // (maxSpeed/tickCount = increments) ie. 160/8 = 20
    const tickLineWidth = 3;  // Tick mark thickness
    const tickLineLength = 14; // tick Width

    const majorStep = maxSpeed / tickCount;
    const mediumStep = majorStep / 2;
    const minorStep = mediumStep / 2;

    // Arc attributes
    const backgroundOffset = 0;
    const backgroundSize = radius + backgroundOffset
    const backgroundColor = "rgba(0, 0, 0, 0.7)"
    const arcColor = 'rgba(0, 0, 0, 0.5)';
    const arcLineWidth = 5;   // Arc line thickness


    //Digital readout
    // const readoutFontSize = '1.4rem';
    // const readoutOffsetX = size / 4;
    // const readoutOffsetY = 2;

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
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, backgroundSize, 0, 2 * Math.PI);
            ctx.fillStyle = backgroundColor;
            ctx.fill();
            ctx.restore();

            // Arc background
            ctx.beginPath();
            ctx.lineWidth = arcLineWidth; // tick width
            ctx.strokeStyle = arcColor;
            ctx.arc(centerX, centerY, radius - arcLineWidth / 2, startAngle, endAngle, false);
            ctx.stroke();

            // Ticks and labels
            ctx.fillStyle = labelColor;
            ctx.font = `${fontSize} ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            for (let speedValue = 0; speedValue <= maxSpeed; speedValue += minorStep) {
                const ratio = speedValue / maxSpeed;
                const angle = startAngle + ratio * (endAngle - startAngle);

                let tickLength, lineWidth;

                if (speedValue % majorStep === 0) {
                    tickLength = tickLineLength;
                    lineWidth = tickLineWidth;
                } else if (speedValue % mediumStep === 0) {
                    tickLength = tickLineLength * .7;
                    lineWidth = tickLineWidth * .6;
                } else {
                    tickLength = tickLineLength * .4;
                    lineWidth = tickLineWidth * .3;
                }

                const tickX2 = centerX + radius * Math.cos(angle);
                const tickY2 = centerY + radius * Math.sin(angle);
                const tickX1 = centerX + (radius - tickLength) * Math.cos(angle);
                const tickY1 = centerY + (radius - tickLength) * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(tickX1, tickY1);
                ctx.lineTo(tickX2, tickY2);
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = tickColor;
                ctx.stroke();

                if (speedValue % majorStep === 0) {
                    const labelX = centerX + (radius + labelOffset) * Math.cos(angle);
                    const labelY = centerY + (radius + labelOffset) * Math.sin(angle);
                    ctx.fillText(speedValue.toFixed(0), labelX, labelY);
                }
            }

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
            const speedRatio = Math.max(0, Math.min(speed / maxSpeed, 1));
            const needleAngle = startAngle + speedRatio * (endAngle - startAngle);

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

            // Digital readout
            //     ctx.fillStyle = "#fff";
            //     ctx.font = `${readoutFontSize} ${font}`;
            //     ctx.fillText(`${speed.toFixed(0)}`, centerX + readoutOffsetX, centerY + readoutOffsetY);
        };

        // Smooth animation loop
        const animate = () => {
            needleValue.current += (speed - needleValue.current) * 0.1;
            drawGauge();
            requestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(requestRef.current!);
        };
    }, [speed]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                // display: "block",
                width: `${scale}px`,
                height: `${scale}px`,
            }}
        />
    );
}

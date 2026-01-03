import { useEffect, useRef } from "react";

interface RpmsProps {
    speed: number
    value: number
    gear: number
    scale: number
    engineOn: boolean
}

export default function Revolutions({ speed, value, gear, scale, engineOn }: RpmsProps) {

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(null);

    // Store a smooth interpolated needle value
    const needleValue = useRef(value);

    // programatically resizeable cluster variables
    const size = 160; // cluster size in px
    const radius = 80; // radius end of needle

    // Cluster start/end points clockwise (- for counterclockwise)
    const startAngle = (-4 * Math.PI) / 3; // ~60 deg
    const endAngle = 0; // ~315 deg

    // Mark labels
    const labelOffset = -24 // use (-) for inside cluster
    const labelColor = 'black '
    const fontSize = '1rem';
    const font = 'monospace';
    const fontWeight = 'bold'

    // Tick and Marks
    const tickColor = 'black'; // Tick color
    const maxNumber = 9 // get from backend
    const tickCount = 9 // (maxNumber/tickCount = increments) ie. 160/8 = 20
    const tickLineWidth = 3;  // Tick mark thickness
    const tickLineLength = 14; // tick Width

    const majorStep = maxNumber / tickCount;
    const mediumStep = majorStep / 2;
    const minorStep = mediumStep / 4;

    // Arc attributes
    const backgroundOffset = 0;
    const backgroundSize = radius + backgroundOffset
    const backgroundColor = "rgba(0, 0, 0, 0.7)"
    const arcColor = 'rgba(0, 0, 0, .8)';
    const arcLineWidth = 1;   // Arc line thickness

    // Arc Offset RPMS white arc
    const smStartAngle = startAngle + 0.1; // expand ~5-10 deg
    const background2Color = "white"
    const smEndAngle = endAngle - 0.1;
    const arcLine2Width = 40;   // Arc line thickness

    //Digital readout
    const readoutBackgroundColor = `${engineOn ? 'orange' : 'black'}`;
    const readoutFontSize = '1.4rem';
    const readoutFontColor = `${engineOn ? 'yellow' : 'black'}`
    const readoutFont = 'monospace'
    const readoutShadow = `${engineOn ? 'rgba(255, 165, 0, 0.8)' : 'black'}`

    // gear
    const readoutOffsetX = 8;
    const readoutOffsetY = size / 2.8;

    // speed
    const readout2OffsetX = size / 3.7;
    const readout2OffsetY = size / 6.5;

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
            // ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, backgroundSize, 0, 2 * Math.PI);
            ctx.fillStyle = backgroundColor;
            ctx.fill();
            // ctx.restore();

            // RPMs white background arc
            ctx.beginPath();
            ctx.lineWidth = arcLine2Width; // make it thicker for background coverage
            ctx.strokeStyle = background2Color; // or any color you want
            ctx.arc(centerX, centerY, radius - arcLine2Width / 2, startAngle, endAngle, false);
            ctx.stroke();


            // Arc outline
            ctx.beginPath();
            ctx.lineWidth = arcLineWidth; // tick width
            ctx.strokeStyle = arcColor;
            ctx.arc(centerX, centerY, radius - arcLineWidth / 2, smStartAngle, smEndAngle, false);
            ctx.stroke();


            // Ticks and labels
            ctx.fillStyle = labelColor;
            ctx.font = `${fontWeight} ${fontSize} ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            for (let value = 0; value <= maxNumber; value += minorStep) {
                const ratio = value / maxNumber;
                const angle = smStartAngle + ratio * (smEndAngle - smStartAngle);

                let tickLength, lineWidth;

                if (value % majorStep === 0) {
                    tickLength = tickLineLength;
                    lineWidth = tickLineWidth;
                } else if (value % mediumStep === 0) {
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
                // Use red for value >= 7.5, else black
                ctx.strokeStyle = value >= 7.5 ? 'rgba(139, 0, 0, 1)' : tickColor;
                ctx.stroke();

                if (value % majorStep === 0) {
                    // ctx.fillStyle = value >= 7.5 ? 'rgba(139, 0, 0, 1)' : labelColor;
                    const labelX = centerX + (radius + labelOffset) * Math.cos(angle);
                    const labelY = centerY + (radius + labelOffset) * Math.sin(angle);
                    ctx.fillText(value.toFixed(0), labelX, labelY);
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
            const valueRatio = Math.max(0, Math.min(value / maxNumber, 1));
            const needleAngle = smStartAngle + valueRatio * (endAngle - smStartAngle);

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

            // === GEAR DIGITAL BOX ===
            ctx.save();
            ctx.shadowColor = readoutShadow; // orange glow
            ctx.shadowBlur = 15;

            const gearText = `${gear.toFixed(0)}`;
            ctx.font = `${readoutFontSize} ${readoutFont}`;
            const gearMetrics = ctx.measureText(gearText);
            const padding = 43;

            const gearBoxWidth = gearMetrics.width + padding;
            const gearBoxHeight = parseInt(readoutFontSize) * 25;

            const gearBoxX = centerX + readoutOffsetX - gearBoxWidth / 2;
            const gearBoxY = centerY + readoutOffsetY - gearBoxHeight / 1.6;

            // Draw box
            ctx.fillStyle = readoutBackgroundColor;
            ctx.fillRect(gearBoxX, gearBoxY, gearBoxWidth, gearBoxHeight);

            // Draw text
            ctx.fillStyle = readoutFontColor;
            ctx.shadowBlur = 0; // no shadow on text itself
            ctx.fillText(gearText, centerX + readoutOffsetX, centerY + readoutOffsetY);

            ctx.restore();

            // Digital readout
            ctx.fillStyle = readoutFontColor;
            ctx.font = `${readoutFontSize} ${readoutFont}`;
            ctx.fillText(`${speed.toFixed(0)}`, centerX + readout2OffsetX, centerY + readout2OffsetY);

            // === SPEED DIGITAL BOX ===
            ctx.save();
            ctx.shadowColor = readoutShadow; // orange glow
            ctx.shadowBlur = 15;

            const speedText = `${speed.toFixed(0)}`;
            ctx.font = `${readoutFontSize} ${readoutFont}`;
            // const speedMetrics = ctx.measureText(speedText);

            const speedBoxWidth = padding * 1.05;
            const speedBoxHeight = parseInt(readoutFontSize) * 25;

            const speedBoxX = centerX + readout2OffsetX - speedBoxWidth / 2;
            const speedBoxY = centerY + readout2OffsetY - speedBoxHeight / 1.6;

            // Draw box
            ctx.fillStyle = readoutBackgroundColor;
            ctx.fillRect(speedBoxX, speedBoxY, speedBoxWidth, speedBoxHeight);

            // Draw text
            ctx.fillStyle = readoutFontColor;
            ctx.shadowBlur = 0;
            ctx.fillText(speedText, centerX + readout2OffsetX, centerY + readout2OffsetY);

            ctx.restore();

        };

        // Smooth animation loop
        const animate = () => {
            needleValue.current += (value - needleValue.current) * 0.1;
            drawGauge();
            requestRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(requestRef.current!);
        };
    }, [value, engineOn]);

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

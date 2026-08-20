import React, {
    useRef,
    useEffect,
    useState,
    useCallback,
    forwardRef,
    useImperativeHandle,
    KeyboardEvent
} from 'react';

interface PaperCanvasProps {
    paperBase64: string;

    activeTool: string | null;

    clearCount: number;

    showOverlay: boolean;

    markingMode: 'self' | 'ai';

    zoom: number;

    penColor: string;
    penSize: number;

    shapeColor: string;  // Add the new shape color prop
    shapeSize: number;   // Add the new shape size prop
    shapeType: 'rectangle' | 'ellipse' | 'line' | 'triangle';

    textColor: string;
    textSize: number;
    textFont: string;

    markingModeSetting: 'none' | 'right' | 'wrong';

    markSize: number; // New prop for mark size
    markThickness: number; // New prop for mark thickness

    onZoomChange?: (zoom: number) => void;

    isMaximized?: boolean;
}

export interface PaperCanvasHandle {
    clear: () => void;
    undo: () => void;
    redo: () => void;
    restart: () => void;
    captureCanvas: () => string | null; // Add method to capture canvas as data URL
    captureFullPaper: () => string | null; // Composite: original paper image + all annotations, at full resolution
}

interface Point {
    x: number;
    y: number;
}

interface DrawAction {
    type: 'pen' | 'text' | 'shape' | 'mark';
    points?: Point[];
    text?: string;
    color: string;
    size: number;
    startPoint?: Point;
    endPoint?: Point;
    shapeType?: 'rectangle' | 'ellipse' | 'line' | 'triangle';
    fontFamily?: string;
    markType?: 'right' | 'wrong';
    thickness?: number;
}

// Text input state for direct typing
interface TextInputState {
    isActive: boolean;
    text: string;
    position: Point;
    fontSize: number;
    fontFamily: string;
    color: string;
}

const PEN_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Ccircle cx='12' cy='12' r='6' fill='none' stroke='white' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='2' fill='red'/%3E%3C/svg%3E") 12 12, crosshair`;

const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect x='6' y='6' width='12' height='12' rx='2' fill='none' stroke='white' stroke-width='2'/%3E%3Crect x='9' y='9' width='6' height='6' rx='1' fill='%23ff4444'/%3E%3C/svg%3E") 12 12, crosshair`;

// Global state for text input handling
let isTextInputActive = false;
let pendingTextAction: DrawAction | null = null;

export const PaperCanvas = forwardRef<PaperCanvasHandle, PaperCanvasProps>(
    (props, ref) => {

        const {
            paperBase64,
            activeTool,
            clearCount,
            showOverlay,
            markingMode,
            zoom,
            penColor,
            penSize,
            shapeColor,  // Add the new shape color prop
            shapeSize,   // Add the new shape size prop
            shapeType,
            textColor,
            textSize,
            textFont,
            onZoomChange,
            isMaximized
        } = props;

        const containerRef = useRef<HTMLDivElement>(null);
        const imageRef = useRef<HTMLImageElement>(null);
        const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

        const isDrawing = useRef(false);
        const actionsRef = useRef<DrawAction[]>([]);
        const redoStackRef = useRef<DrawAction[]>([]);
        const isPanning = useRef(false);
        const panStart = useRef<Point | null>(null);
        const eraserPoints = useRef<Point[]>([]);

        const [containerWidth, setContainerWidth] = useState(0);
        const [wrapperTransform, setWrapperTransform] = useState(
            'translate3d(0px, 0px, 0) scale(1)'
        );

        const panX = useRef(0);
        const panY = useRef(0);

        // Ref for direct text input state
        const directTextInputRef = useRef<TextInputState>({
            isActive: false,
            text: '',
            position: { x: 0, y: 0 },
            fontSize: textSize,
            fontFamily: textFont,
            color: textColor
        });

        // Ref to track if we're currently listening for keyboard events
        const isListeningForText = useRef(false);

        // Ref to the active text keydown handler, so it can be removed if the tool changes mid-typing
        const textKeyDownHandlerRef = useRef<((e: any) => void) | null>(null);

        useImperativeHandle(ref, () => ({
            clear: () => {
                actionsRef.current = [];
                redoStackRef.current = [];
                redrawAll();
            },

            undo: () => {
                if (actionsRef.current.length === 0) return;

                const action = actionsRef.current.pop()!;
                redoStackRef.current.push(action);

                redrawAll();
            },

            redo: () => {
                if (redoStackRef.current.length === 0) return;

                const action = redoStackRef.current.pop()!;
                actionsRef.current.push(action);

                redrawAll();
            },

            restart: () => {
                while (actionsRef.current.length > 0) {
                    const a = actionsRef.current.shift()!;
                    redoStackRef.current.unshift(a);
                }

                redrawAll();
            },

            captureCanvas: () => {
                const canvas = overlayCanvasRef.current;

                if (!canvas) return null;

                return canvas.toDataURL();
            },

            captureFullPaper: () => {
                const img = imageRef.current;
                const overlay = overlayCanvasRef.current;

                if (!img || !overlay || !img.naturalWidth || !img.naturalHeight) return null;

                // Render at the image's true resolution for print/PDF quality,
                // not the (possibly zoomed/shrunk) on-screen display size.
                const fullCanvas = document.createElement('canvas');
                fullCanvas.width = img.naturalWidth;
                fullCanvas.height = img.naturalHeight;

                const ctx = fullCanvas.getContext('2d');
                if (!ctx) return null;

                // 1. Draw the original paper photo
                ctx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);

                // 2. Draw the annotation overlay on top, scaled from its display size
                //    up to the full natural resolution so marks line up correctly.
                if (overlay.width > 0 && overlay.height > 0) {
                    ctx.drawImage(overlay, 0, 0, overlay.width, overlay.height, 0, 0, fullCanvas.width, fullCanvas.height);
                }

                return fullCanvas.toDataURL('image/jpeg', 0.92);
            }
        }));

        useEffect(() => {
            if (clearCount > 0) {
                actionsRef.current = [];
                redoStackRef.current = [];
                redrawAll();
            }
        }, [clearCount]);

        useEffect(() => {
            const container = containerRef.current;

            if (!container) return;

            const updateWidth = () => {
                setContainerWidth(container.clientWidth);
            };

            updateWidth();

            const ro = new ResizeObserver(updateWidth);

            ro.observe(container);

            return () => ro.disconnect();
        }, []);

        const toNormalized = useCallback((point: Point): Point => {
            const canvas = overlayCanvasRef.current;

            if (!canvas || canvas.width === 0 || canvas.height === 0) {
                return { x: 0, y: 0 };
            }

            return {
                x: point.x / canvas.width,
                y: point.y / canvas.height
            };
        }, []);

        const fromNormalized = useCallback((point: Point): Point => {
            const canvas = overlayCanvasRef.current;

            if (!canvas) {
                return { x: 0, y: 0 };
            }

            return {
                x: point.x * canvas.width,
                y: point.y * canvas.height
            };
        }, []);

        // Normalize a pixel size (font size, mark size, thickness) relative to canvas width,
        // so it scales back to pixels correctly no matter how the canvas resizes.
        const toNormalizedSize = useCallback((size: number): number => {
            const canvas = overlayCanvasRef.current;

            if (!canvas || canvas.width === 0) return size;

            return size / canvas.width;
        }, []);

        const fromNormalizedSize = useCallback((normSize: number): number => {
            const canvas = overlayCanvasRef.current;

            if (!canvas) return normSize;

            return normSize * canvas.width;
        }, []);

        function redrawAll() {
            const canvas = overlayCanvasRef.current;

            if (!canvas) return;

            const ctx = canvas.getContext('2d');

            if (!ctx) return;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Only draw overlays if in self mode or if showOverlay is true and not in AI mode
            const shouldDrawOverlays = showOverlay && props.markingMode !== 'ai';

            if (shouldDrawOverlays) {
                for (const action of actionsRef.current) {

                    ctx.strokeStyle = action.color;
                    ctx.fillStyle = action.color;
                    ctx.lineWidth = action.size;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';

                    // PEN
                    if (
                        action.type === 'pen' &&
                        action.points &&
                        action.points.length > 1
                    ) {
                        const canvasPoints = action.points.map((p) =>
                            fromNormalized(p)
                        );

                        ctx.beginPath();

                        ctx.moveTo(
                            canvasPoints[0].x,
                            canvasPoints[0].y
                        );

                        // Use quadratic curves for smooth freehand drawing
                        for (let i = 1; i < canvasPoints.length; i++) {
                            if (i === 1) {
                                // For the first segment, draw a line
                                ctx.lineTo(
                                    canvasPoints[i].x,
                                    canvasPoints[i].y
                                );
                            } else {
                                // Calculate midpoint for smooth curve
                                const prevPoint = canvasPoints[i - 1];
                                const currentPoint = canvasPoints[i];
                                const midX = (prevPoint.x + currentPoint.x) / 2;
                                const midY = (prevPoint.y + currentPoint.y) / 2;
                                
                                ctx.quadraticCurveTo(
                                    prevPoint.x,
                                    prevPoint.y,
                                    midX,
                                    midY
                                );
                            }
                        }

                        ctx.stroke();
                    } else if (
                        action.type === 'pen' &&
                        action.points &&
                        action.points.length === 1
                    ) {
                        // Single click with no drag — draw a dot
                        const dotPoint = fromNormalized(action.points[0]);
                        ctx.beginPath();
                        ctx.arc(dotPoint.x, dotPoint.y, action.size / 2, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // SHAPES
                    else if (
                        action.type === 'shape' &&
                        action.startPoint &&
                        action.endPoint
                    ) {
                        const canvasStart = fromNormalized(action.startPoint);
                        const canvasEnd = fromNormalized(action.endPoint);
                        
                        const width = canvasEnd.x - canvasStart.x;
                        const height = canvasEnd.y - canvasStart.y;

                        ctx.strokeStyle = action.color;
                        ctx.fillStyle = action.color;
                        ctx.lineWidth = action.size;

                        switch (action.shapeType) {
                            case 'rectangle':
                                ctx.strokeRect(
                                    canvasStart.x,
                                    canvasStart.y,
                                    width,
                                    height
                                );
                                break;
                                
                            case 'ellipse':
                                ctx.beginPath();
                                // Create an ellipse using arcTo or bezier curves
                                const centerX = (canvasStart.x + canvasEnd.x) / 2;
                                const centerY = (canvasStart.y + canvasEnd.y) / 2;
                                const radiusX = Math.abs(width) / 2;
                                const radiusY = Math.abs(height) / 2;
                                
                                // Draw ellipse using bezier curves approximation
                                const kappa = 0.5522848;
                                const ox = radiusX * kappa; // control point offset horizontal
                                const oy = radiusY * kappa; // control point offset vertical
                                
                                ctx.moveTo(centerX, centerY - radiusY); // top center
                                ctx.bezierCurveTo(
                                    centerX + ox, centerY - radiusY, // top right corner
                                    centerX + radiusX, centerY - oy, // right top corner
                                    centerX + radiusX, centerY       // right center
                                );
                                ctx.bezierCurveTo(
                                    centerX + radiusX, centerY + oy, // right bottom corner
                                    centerX + ox, centerY + radiusY, // bottom right corner
                                    centerX, centerY + radiusY       // bottom center
                                );
                                ctx.bezierCurveTo(
                                    centerX - ox, centerY + radiusY, // bottom left corner
                                    centerX - radiusX, centerY + oy, // left bottom corner
                                    centerX - radiusX, centerY       // left center
                                );
                                ctx.bezierCurveTo(
                                    centerX - radiusX, centerY - oy, // left top corner
                                    centerX - ox, centerY - radiusY, // top left corner
                                    centerX, centerY - radiusY       // back to top center
                                );
                                ctx.closePath();
                                ctx.stroke();
                                break;
                                
                            case 'line':
                                ctx.beginPath();
                                ctx.moveTo(
                                    canvasStart.x,
                                    canvasStart.y
                                );
                                ctx.lineTo(
                                    canvasEnd.x,
                                    canvasEnd.y
                                );
                                ctx.stroke();
                                break;
                                
                            case 'triangle':
                                ctx.beginPath();
                                ctx.moveTo(
                                    canvasStart.x,
                                    canvasStart.y
                                );
                                ctx.lineTo(
                                    canvasEnd.x,
                                    canvasStart.y
                                );
                                ctx.lineTo(
                                    (canvasStart.x + canvasEnd.x) / 2,
                                    canvasEnd.y
                                );
                                ctx.closePath();
                                ctx.stroke();
                                break;
                        }
                    }

                    // TEXT
                    else if (
                        action.type === 'text' &&
                        action.text &&
                        action.startPoint
                    ) {
                        const canvasStart = fromNormalized(
                            action.startPoint
                        );

                        ctx.font = `${fromNormalizedSize(action.size)}px ${action.fontFamily || 'Arial'}`;
                        ctx.fillStyle = action.color;

                        ctx.fillText(
                            action.text,
                            canvasStart.x,
                            canvasStart.y
                        );
                    }

                    // MARKS
                    else if (
                        action.type === 'mark' &&
                        action.startPoint
                    ) {
                        const canvasStart = fromNormalized(action.startPoint);

                        const scaledSize = fromNormalizedSize(action.size || toNormalizedSize(props.markSize));
                        const scaledThickness = fromNormalizedSize(action.thickness || toNormalizedSize(props.markThickness)) || 2;

                        // Apply the calculated size and thickness
                        ctx.lineWidth = scaledThickness;
                        ctx.strokeStyle = action.color;
                        ctx.fillStyle = action.color;

                        // Draw the mark based on type
                        if (action.markType === 'right') {
                            // Draw a checkmark — short left arm (1/4 the length of the long right arm)
                            ctx.beginPath();
                            ctx.moveTo(canvasStart.x - scaledSize * 0.2129, canvasStart.y + scaledSize * 0.1808);
                            ctx.lineTo(canvasStart.x - scaledSize / 9, canvasStart.y + scaledSize / 3);
                            ctx.lineTo(canvasStart.x + scaledSize / 3, canvasStart.y - scaledSize / 4);
                            ctx.stroke();
                        } else if (action.markType === 'wrong') {
                            // Draw an X mark with increased size and thickness
                            ctx.beginPath();
                            ctx.moveTo(canvasStart.x - scaledSize / 4, canvasStart.y - scaledSize / 4);
                            ctx.lineTo(canvasStart.x + scaledSize / 4, canvasStart.y + scaledSize / 4);
                            ctx.moveTo(canvasStart.x + scaledSize / 4, canvasStart.y - scaledSize / 4);
                            ctx.lineTo(canvasStart.x - scaledSize / 4, canvasStart.y + scaledSize / 4);
                            ctx.stroke();
                        }
                    }
                }
            }

            // Draw direct text input if active
            if (directTextInputRef.current.isActive && directTextInputRef.current.text) {
                const { position, text, fontSize, fontFamily, color } = directTextInputRef.current;

                ctx.font = `${fontSize}px ${fontFamily || 'Arial'}`;
                ctx.fillStyle = color;

                ctx.fillText(
                    text,
                    position.x,
                    position.y
                );

                // Draw a blinking cursor
                const textMetrics = ctx.measureText(text);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(position.x + textMetrics.width, position.y - fontSize);
                ctx.lineTo(position.x + textMetrics.width, position.y + 5);
                ctx.stroke();
            }
        }
        
        // Helper function to determine if two line segments intersect
        function doLinesIntersect(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
            // Calculate the direction of the line segments
            const ccw1 = (x4 - x3) * (y1 - y3) - (x1 - x3) * (y4 - y3);
            const ccw2 = (x4 - x3) * (y2 - y3) - (x2 - x3) * (y4 - y3);
            const ccw3 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
            const ccw4 = (x2 - x1) * (y4 - y1) - (x4 - x1) * (y2 - y1);
            
            // If the signs of the cross products are different for both pairs, the lines intersect
            return ((ccw1 > 0) !== (ccw2 > 0)) && ((ccw3 > 0) !== (ccw4 > 0));
        }

        function resizeCanvas() {
            const img = imageRef.current;
            const canvas = overlayCanvasRef.current;

            if (!img || !canvas) return;

            const w = img.offsetWidth;
            const h = img.offsetHeight;

            if (w > 0 && h > 0) {
                canvas.width = w;
                canvas.height = h;

                redrawAll();
            }
        }

        const handleImageLoad = () => {
            resizeCanvas();
        };

        useEffect(() => {
            let resizeTimeout: NodeJS.Timeout;

            const handleResize = () => {
                clearTimeout(resizeTimeout);

                resizeTimeout = setTimeout(() => {
                    resizeCanvas();
                }, 150);
            };

            window.addEventListener('resize', handleResize);

            return () => {
                clearTimeout(resizeTimeout);

                window.removeEventListener(
                    'resize',
                    handleResize
                );
            };
        }, []);

        useEffect(() => {
            const id = setTimeout(() => {

                resizeCanvas();

                setWrapperTransform(
                    `translate3d(${panX.current}px, ${panY.current}px, 0) scale(${zoom})`
                );

            }, 50);

            return () => clearTimeout(id);

        }, [zoom]);

        useEffect(() => {
            const id = setTimeout(() => {
                resizeCanvas();
            }, 50);

            return () => clearTimeout(id);
        }, [isMaximized]);

        useEffect(() => {
            const canvas = overlayCanvasRef.current;

            if (!canvas || !onZoomChange) return;

            const handler = (e: WheelEvent) => {
                e.preventDefault();

                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                const newZoom = Math.max(0.1, Math.min(5, zoom + delta));

                onZoomChange(newZoom);
            };

            canvas.addEventListener('wheel', handler, { passive: false });

            return () => {
                canvas.removeEventListener('wheel', handler);
            };
        }, [zoom, onZoomChange]);

        const isOverlayEnabled = showOverlay && props.markingMode !== 'ai';

        const getCanvasPos = useCallback(
            (clientX: number, clientY: number): Point => {

                const canvas = overlayCanvasRef.current;

                if (!canvas) {
                    return { x: 0, y: 0 };
                }

                const rect = canvas.getBoundingClientRect();

                return {
                    x: clientX - rect.left,
                    y: clientY - rect.top
                };
            },
            []
        );

        function findActionsIntersectingLine(
            p1: Point,
            p2: Point,
            threshold: number
        ): number[] {

            const actions = actionsRef.current;

            const canvas = overlayCanvasRef.current;

            if (!canvas) return [];

            const found: number[] = [];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;

            const len = Math.sqrt(dx * dx + dy * dy);

            const steps = Math.max(
                Math.ceil(len / 2),
                1
            );

            for (
                let i = actions.length - 1;
                i >= 0;
                i--
            ) {

                if (found.includes(i)) continue;

                const action = actions[i];

                for (let s = 0; s <= steps; s++) {

                    const t = s / steps;

                    const px = p1.x + dx * t;
                    const py = p1.y + dy * t;

                    const normPx = px / canvas.width;
                    const normPy = py / canvas.height;

                    const normThreshold =
                        threshold / canvas.width;

                    // Check PEN type
                    if (
                        action.type === 'pen' &&
                        action.points
                    ) {
                        for (const ap of action.points) {

                            const dist = Math.sqrt(
                                (ap.x - normPx) ** 2 +
                                (ap.y - normPy) ** 2
                            );

                            if (dist < normThreshold) {
                                found.push(i);
                                break;
                            }
                        }
                    }
                    // Check SHAPE type
                    else if (
                        action.type === 'shape' &&
                        action.startPoint &&
                        action.endPoint
                    ) {
                        const canvasStart = fromNormalized(action.startPoint);
                        const canvasEnd = fromNormalized(action.endPoint);
                        
                        // Calculate distance to the shape boundary
                        let minDist = Infinity;
                        
                        switch (action.shapeType) {
                            case 'rectangle':
                                // Check distance to rectangle edges
                                const rectX = canvasStart.x;
                                const rectY = canvasStart.y;
                                const rectW = canvasEnd.x - canvasStart.x;
                                const rectH = canvasEnd.y - canvasStart.y;
                                
                                // Distance to top edge
                                const distTop = Math.abs(py - rectY);
                                // Distance to bottom edge
                                const distBottom = Math.abs(py - (rectY + rectH));
                                // Distance to left edge
                                const distLeft = Math.abs(px - rectX);
                                // Distance to right edge
                                const distRight = Math.abs(px - (rectX + rectW));
                                
                                minDist = Math.min(distTop, distBottom, distLeft, distRight);
                                break;
                                
                            case 'ellipse':
                                // For ellipse, check if point is near the ellipse boundary
                                const centerX = (canvasStart.x + canvasEnd.x) / 2;
                                const centerY = (canvasStart.y + canvasEnd.y) / 2;
                                const radiusX = Math.abs(canvasEnd.x - canvasStart.x) / 2;
                                const radiusY = Math.abs(canvasEnd.y - canvasStart.y) / 2;
                                
                                // Calculate normalized distance from point to ellipse
                                const normalizedDist = Math.abs(
                                    Math.sqrt(
                                        Math.pow((px - centerX) / radiusX, 2) + 
                                        Math.pow((py - centerY) / radiusY, 2)
                                    ) - 1
                                );
                                minDist = normalizedDist;
                                break;
                                
                            case 'line':
                                // Calculate distance from point to line segment
                                const A = px - canvasStart.x;
                                const B = py - canvasStart.y;
                                const C = canvasEnd.x - canvasStart.x;
                                const D = canvasEnd.y - canvasStart.y;

                                const dot = A * C + B * D;
                                const lenSq = C * C + D * D;
                                let param = -1;
                                if (lenSq !== 0) param = dot / lenSq;

                                let xx, yy;

                                if (param < 0) {
                                    xx = canvasStart.x;
                                    yy = canvasStart.y;
                                } else if (param > 1) {
                                    xx = canvasEnd.x;
                                    yy = canvasEnd.y;
                                } else {
                                    xx = canvasStart.x + param * C;
                                    yy = canvasStart.y + param * D;
                                }

                                const dx = px - xx;
                                const dy = py - yy;
                                minDist = Math.sqrt(dx * dx + dy * dy);
                                break;
                                
                            case 'triangle':
                                // For triangle, calculate distance to the three sides
                                const triX1 = canvasStart.x;
                                const triY1 = canvasStart.y;
                                const triX2 = canvasEnd.x;
                                const triY2 = canvasStart.y;
                                const triX3 = (canvasStart.x + canvasEnd.x) / 2;
                                const triY3 = canvasEnd.y;
                                
                                // Calculate distances to each side
                                const distSide1 = pointToLineDistance(px, py, triX1, triY1, triX2, triY2);
                                const distSide2 = pointToLineDistance(px, py, triX2, triY2, triX3, triY3);
                                const distSide3 = pointToLineDistance(px, py, triX3, triY3, triX1, triY1);
                                
                                minDist = Math.min(distSide1, distSide2, distSide3);
                                break;
                        }
                        
                        if (minDist < threshold) {
                            found.push(i);
                            break;
                        }
                    }
                    // Check TEXT type - check if point is inside text bounding box
                    else if (
                        action.type === 'text' &&
                        action.text &&
                        action.startPoint
                    ) {
                        const canvasStart = fromNormalized(action.startPoint);
                        
                        // Approximate text bounds (this is a simplification)
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            const actualFontSize = fromNormalizedSize(action.size);
                            ctx.font = `${actualFontSize}px ${action.fontFamily || 'Arial'}`;
                            const textWidth = ctx.measureText(action.text).width;
                            
                            // Check if point is within text bounds (with some padding)
                            if (px >= canvasStart.x && px <= canvasStart.x + textWidth &&
                                py >= canvasStart.y - actualFontSize && py <= canvasStart.y) {
                                found.push(i);
                                break;
                            }
                        }
                    }
                    // Check MARK type
                    else if (
                        action.type === 'mark' &&
                        action.startPoint
                    ) {
                        const canvasStart = fromNormalized(action.startPoint);
                        
                        // Check distance to mark position
                        const dist = Math.sqrt(
                            Math.pow(canvasStart.x - px, 2) +
                            Math.pow(canvasStart.y - py, 2)
                        );
                        
                        if (dist < threshold) {
                            found.push(i);
                            break;
                        }
                    }
                }
            }

            return found;
        }
        
        // Helper function to calculate distance from point to line segment
        function pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
            const A = px - x1;
            const B = py - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;

            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = px - xx;
            const dy = py - yy;
            return Math.sqrt(dx * dx + dy * dy);
        }
        
        const handleMouseDown = (
            e: React.MouseEvent<HTMLCanvasElement>
        ) => {

            // Don't allow drawing in AI mode or when overlays are hidden
            if (!showOverlay || props.markingMode === 'ai') return;

            const canvasPos = getCanvasPos(
                e.clientX,
                e.clientY
            );

            // PAN - Allow panning regardless of tool if middle-click or Alt/Ctrl key is pressed
            if (e.button === 1 || e.altKey || e.ctrlKey || e.metaKey || activeTool === 'pan') {
                isPanning.current = true;
                panStart.current = { x: e.clientX, y: e.clientY };
                return;
            }

            if (!activeTool) return;


            // CLEAR - Single click to remove nearby overlays
            if (activeTool === 'clear') {
                // Find all actions near the click point
                const canvas = overlayCanvasRef.current;
                if (!canvas) return;
                
                const normPos = toNormalized(canvasPos);
                const normThreshold = 20 / canvas.width; // Threshold for clicking
                
                const actions = actionsRef.current;
                let clickedActionIndex = -1;
                
                // Iterate backwards to find the topmost item first
                for (let i = actions.length - 1; i >= 0; i--) {
                    const action = actions[i];
                    
                    if (action.type === 'pen' && action.points) {
                        for (const point of action.points) {
                            const dist = Math.sqrt(
                                (point.x - normPos.x) ** 2 + 
                                (point.y - normPos.y) ** 2
                            );
                            
                            if (dist < normThreshold) {
                                clickedActionIndex = i;
                                break;
                            }
                        }
                    } 
                    else if (action.type === 'shape' && action.startPoint) {
                        const canvasStart = fromNormalized(action.startPoint);
                        const canvasEnd = fromNormalized(action.endPoint || action.startPoint);
                        
                        // Check if click is within shape bounds
                        const shapeLeft = Math.min(canvasStart.x, canvasEnd.x);
                        const shapeRight = Math.max(canvasStart.x, canvasEnd.x);
                        const shapeTop = Math.min(canvasStart.y, canvasEnd.y);
                        const shapeBottom = Math.max(canvasStart.y, canvasEnd.y);
                        
                        if (canvasPos.x >= shapeLeft && canvasPos.x <= shapeRight &&
                            canvasPos.y >= shapeTop && canvasPos.y <= shapeBottom) {
                            clickedActionIndex = i;
                            break;
                        }
                    } 
                    else if (action.type === 'text' && action.startPoint) {
                        const canvasStart = fromNormalized(action.startPoint);
                        const dist = Math.sqrt(
                            (canvasStart.x - canvasPos.x) ** 2 + 
                            (canvasStart.y - canvasPos.y) ** 2
                        );
                        
                        if (dist < 30) { // Larger threshold for text
                            clickedActionIndex = i;
                            break;
                        }
                    } 
                    else if (action.type === 'mark' && action.startPoint) {
                        const canvasStart = fromNormalized(action.startPoint);
                        const dist = Math.sqrt(
                            (canvasStart.x - canvasPos.x) ** 2 + 
                            (canvasStart.y - canvasPos.y) ** 2
                        );
                        
                        if (dist < 30) { // Larger threshold for marks
                            clickedActionIndex = i;
                            break;
                        }
                    }
                    
                    if (clickedActionIndex !== -1) break;
                }
                
                // If we found an action near the click, remove it
                if (clickedActionIndex !== -1) {
                    const removed = actionsRef.current.splice(clickedActionIndex, 1)[0];
                    redoStackRef.current.push(removed);
                    redrawAll();
                    return;
                }
                
                // Otherwise, initialize eraser points for drag-to-clear
                isDrawing.current = true;
                eraserPoints.current = [canvasPos]; // Initialize with current position
                return;
            }

            // PEN
            if (activeTool === 'pen') {

                isDrawing.current = true;

                const normPos =
                    toNormalized(canvasPos);

                const newAction: DrawAction = {
                    type: 'pen',
                    points: [normPos],
                    color: penColor,
                    size: penSize
                };

                actionsRef.current.push(newAction);

                redoStackRef.current = [];

                return;
            }

            // TEXT - Direct typing on canvas
            if (activeTool === 'text') {
                // Commit any text already being typed before starting a new one,
                // so clicking a new spot creates another overlay instead of losing the first
                if (directTextInputRef.current.isActive && directTextInputRef.current.text.trim()) {
                    const committedAction: DrawAction = {
                        type: 'text',
                        text: directTextInputRef.current.text,
                        startPoint: toNormalized(directTextInputRef.current.position),
                        color: directTextInputRef.current.color,
                        size: toNormalizedSize(directTextInputRef.current.fontSize),
                        fontFamily: directTextInputRef.current.fontFamily
                    };

                    actionsRef.current.push(committedAction);
                    redoStackRef.current = [];
                }

                // Store the position where text should be placed
                const normPos = toNormalized(canvasPos);

                // Set up direct text input state
                directTextInputRef.current = {
                    isActive: true,
                    text: '',
                    position: canvasPos, // Store canvas position for rendering
                    fontSize: textSize,
                    fontFamily: textFont,
                    color: textColor
                };

                // Start listening for keyboard events
                if (!isListeningForText.current) {
                    isListeningForText.current = true;

                    const handleKeyDown = (e: KeyboardEvent) => {
                        if (!directTextInputRef.current.isActive) return;

                        if (e.key === 'Enter') {
                            // Finalize text input
                            if (directTextInputRef.current.text.trim()) {
                                // Add the text to the actions
                                const newAction: DrawAction = {
                                    type: 'text',
                                    text: directTextInputRef.current.text,
                                    startPoint: toNormalized(directTextInputRef.current.position),
                                    color: directTextInputRef.current.color,
                                    size: toNormalizedSize(directTextInputRef.current.fontSize),
                                    fontFamily: directTextInputRef.current.fontFamily
                                };

                                actionsRef.current.push(newAction);
                                redoStackRef.current = [];
                                redrawAll();
                            }

                            // Reset direct text input
                            directTextInputRef.current.isActive = false;
                            isListeningForText.current = false;
                            document.removeEventListener('keydown', handleKeyDown as any);
                            textKeyDownHandlerRef.current = null;
                        } else if (e.key === 'Escape') {
                            // Cancel text input
                            directTextInputRef.current.isActive = false;
                            isListeningForText.current = false;
                            document.removeEventListener('keydown', handleKeyDown as any);
                            textKeyDownHandlerRef.current = null;
                        } else if (e.key === 'Backspace') {
                            // Handle backspace
                            e.preventDefault(); // Prevent browser back navigation
                            directTextInputRef.current.text = directTextInputRef.current.text.slice(0, -1);
                            redrawAll(); // Redraw to show updated text
                        } else if (e.key.length === 1) {
                            // Add character
                            directTextInputRef.current.text += e.key;
                            redrawAll(); // Redraw to show updated text
                        }
                    };

                    textKeyDownHandlerRef.current = handleKeyDown as any;
                    document.addEventListener('keydown', handleKeyDown as any);
                }

                return;
            }

            // SHAPE
            if (activeTool === 'shape') {
                isDrawing.current = true;

                const normPos = toNormalized(canvasPos);

                const newAction: DrawAction = {
                    type: 'shape',
                    startPoint: normPos,
                    endPoint: normPos,
                    color: shapeColor,  // Use dedicated shape color
                    size: shapeSize,    // Use dedicated shape size
                    shapeType
                };

                actionsRef.current.push(newAction);

                redoStackRef.current = [];

                return;
            }


            // MARK-RIGHT (Right mark)
            else if (activeTool === 'mark-right') {
                isDrawing.current = true;

                const normPos = toNormalized(canvasPos);

                const newAction: DrawAction = {
                    type: 'mark',
                    startPoint: normPos,
                    color: '#10b981', // green-500
                    size: toNormalizedSize(props.markSize),
                    thickness: toNormalizedSize(props.markThickness),
                    markType: 'right'
                };

                actionsRef.current.push(newAction);

                redoStackRef.current = [];

                redrawAll();

                return;
            }

            // MARK-WRONG (Wrong mark)
            else if (activeTool === 'mark-wrong') {
                isDrawing.current = true;

                const normPos = toNormalized(canvasPos);

                const newAction: DrawAction = {
                    type: 'mark',
                    startPoint: normPos,
                    color: '#ef4444', // red-500
                    size: toNormalizedSize(props.markSize),
                    thickness: toNormalizedSize(props.markThickness),
                    markType: 'wrong'
                };

                actionsRef.current.push(newAction);

                redoStackRef.current = [];

                redrawAll();

                return;
            }
        };

        const handleMouseMove = (
            e: React.MouseEvent<HTMLCanvasElement>
        ) => {

            // PAN - allow panning regardless of tool if middle-click or Alt/Ctrl key is pressed, or if pan tool is selected
            if (isPanning.current) {
                const dx = e.clientX - (panStart.current?.x ?? e.clientX);
                const dy = e.clientY - (panStart.current?.y ?? e.clientY);

                panX.current += dx;
                panY.current += dy;

                panStart.current = { x: e.clientX, y: e.clientY }; // Update pan start position

                setWrapperTransform(
                    `translate3d(${panX.current}px, ${panY.current}px, 0) scale(${zoom})`
                );

                return;
            }

            if (
                !isDrawing.current ||
                !showOverlay ||
                props.markingMode === 'ai'
            ) {
                return;
            }

            const canvasPos = getCanvasPos(
                e.clientX,
                e.clientY
            );

            // PEN
            if (activeTool === 'pen') {

                const lastAction =
                    actionsRef.current[
                    actionsRef.current.length - 1
                    ];

                if (
                    lastAction &&
                    lastAction.points
                ) {

                    const normPos =
                        toNormalized(canvasPos);

                    lastAction.points.push(normPos);

                    redrawAll();
                }
            }

            // SHAPE
            else if (activeTool === 'shape') {
                const lastAction = actionsRef.current[actionsRef.current.length - 1];

                if (lastAction && lastAction.type === 'shape') {
                    const normPos = toNormalized(canvasPos);
                    lastAction.endPoint = normPos;

                    // Redraw only if canvas context is available to avoid unnecessary calls
                    const canvas = overlayCanvasRef.current;
                    const ctx = canvas?.getContext('2d');

                    if (ctx) {
                        redrawAll();
                    }
                }
            }

            // CLEAR - improved erasing functionality
            else if (
                activeTool === 'clear' &&
                eraserPoints.current.length > 0
            ) {

                const lastEraserPos =
                    eraserPoints.current[
                    eraserPoints.current.length - 1
                    ];

                const toRemove =
                    findActionsIntersectingLine(
                        lastEraserPos,
                        canvasPos,
                        20 // Increased threshold for better erasing
                    );

                if (toRemove.length > 0) {

                    toRemove.sort((a, b) => b - a);

                    const removed: DrawAction[] = [];

                    for (const idx of toRemove) {
                        removed.push(
                            actionsRef.current.splice(
                                idx,
                                1
                            )[0]
                        );
                    }

                    for (const r of removed.reverse()) {
                        redoStackRef.current.push(r);
                    }

                    redrawAll();
                }

                eraserPoints.current.push(canvasPos);
            }
        };

        const handleMouseUp = () => {

            isDrawing.current = false;

            isPanning.current = false;

            panStart.current = null;

            eraserPoints.current = [];
        };

        // Commit any pending direct text input if the user switches away from the text tool,
        // instead of silently discarding what they typed
        useEffect(() => {
            if (activeTool !== 'text' && isListeningForText.current) {
                if (directTextInputRef.current.isActive && directTextInputRef.current.text.trim()) {
                    const committedAction: DrawAction = {
                        type: 'text',
                        text: directTextInputRef.current.text,
                        startPoint: toNormalized(directTextInputRef.current.position),
                        color: directTextInputRef.current.color,
                        size: toNormalizedSize(directTextInputRef.current.fontSize),
                        fontFamily: directTextInputRef.current.fontFamily
                    };

                    actionsRef.current.push(committedAction);
                    redoStackRef.current = [];
                }

                directTextInputRef.current.isActive = false;
                isListeningForText.current = false;

                if (textKeyDownHandlerRef.current) {
                    document.removeEventListener('keydown', textKeyDownHandlerRef.current);
                    textKeyDownHandlerRef.current = null;
                }

                redrawAll();
            }
        }, [activeTool]);

        // Handle text input submission

        const wrapperWidth =
            containerWidth > 0
                ? containerWidth
                : '100%';

        const cursor =
            activeTool === 'pan'
                ? 'grab'
                : activeTool === 'text'
                    ? 'text'
                    : 'crosshair';

        const customCursor =
            activeTool === 'pen'
                ? PEN_CURSOR
                : activeTool === 'clear'
                    ? ERASER_CURSOR
                    : undefined;

        return (
            <div
                ref={containerRef}
                className="relative w-full h-full overflow-hidden bg-gray-900/30 rounded-xl"
                style={{
                    cursor: customCursor || cursor
                }}
            >
                <div
                    style={{
                        width: wrapperWidth,
                        transform: wrapperTransform,
                        willChange: 'transform',
                        transformOrigin: '0 0'
                    }}
                >
                    <img
                        ref={imageRef}
                        src={paperBase64}
                        alt="Student Paper"
                        className="w-full h-auto block"
                        onLoad={handleImageLoad}
                        draggable={false}
                    />

                    <canvas
                        ref={overlayCanvasRef}
                        className={`absolute top-0 left-0 ${isOverlayEnabled ? 'z-10' : 'z-0 pointer-events-none opacity-0'}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </div>
            </div>
        );
    }
);

PaperCanvas.displayName = 'PaperCanvas';

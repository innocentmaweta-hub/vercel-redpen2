import { useState, useRef, useEffect } from 'react';

export function useCanvasTools(markingMode: 'self' | 'ai') {
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [showToolOptions, setShowToolOptions] = useState(false);

    const [penColor, setPenColor] = useState('#FF0000');
    const [penSize, setPenSize] = useState(3);
    const [shapeColor, setShapeColor] = useState('#FF0000');
    const [shapeSize, setShapeSize] = useState(2);
    const [shapeType, setShapeType] =
        useState<'rectangle' | 'ellipse' | 'line' | 'triangle'>('rectangle');
    const [textColor, setTextColor] = useState('#FF0000');
    const [textSize, setTextSize] = useState(16);
    const [textFont, setTextFont] = useState('Arial');
    const [markingModeSetting, setMarkingModeSetting] =
        useState<'none' | 'right' | 'wrong'>('none');
    const [markSize, setMarkSize] = useState(28);
    const [markThickness, setMarkThickness] = useState(2);

    const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-hide tool options bar. AI mode never shows this bar.
    useEffect(() => {
        if (
            markingMode !== 'self' ||
            !showToolOptions ||
            !activeTool ||
            !(
                activeTool === 'mark' ||
                activeTool === 'mark-right' ||
                activeTool === 'mark-wrong'
            )
        ) {
            return;
        }

        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
        }

        autoHideTimerRef.current = setTimeout(() => {
            setShowToolOptions(false);
        }, 6000);

        return () => {
            if (autoHideTimerRef.current) {
                clearTimeout(autoHideTimerRef.current);
            }
        };
    }, [showToolOptions, activeTool, markingMode]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoHideTimerRef.current) {
                clearTimeout(autoHideTimerRef.current);
            }
        };
    }, []);

    const handleToolOptionInteraction = () => {
        // Never allow tool options in AI mode.
        if (markingMode !== 'self') {
            return;
        }

        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
        }

        if (
            !showToolOptions &&
            (
                activeTool === 'mark' ||
                activeTool === 'mark-right' ||
                activeTool === 'mark-wrong'
            )
        ) {
            setShowToolOptions(true);
        }

        autoHideTimerRef.current = setTimeout(() => {
            setShowToolOptions(false);
        }, 6000);
    };

    // Reset everything — used by handleNew / handleNewPaper / etc.
    const resetTools = () => {
        setActiveTool(null);
        setShowToolOptions(false);

        if (autoHideTimerRef.current) {
            clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = null;
        }
    };

    return {
        activeTool, setActiveTool,
        showToolOptions, setShowToolOptions,
        penColor, setPenColor,
        penSize, setPenSize,
        shapeColor, setShapeColor,
        shapeSize, setShapeSize,
        shapeType, setShapeType,
        textColor, setTextColor,
        textSize, setTextSize,
        textFont, setTextFont,
        markingModeSetting, setMarkingModeSetting,
        markSize, setMarkSize,
        markThickness, setMarkThickness,
        autoHideTimerRef,
        handleToolOptionInteraction,
        resetTools,
    };
}

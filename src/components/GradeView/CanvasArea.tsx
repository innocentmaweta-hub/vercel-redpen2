import React, { forwardRef } from 'react';

export const CanvasArea = forwardRef(function CanvasArea(props: any, ref: any) {
  const { grading } = props;
  return (
    <div ref={ref} className="canvas-area">
      {/* Minimal canvas wrapper placeholder - the real PaperCanvas component is used elsewhere */}
    </div>
  );
});

export default CanvasArea;

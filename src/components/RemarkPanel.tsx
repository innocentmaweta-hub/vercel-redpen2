import React from 'react';
import { ResultsFilesPage } from './ResultsFilesPage';

/**
 * Compatibility wrapper.
 *
 * App.tsx still routes the former "remark" view here. The sidebar now labels
 * that view "Results", so existing App wiring does not need a risky rewrite.
 */
interface Props {
    remarks?: string;
    onChange?: (val: string) => void;
    onSave?: () => void;
    studentName?: string;
}

export const RemarkPanel = (_props: Props) => {
    return <ResultsFilesPage />;
};

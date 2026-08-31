/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useAppState } from './hooks/useAppState';
import { AppLayout } from './components/AppLayout';

export default function App() {
    const app = useAppState();
    return <AppLayout app={app} />;
}

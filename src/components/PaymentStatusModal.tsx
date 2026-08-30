interface PaymentStatusModalProps {
    message: string;
    onClose: () => void;
}

export function PaymentStatusModal({ message, onClose }: PaymentStatusModalProps) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-card rounded-3xl border border-gray-800 shadow-xl w-full max-w-sm">
                <div className="p-6 border-b border-gray-800 bg-sidebar/50">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">
                        Payment Status
                    </h2>
                </div>

                <div className="p-6">
                    <p className="text-[13px] text-gray-400 leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="p-4 border-t border-gray-800 bg-sidebar/50">
                    <button
                        onClick={onClose}
                        className="w-full bg-accent-blue hover:bg-blue-600 text-white py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

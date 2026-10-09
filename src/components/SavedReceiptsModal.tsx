import React from 'react';
import { X, FileText, Trash2, ArrowRight, Calendar } from 'lucide-react';
import { ReceivingFormModel } from '../types';

interface SavedReceiptsModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedReceipts: ReceivingFormModel[];
  onSelect: (receipt: ReceivingFormModel) => void;
  onDelete: (id: string) => void;
}

export function SavedReceiptsModal({
  isOpen,
  onClose,
  savedReceipts,
  onSelect,
  onDelete
}: SavedReceiptsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-amber-100 animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-amber-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-amber-200" />
            <h2 className="text-lg font-semibold tracking-wide">Saved Receiving Copies</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-amber-900 transition text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
          {savedReceipts.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="font-medium">No saved receiving copies yet.</p>
              <p className="text-xs text-gray-400 mt-1">Generated or uploaded receipts can be saved for future reference.</p>
            </div>
          ) : (
            savedReceipts.map((rec) => (
              <div 
                key={rec.id}
                className="p-4 rounded-xl border border-gray-200 hover:border-amber-500 hover:bg-amber-50/20 transition flex items-center justify-between group"
              >
                <div 
                  className="cursor-pointer flex-1 pr-4"
                  onClick={() => {
                    onSelect(rec);
                    onClose();
                  }}
                >
                  <div className="font-semibold text-gray-900 group-hover:text-amber-800">
                    {rec.title || rec.purpose || 'Stock Receiving Copy'}
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                    <span className="font-medium text-amber-700">{rec.sghcNo}</span>
                    <span>To: {rec.to}</span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{rec.date}</span>
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {rec.items.length} items listed
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      onSelect(rec);
                      onClose();
                    }}
                    title="Load Receipt"
                    className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg transition"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => rec.id && onDelete(rec.id)}
                    title="Delete"
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

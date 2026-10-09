import React, { useState } from 'react';
import { ReceivingItem } from '../types';
import { Layers, CheckSquare, Square, ArrowRight, X, Check, Search, Sparkles } from 'lucide-react';

interface BatchDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ReceivingItem[];
  departments: string[];
  onUpdateItems: (updatedItems: ReceivingItem[]) => void;
}

export const BatchDepartmentModal: React.FC<BatchDepartmentModalProps> = ({
  isOpen,
  onClose,
  items,
  departments,
  onUpdateItems
}) => {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [targetDept, setTargetDept] = useState<string>(departments[0] || 'SGHC-KITCHEN');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('ALL');

  if (!isOpen) return null;

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.itemBrand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.remarks || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = filterDept === 'ALL' || (item.department || 'SGHC-KITCHEN') === filterDept;
    return matchesSearch && matchesDept;
  });

  const selectAllFiltered = () => {
    const filteredIds = filteredItems.map(i => i.id);
    const allSelected = filteredIds.every(id => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedItemIds(prev => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleApplyDepartment = () => {
    if (selectedItemIds.length === 0) return;
    const updated = items.map(item => {
      if (selectedItemIds.includes(item.id)) {
        return { ...item, department: targetDept };
      }
      return item;
    });
    onUpdateItems(updated);
    setSelectedItemIds([]);
  };

  const handleSetItemDept = (itemId: string, dept: string) => {
    const updated = items.map(item => {
      if (item.id === itemId) {
        return { ...item, department: dept };
      }
      return item;
    });
    onUpdateItems(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Batch Department Allocator</h2>
              <p className="text-xs text-gray-500">Quickly reassign or group multiple items into departments</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 bg-amber-50/50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-700">Move selected ({selectedItemIds.length}) to:</span>
            <select
              value={targetDept}
              onChange={(e) => setTargetDept(e.target.value)}
              className="bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs font-bold text-gray-800 shadow-2xs focus:ring-2 focus:ring-amber-500"
            >
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <button
              onClick={handleApplyDepartment}
              disabled={selectedItemIds.length === 0}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5"
            >
              <span>Apply Department</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none"
              />
            </div>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 font-medium"
            >
              <option value="ALL">All Depts</option>
              {departments.map(d => (
                <option key={d} value={d}>{d.replace('SGHC-', '')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Items List Table */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[55vh]">
          <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-600 font-bold">
                  <th className="p-2.5 w-10 text-center">
                    <button
                      onClick={selectAllFiltered}
                      className="p-0.5 hover:bg-gray-200 rounded text-gray-700"
                      title="Select / Deselect all"
                    >
                      {filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.includes(i.id)) ? (
                        <CheckSquare className="w-4 h-4 text-amber-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-2.5">Item Description</th>
                  <th className="p-2.5 w-20 text-center">Qty / UOM</th>
                  <th className="p-2.5 w-44">Current Department</th>
                  <th className="p-2.5 w-48">Remarks / PO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.map((item, idx) => {
                  const isSelected = selectedItemIds.includes(item.id);
                  const currentItemDept = item.department || 'SGHC-KITCHEN';
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-amber-50/40 transition cursor-pointer ${isSelected ? 'bg-amber-50/70' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                      onClick={() => toggleSelectItem(item.id)}
                    >
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => toggleSelectItem(item.id)}
                          className="p-0.5 hover:bg-amber-100 rounded text-gray-700"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-amber-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="p-2.5 font-semibold text-gray-900 uppercase">
                        {item.itemBrand}
                      </td>
                      <td className="p-2.5 text-center font-bold text-gray-800">
                        {item.qty} <span className="text-[10px] font-medium text-gray-500">{item.uom}</span>
                      </td>
                      <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={currentItemDept}
                          onChange={(e) => handleSetItemDept(item.id, e.target.value)}
                          className="w-full bg-white border border-gray-300 rounded px-2 py-1 text-[11px] font-bold text-amber-900 shadow-2xs focus:ring-1 focus:ring-amber-500"
                        >
                          {departments.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5 text-[11px] text-gray-500 truncate">
                        {item.remarks || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="text-xs text-gray-500">
            Showing {filteredItems.length} of {items.length} items ({selectedItemIds.length} selected)
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-2xs transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

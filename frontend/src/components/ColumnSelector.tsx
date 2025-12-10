import { ColumnConfig } from './Blotter';

interface ColumnSelectorProps {
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onClose: () => void;
}

export default function ColumnSelector({ columns, onColumnsChange, onClose }: ColumnSelectorProps) {
  const toggleColumn = (columnId: string) => {
    const updated = columns.map(col =>
      col.id === columnId ? { ...col, visible: !col.visible } : col
    );
    onColumnsChange(updated);
  };

  const selectAll = () => {
    onColumnsChange(columns.map(col => ({ ...col, visible: true })));
  };

  const deselectAll = () => {
    onColumnsChange(columns.map(col => ({ ...col, visible: false })));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Select Columns</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ×
        </button>
      </div>
      
      <div className="flex gap-2 mb-4">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={deselectAll}
          className="px-3 py-1.5 text-sm bg-gray-50 text-gray-700 rounded hover:bg-gray-100 transition-colors"
        >
          Deselect All
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {columns.map(column => (
          <label
            key={column.id}
            className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
          >
            <input
              type="checkbox"
              checked={column.visible}
              onChange={() => toggleColumn(column.id)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">{column.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}


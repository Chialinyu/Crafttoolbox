import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

interface ColorInfo {
  color: [number, number, number];
  pixelCount: number;
  percentage: number;
}

interface ColorPaletteProps {
  colors: ColorInfo[];
  selectedColorIndices?: number[]; // Unified selection
  onColorSelect?: (indices: number[]) => void; // Unified select handler
  onMergeColors?: (indices: number[]) => void; // Merge handler
  onColorHover?: (index: number | null) => void; // Optional hover preview
}

/**
 * ColorPalette - Display K-means color clustering results
 * 
 * Features:
 * - Hover to preview single color
 * - Click to select/deselect colors
 * - Select 2+ colors to show merge button
 */
export const ColorPalette: React.FC<ColorPaletteProps> = ({
  colors,
  selectedColorIndices = [],
  onColorSelect,
  onMergeColors,
  onColorHover,
}) => {
  const { t } = useLanguage();
  
  if (colors.length === 0) {
    return null;
  }
  
  // Handle unified color selection (no Ctrl needed)
  const handleColorClick = (index: number) => {
    if (onColorSelect) {
      // Toggle selection
      const newSelection = selectedColorIndices.includes(index)
        ? selectedColorIndices.filter(i => i !== index)
        : [...selectedColorIndices, index];
      onColorSelect(newSelection);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground">
          {t('colorGroups')} ({colors.length})
        </div>
        
        {/* Merge button (show when 2+ colors selected) */}
        {selectedColorIndices.length >= 2 && onMergeColors && (
          <button
            onClick={() => onMergeColors(selectedColorIndices)}
            className="text-xs px-2.5 py-1.5 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors font-medium shadow-sm whitespace-nowrap"
          >
            {t('mergeColors')} ({selectedColorIndices.length})
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {colors.map((colorInfo, index) => {
          const [r, g, b] = colorInfo.color;
          const isSelected = selectedColorIndices.includes(index);
          const colorStyle = `rgb(${r}, ${g}, ${b})`;
          
          // Convert RGB to HEX
          const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
          
          // Calculate luminance to determine if we need dark or light text
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          const textColor = luminance > 0.5 ? '#000' : '#fff';
          
          return (
            <div
              key={index}
              className={`
                relative rounded-lg overflow-hidden cursor-pointer transition-all
                ${isSelected ? 'ring-2 ring-accent ring-offset-2 scale-105' : ''}
                ${!isSelected ? 'hover:ring-2 hover:ring-accent/50 hover:scale-102' : ''}
              `}
              style={{
                backgroundColor: colorStyle,
                minHeight: '48px',
              }}
              onMouseEnter={() => onColorHover && onColorHover(index)}
              onMouseLeave={() => onColorHover && onColorHover(null)}
              onClick={() => handleColorClick(index)}
            >
              {/* Color info overlay */}
              <div 
                className="absolute inset-0 flex items-center justify-center p-2"
                style={{ color: textColor }}
              >
                <div className="text-[10px] font-mono opacity-90">
                  {hexColor}
                </div>
              </div>
              
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-1 right-1">
                  <div className="w-4 h-4 rounded bg-accent border-2 border-white flex items-center justify-center shadow-sm">
                    <div className="text-white text-[10px] font-bold">✓</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Instructions */}
      <div className="text-[10px] text-muted-foreground leading-relaxed">
        {selectedColorIndices.length > 0 
          ? `✓ ${t('selectedColors')} ${selectedColorIndices.length} ${selectedColorIndices.length >= 2 ? `- ${t('clickMergeButton')}` : `- ${t('selectMore')}`}`
          : t('ctrlClickToSelect')}
      </div>
    </div>
  );
};
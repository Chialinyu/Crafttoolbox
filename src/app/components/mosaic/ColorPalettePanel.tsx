import React from 'react';
import { Palette, Pencil } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { CustomColorPicker } from '../CustomColorPicker';
import { rgbToHex } from '../../../utils/colorUtils';

interface ColorStats {
  color: string;
  count: number;
}

interface ColorPalettePanelProps {
  palette: string[];
  colorStats: ColorStats[];
  selectedColorGroup: number | null;
  hoveredColorGroup: number | null;
  showColorPicker: number | null;
  onColorSelect: (index: number) => void;
  onColorHover: (index: number | null) => void;
  onColorChange: (index: number, newColor: string) => void;
  onColorPickerToggle: (index: number | null) => void;
}

export const ColorPalettePanel: React.FC<ColorPalettePanelProps> = ({
  palette,
  colorStats,
  selectedColorGroup,
  hoveredColorGroup,
  showColorPicker,
  onColorSelect,
  onColorHover,
  onColorChange,
  onColorPickerToggle,
}) => {
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          {t('colorPalette')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground select-none">
          {t('selectColorGroup')}
        </p>
        
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-2">
          {palette.map((color, index) => {
            const stat = colorStats.find(s => s.color === color);
            const isSelected = selectedColorGroup === index;
            const isHovered = hoveredColorGroup === index;
            
            return (
              <div
                key={index}
                className={`relative p-2 rounded-lg border-2 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-md'
                    : isHovered
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-transparent hover:bg-muted/30'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onColorSelect(index);
                }}
                onMouseEnter={() => onColorHover(index)}
                onMouseLeave={() => onColorHover(null)}
              >
                <div className="flex flex-col items-center gap-2">
                  <div 
                    data-color-swatch
                    className="relative w-12 h-12 rounded border-2 border-border flex-shrink-0 cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSelected) {
                        onColorSelect(index);
                      }
                      onColorPickerToggle(showColorPicker === index ? null : index);
                    }}
                  >
                    <div
                      className="w-full h-full rounded"
                      style={{ backgroundColor: color }}
                    />
                    
                    {/* Dark overlay background */}
                    <div className={`absolute inset-0 bg-black/40 rounded transition-opacity ${
                      showColorPicker === index 
                        ? 'opacity-0'
                        : isHovered || isSelected 
                          ? 'opacity-100' 
                          : 'opacity-0 group-hover:opacity-100'
                    }`} />
                    
                    {/* Edit pencil icon */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <Pencil className={`h-4 w-4 text-white transition-opacity ${
                        showColorPicker === index || isHovered || isSelected
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'
                      }`} />
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="text-xs font-mono text-muted-foreground select-text">
                      {rgbToHex(color)}
                    </div>
                    <div className="text-xs text-muted-foreground select-none">
                      {stat?.count || 0} {t('tiles')}
                    </div>
                  </div>
                </div>

                {/* Color Picker */}
                {showColorPicker === index && (
                  <div 
                    data-color-picker-trigger
                    className="absolute left-0 top-full mt-2 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <CustomColorPicker
                      color={rgbToHex(color)}
                      onChange={(newColor) => onColorChange(index, newColor)}
                      onClose={() => onColorPickerToggle(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
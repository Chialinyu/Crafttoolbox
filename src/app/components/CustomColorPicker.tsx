import { HexColorPicker } from 'react-colorful';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { useState, useEffect } from 'react';
import { Pipette } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface CustomColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  onClose?: () => void;
}

export function CustomColorPicker({ color, onChange, onClose }: CustomColorPickerProps) {
  const { t } = useLanguage();
  const [hexValue, setHexValue] = useState(color);
  const [isEyeDropperSupported, setIsEyeDropperSupported] = useState(false);

  useEffect(() => {
    setHexValue(color);
  }, [color]);

  useEffect(() => {
    // Check if EyeDropper API is supported
    setIsEyeDropperSupported('EyeDropper' in window);
  }, []);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHexValue(value);
    
    // Validate and apply if it's a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    }
  };

  const handleHexBlur = () => {
    // Reset to current color if invalid
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
      setHexValue(color);
    }
  };

  const handleEyeDropper = async () => {
    if (!('EyeDropper' in window)) {
      return;
    }

    try {
      // @ts-ignore - EyeDropper is not yet in TypeScript types
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      if (result && result.sRGBHex) {
        onChange(result.sRGBHex);
        setHexValue(result.sRGBHex);
      }
    } catch (error) {
      // User cancelled or error occurred
    }
  };

  return (
    <div 
      className="absolute z-50 bg-white rounded-lg shadow-xl p-4 border border-gray-200"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <HexColorPicker color={color} onChange={onChange} />
      
      <div className="mt-3">
        <Label className="text-sm">{t('hexColor')}</Label>
        <Input
          type="text"
          value={hexValue}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onFocus={(e) => {
            e.stopPropagation();
            e.target.select();
          }}
          className="mt-1 font-mono"
          placeholder="#000000"
        />
      </div>

      {isEyeDropperSupported && (
        <div className="mt-3">
          <Button
            type="button"
            onClick={handleEyeDropper}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Pipette className="w-4 h-4 mr-2" />
            {t('eyeDropper')}
          </Button>
        </div>
      )}
    </div>
  );
}

CustomColorPicker.displayName = 'CustomColorPicker';
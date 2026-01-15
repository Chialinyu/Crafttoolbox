import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronUp, Droplet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';

interface ColorSettingsPanelProps {
  numColors: number;
  onNumColorsChange: (value: number) => void;
}

export const ColorSettingsPanel: React.FC<ColorSettingsPanelProps> = ({
  numColors,
  onNumColorsChange,
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <Card>
      <CardHeader 
        className={`cursor-pointer select-none ${!isExpanded ? 'pb-5' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplet className="h-5 w-5" />
            <CardTitle>{t('colorSettings')}</CardTitle>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="space-y-4 pt-0">
              <div>
                <Label>{t('numColors')}: {numColors}</Label>
                <Slider
                  value={[numColors]}
                  onValueChange={(v) => onNumColorsChange(v[0])}
                  min={2}
                  max={16}
                  step={1}
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

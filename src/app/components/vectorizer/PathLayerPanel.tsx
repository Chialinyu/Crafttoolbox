/**
 * Path Layer Panel - Displays vectorized paths grouped by color
 * with interactive controls for visibility, selection, and deletion
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { VectorPath } from './utils/vectorization';
import { useLanguage } from '../../contexts/LanguageContext';

interface PathLayerPanelProps {
  paths: VectorPath[];
  selectedPathIndices: number[];
  hiddenPathIndices: number[];
  onPathSelect: (indices: number[]) => void;
  onPathToggleVisibility: (index: number) => void;
  onPathDelete: (index: number) => void;
  onPathHover: (index: number | null) => void;
  onGroupToggleVisibility?: (indices: number[]) => void; // 🎯 NEW: Toggle visibility for all paths in a group
}

interface ColorGroup {
  color: string;
  displayColor: string;
  paths: Array<{
    path: VectorPath;
    originalIndex: number;
  }>;
}

export function PathLayerPanel({
  paths,
  selectedPathIndices,
  hiddenPathIndices,
  onPathSelect,
  onPathToggleVisibility,
  onPathDelete,
  onPathHover,
  onGroupToggleVisibility,
}: PathLayerPanelProps) {
  const { t } = useLanguage();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Group paths by color
  const colorGroups: ColorGroup[] = [];
  const groupMap = new Map<string, ColorGroup>();

  paths.forEach((path, index) => {
    const color = path.color || '#000000';
    
    if (!groupMap.has(color)) {
      const group: ColorGroup = {
        color,
        displayColor: color,
        paths: [],
      };
      groupMap.set(color, group);
      colorGroups.push(group);
    }
    
    groupMap.get(color)!.paths.push({
      path,
      originalIndex: index,
    });
  });

  const toggleGroup = (color: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(color)) {
      newExpanded.delete(color);
    } else {
      newExpanded.add(color);
    }
    setExpandedGroups(newExpanded);
  };

  const handlePathClick = (index: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Multi-select with Ctrl/Cmd
      if (selectedPathIndices.includes(index)) {
        onPathSelect(selectedPathIndices.filter(i => i !== index));
      } else {
        onPathSelect([...selectedPathIndices, index]);
      }
    } else {
      // Single select - toggle if already selected
      if (selectedPathIndices.length === 1 && selectedPathIndices[0] === index) {
        // Deselect if clicking the same path again
        onPathSelect([]);
      } else {
        onPathSelect([index]);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">
          {t('vectorLayers')} ({paths.length})
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (expandedGroups.size === colorGroups.length) {
              setExpandedGroups(new Set());
            } else {
              setExpandedGroups(new Set(colorGroups.map(g => g.color)));
            }
          }}
        >
          {expandedGroups.size === colorGroups.length ? t('collapseAll') : t('expandAll')}
        </Button>
      </div>

      <div className="space-y-2">
        {colorGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.color);
          const visibleCount = group.paths.filter(
            p => !hiddenPathIndices.includes(p.originalIndex)
          ).length;
          
          // 🎯 Check if ALL paths in this group are hidden
          const allGroupPathsHidden = group.paths.every(
            p => hiddenPathIndices.includes(p.originalIndex)
          );
          
          // 🎯 Get all path indices in this group
          const groupPathIndices = group.paths.map(p => p.originalIndex);

          return (
            <div
              key={group.color}
              className="border rounded-lg overflow-hidden"
            >
              {/* Color Group Header */}
              <div className="flex items-center bg-muted/30">
                <button
                  onClick={() => toggleGroup(group.color)}
                  className="flex-1 flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  )}
                  
                  <div
                    className="w-6 h-6 rounded border border-border shrink-0"
                    style={{ backgroundColor: group.displayColor }}
                  />
                  
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium">
                      {group.displayColor}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {group.paths.length} {t('paths')} · {visibleCount} {t('visible')}
                    </div>
                  </div>
                </button>
                
                {/* 🎯 Group Visibility Toggle Button */}
                {onGroupToggleVisibility && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onGroupToggleVisibility(groupPathIndices);
                    }}
                    className="mx-2 shrink-0"
                    title={allGroupPathsHidden ? t('showAllInGroup') : t('hideAllInGroup')}
                  >
                    {allGroupPathsHidden ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                )}
              </div>

              {/* Path List */}
              {isExpanded && (
                <div className="divide-y">
                  {group.paths.map(({ path, originalIndex }) => {
                    const isSelected = selectedPathIndices.includes(originalIndex);
                    const isHidden = hiddenPathIndices.includes(originalIndex);
                    const nodeCount = path.points.length;

                    return (
                      <div
                        key={originalIndex}
                        className={`
                          flex items-center gap-2 p-2 hover:bg-muted/30 transition-colors cursor-pointer
                          ${isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : ''}
                          ${isHidden ? 'opacity-40' : ''}
                        `}
                        onClick={(e) => handlePathClick(originalIndex, e)}
                        onMouseEnter={() => onPathHover(originalIndex)}
                        onMouseLeave={() => onPathHover(null)}
                      >
                        {/* Mini Preview */}
                        <div className="w-10 h-10 border border-border rounded bg-white shrink-0 flex items-center justify-center">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 100 100"
                            className="overflow-visible"
                          >
                            {renderMiniPath(path)}
                          </svg>
                        </div>

                        {/* Path Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {t(path.type)} #{originalIndex + 1}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {nodeCount} {t('nodes')}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPathToggleVisibility(originalIndex);
                            }}
                            className="w-7 h-7 p-0"
                          >
                            {isHidden ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPathDelete(originalIndex);
                            }}
                            className="w-7 h-7 p-0 text-red-500 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection Info */}
      {selectedPathIndices.length > 0 && (
        <div className="mt-4 p-3 bg-primary/10 rounded-lg text-sm border border-primary/20">
          <div className="font-medium text-foreground">
            {selectedPathIndices.length} {t('pathsSelected')}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {t('ctrlClickMultiSelect')}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to render mini path preview
function renderMiniPath(path: VectorPath): JSX.Element {
  if (path.points.length === 0 && !path.svgPath) return <></>;

  // 🎯 If we have svgPath, parse it to get bounding box and render scaled version
  if (path.svgPath && path.points.length === 0) {
    return renderPathFromSvgString(path);
  }

  // Otherwise use points
  if (path.points.length > 0) {
    return renderPathFromPoints(path);
  }

  return <></>;
}

// 🆕 Parse SVG path string and extract bounding box
function parseSvgPathBounds(svgPath: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  // Extract all numbers from the path string
  const numbers = svgPath.match(/-?\d+\.?\d*/g);
  if (!numbers || numbers.length < 2) return null;

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  // Parse pairs of coordinates (x, y)
  for (let i = 0; i < numbers.length - 1; i += 2) {
    const x = parseFloat(numbers[i]);
    const y = parseFloat(numbers[i + 1]);
    
    if (!isNaN(x) && !isNaN(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!isFinite(minX)) return null;

  return { minX, minY, maxX, maxY };
}

// 🆕 Render path from SVG string with proper scaling
function renderPathFromSvgString(path: VectorPath): JSX.Element {
  const bounds = parseSvgPathBounds(path.svgPath!);
  
  if (!bounds) {
    console.warn('Failed to parse SVG path bounds');
    return <></>;
  }

  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;

  // 🎯 Use dynamic viewBox that matches the path's coordinate space
  // Add 10% padding
  const padding = Math.max(width, height) * 0.1;
  const viewBox = `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="overflow-visible"
    >
      <path
        d={path.svgPath}
        fill={path.type === 'fill' ? path.color : 'none'}
        stroke={path.type === 'stroke' ? path.color : (path.type === 'fill' ? path.color : path.color)}
        strokeWidth={Math.max(width, height) * 0.02}
        opacity={0.9}
      />
    </svg>
  );
}

function renderPathFromPoints(path: VectorPath): JSX.Element {
  // Calculate bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  path.points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });

  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  
  // 🎯 Scale to fit in 80x80 space with padding
  const scale = Math.min(80 / width, 80 / height);

  // 🔍 Debug: Log if scale is unusually small or large
  if (scale < 0.01 || scale > 100) {
    console.warn(`Unusual scale for path: ${scale}, width: ${width}, height: ${height}`);
  }

  // Generate path data with scaling
  const scaledPoints = path.points.map(p => ({
    x: (p.x - minX) * scale + 10,
    y: (p.y - minY) * scale + 10,
  }));

  let pathData = `M ${scaledPoints[0].x.toFixed(2)} ${scaledPoints[0].y.toFixed(2)}`;
  for (let i = 1; i < scaledPoints.length; i++) {
    pathData += ` L ${scaledPoints[i].x.toFixed(2)} ${scaledPoints[i].y.toFixed(2)}`;
  }
  if (path.closed) {
    pathData += ' Z';
  }

  return (
    <path
      d={pathData}
      fill={path.type === 'fill' ? path.color : 'none'}
      stroke={path.type === 'stroke' ? path.color : (path.type === 'fill' ? path.color : path.color)}
      strokeWidth={path.type === 'stroke' ? 3 : 1}
      opacity={0.9}
    />
  );
}
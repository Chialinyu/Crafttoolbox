import React, { useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
  formatResizeWarning,
  guardImageUpload,
} from '../../../utils/imageUploadGuard';

interface ImageUploaderProps {
  onImageUpload: (imageData: ImageData, originalImage: HTMLImageElement) => void;
}

/**
 * ImageUploader Component - Simple version without Card wrapper
 * Designed to be embedded inside a Card in the parent component
 */
export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    try {
      const result = await guardImageUpload(file);
      if (result.ok === false) {
        toast.error(result.message);
        return;
      }

      if (result.wasResized) {
        toast.warning(
          formatResizeWarning(
            result.originalWidth,
            result.originalHeight,
            result.image.width,
            result.image.height
          ),
          { duration: 5000 }
        );
      }

      setPreview(result.previewDataUrl);
      onImageUpload(result.imageData, result.image);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClick = () => {
    if (isLoading) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileSelect(file);
    }
    // Allow re-selecting the same file
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileSelect(file);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label={t('uploadImage')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          border-border hover:border-primary hover:bg-primary/5
          ${isDragging ? 'border-primary bg-primary/5' : ''}
          ${isLoading ? 'opacity-60 pointer-events-none' : ''}
        `}
      >
        {preview ? (
          <div className="space-y-4">
            <img
              src={preview}
              alt={t('uploadImage')}
              className="max-h-48 mx-auto rounded-lg shadow-md"
            />
            <Button variant="outline" size="sm" type="button">
              <Upload className="h-4 w-4 mr-2" />
              {t('chooseImage')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-1 select-none">
                {t('uploadImage')}
              </p>
              <p className="text-xs text-muted-foreground select-none">
                Click or drag image here
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

ImageUploader.displayName = 'ImageUploader';

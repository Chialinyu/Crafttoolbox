import React, { useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { LIMITS } from './constants';

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

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // ✅ Check image dimensions and resize if needed
        let targetWidth = img.width;
        let targetHeight = img.height;
        const totalPixels = img.width * img.height;
        
        // Check if image exceeds size limits
        if (img.width > LIMITS.MAX_IMAGE_WIDTH || 
            img.height > LIMITS.MAX_IMAGE_HEIGHT || 
            totalPixels > LIMITS.MAX_PIXELS) {
          
          // Calculate scale to fit within limits
          const scaleWidth = LIMITS.MAX_IMAGE_WIDTH / img.width;
          const scaleHeight = LIMITS.MAX_IMAGE_HEIGHT / img.height;
          const scalePixels = Math.sqrt(LIMITS.MAX_PIXELS / totalPixels);
          const scale = Math.min(scaleWidth, scaleHeight, scalePixels);
          
          targetWidth = Math.floor(img.width * scale);
          targetHeight = Math.floor(img.height * scale);
          
          toast.warning(
            `Image too large (${img.width}×${img.height}). Resized to ${targetWidth}×${targetHeight} for processing.`,
            { duration: 5000 }
          );
        }
        
        // Create canvas to extract ImageData
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          // Draw with scaling if needed
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          
          try {
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            
            // Set preview
            setPreview(e.target?.result as string);
            
            // Create a new image object with the resized dimensions
            const resizedImg = new Image();
            resizedImg.width = targetWidth;
            resizedImg.height = targetHeight;
            resizedImg.src = canvas.toDataURL();
            
            // Callback with image data
            onImageUpload(imageData, resizedImg);
          } catch (error) {
            console.error('Failed to process image:', error);
            toast.error('Failed to process image. Please try a smaller image.');
          }
        }
      };
      
      img.onerror = () => {
        toast.error('Failed to load image');
      };
      
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => {
      toast.error('Failed to read file');
    };
    
    reader.readAsDataURL(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
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
      handleFileSelect(file);
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors duration-200
          border-border hover:border-primary hover:bg-primary/5
          ${isDragging ? 'border-primary bg-primary/5' : ''}
        `}
      >
        {preview ? (
          <div className="space-y-4">
            <img 
              src={preview} 
              alt="Preview" 
              className="max-h-48 mx-auto rounded-lg shadow-md"
            />
            <Button variant="outline" size="sm">
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
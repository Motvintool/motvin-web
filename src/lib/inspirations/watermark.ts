export const addWatermarkToBlob = async (blob: Blob, appName?: string, appLogoUrl?: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        const S = img.width / 245.91;
        const barHeight = 28 * S;
        
        canvas.width = img.width;
        canvas.height = img.height + barHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context');

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Draw watermark background
        ctx.fillStyle = '#2f2f2f';
        ctx.fillRect(0, img.height, canvas.width, barHeight);

        // Load fonts if possible
        if ('fonts' in document) {
          try {
            await document.fonts.load(`${10 * S}px Poppins`);
          } catch (e) {}
        }

        const loadImage = (src: string): Promise<HTMLImageElement | null> => {
          return new Promise((res) => {
            if (!src) return res(null);
            const i = new Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => res(i);
            i.onerror = () => res(null); // Fallback to null if fails
            i.src = src;
          });
        };

        const [watermarkImg, appImg] = await Promise.all([
          loadImage('/ASSET/Icons/Motvin/watermark.svg'),
          loadImage(appLogoUrl || '')
        ]);

        // Left Side (App Logo + Name)
        ctx.textBaseline = 'middle';
        
        let currentLeftX = 8 * S;
        const leftCenterY = img.height + 14 * S; // 28 / 2 = 14
        
        if (appImg) {
          const appLogoSize = 14 * S;
          const radius = 4 * S;
          const logoY = img.height + 7 * S;
          
          // Draw rounded rectangle for app logo
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(currentLeftX + radius, logoY);
          ctx.lineTo(currentLeftX + appLogoSize - radius, logoY);
          ctx.quadraticCurveTo(currentLeftX + appLogoSize, logoY, currentLeftX + appLogoSize, logoY + radius);
          ctx.lineTo(currentLeftX + appLogoSize, logoY + appLogoSize - radius);
          ctx.quadraticCurveTo(currentLeftX + appLogoSize, logoY + appLogoSize, currentLeftX + appLogoSize - radius, logoY + appLogoSize);
          ctx.lineTo(currentLeftX + radius, logoY + appLogoSize);
          ctx.quadraticCurveTo(currentLeftX, logoY + appLogoSize, currentLeftX, logoY + appLogoSize - radius);
          ctx.lineTo(currentLeftX, logoY + radius);
          ctx.quadraticCurveTo(currentLeftX, logoY, currentLeftX + radius, logoY);
          ctx.closePath();
          ctx.clip();
          
          ctx.drawImage(appImg, currentLeftX, logoY, appLogoSize, appLogoSize);
          ctx.restore();
          
          currentLeftX += appLogoSize + (4 * S);
        }

        if (appName) {
          ctx.fillStyle = 'white';
          ctx.font = `500 ${8 * S}px Poppins, sans-serif`;
          ctx.fillText(appName, currentLeftX, leftCenterY + 0.5 * S); // slightly nudged for visual balance
        }

        // Right Side (Motvin Logo + "MOTVIN")
        if (watermarkImg) {
          const watermarkWidth = 64 * S;
          // Maintain the original SVG aspect ratio to prevent stretching
          const watermarkHeight = (watermarkWidth * watermarkImg.height) / watermarkImg.width;
          const rightStartX = canvas.width - 8 * S - watermarkWidth;
          // Vertically center it inside the bar
          const logoY = img.height + (barHeight - watermarkHeight) / 2;
          ctx.drawImage(watermarkImg, rightStartX, logoY, watermarkWidth, watermarkHeight);
        }

        // Export
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');

      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for watermark'));
    img.src = URL.createObjectURL(blob);
  });
};

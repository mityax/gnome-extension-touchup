/**
 * Calculate relative luminance. The color values r, g and b must be within the 0-255 range.
  */
export function calculateLuminance(r: number, g: number, b: number): number {
    return 0.2126 * r/255 + 0.7152 * g/255 + 0.0722 * b/255;
}

export function calculateAverageColor(pixels: Uint8Array, width: number, areasToInclude: {x: number; y: number, width: number, height: number}[]): [number, number, number] {
    let totalR = 0, totalG = 0, totalB = 0, count = 0;

    for (let a of areasToInclude) {
        for (let x = a.x; x < a.x + a.width; x++) {
            for (let y = a.y; y < a.y + a.height; y++) {
                let index = (y * width + x) * 4; // Calculate the starting index of the pixel
                totalR += pixels[index] || 0;      // Red component
                totalG += pixels[index + 1] || 0;  // Green component
                totalB += pixels[index + 2] || 0;  // Blue component
                count++;
            }
        }
    }

    return [totalR, totalG, totalB].map(x => Math.round(x / count)) as [number, number, number];
}

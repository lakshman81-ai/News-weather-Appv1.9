/**
 * Calculates visual prominence score based on image/video presence.
 * Checks URL patterns without API calls.
 */
export function calculateVisualScore(imageUrl) {
    if (!imageUrl) return 1.0;

    // Check for video platforms
    if (/youtube|vimeo|video|youtu\.be/i.test(imageUrl)) {
        return 1.3; // 30% boost for video
    }

    // Check for standard image extensions or common image CDNs
    // Also accept generic URLs if they were extracted as 'enclosure' or 'thumbnail'
    // But verify it's likely an image
    if (/\.(jpg|jpeg|png|gif|webp|svg)/i.test(imageUrl) ||
        /images|img|photo|static/i.test(imageUrl)) {
        return 1.15; // 15% boost for image
    }

    // Fallback if URL exists but pattern doesn't match obviously
    // Assume it's an image if it was passed as imageUrl
    return 1.1;
}

export class CameraService {
    static async checkPermission(): Promise<{ granted: boolean }> {
        try {
            // Simple check by trying to get a stream (and immediately stopping it)
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(t => t.stop());
            return { granted: true };
        } catch (e) {
            return { granted: false };
        }
    }

    static async takePhoto(facingMode: 'user' | 'environment'): Promise<Blob | null> {
        try {
            const constraints: MediaStreamConstraints = {
                video: { facingMode: facingMode }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const track = stream.getVideoTracks()[0];
            let blob: Blob | null = null;

            // 1. Try ImageCapture (Modern/Native)
            if ('ImageCapture' in window) {
                try {
                    const imageCapture = new (window as any).ImageCapture(track);
                    blob = await imageCapture.takePhoto();
                } catch(e) {
                    // Fallback
                }
            }

            // 2. Fallback to Canvas (Universal)
            if (!blob) {
                const video = document.createElement('video');
                video.srcObject = stream;
                // Wait for video to be ready
                await new Promise<void>((resolve) => {
                    video.onloadedmetadata = () => {
                        video.play().then(() => resolve());
                    };
                });
                
                // Small delay to let camera adjust exposure
                await new Promise(r => setTimeout(r, 500));

                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                if(ctx) {
                    ctx.drawImage(video, 0, 0);
                    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg'));
                }
            }
            
            track.stop();
            stream.getTracks().forEach(t => t.stop());
            return blob;

        } catch (e) {
            console.error(`Camera ${facingMode} failed`, e);
            return null;
        }
    }
}
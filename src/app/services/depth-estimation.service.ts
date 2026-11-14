
import { Injectable } from '@angular/core';
import {
  pipeline,
  RawImage
} from '@huggingface/transformers';

@Injectable({
  providedIn: 'root'
})
export class DepthEstimationService {

  private estimator: any = null;
  private loadingPromise?: Promise<void>;

  async initialize(): Promise<void> {
    if (this.estimator) return;

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadModel();
    }

    return this.loadingPromise;
  }

  private async loadModel(): Promise<void> {
    try {
      this.estimator = await pipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        { device: 'wasm' }
      );

      console.log('Depth model loaded successfully');

    } catch (error) {
      this.loadingPromise = undefined;
      console.error('Depth model loading failed', error);
      throw error;
    }
  }

  async estimateDepth(
    video: HTMLVideoElement
  ): Promise<RawImage | null> {

    await this.initialize();

    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement('canvas');

    // Use a smaller input for the initial prototype.
    canvas.width = 320;
    canvas.height = Math.max(
      1,
      Math.round(
        video.videoHeight * 320 / video.videoWidth
      )
    );

    const context = canvas.getContext('2d');
    if (!context) return null;

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    const image = canvas.toDataURL('image/jpeg', 0.8);

    const result = await this.estimator(image);

    return result.depth;
  }
}

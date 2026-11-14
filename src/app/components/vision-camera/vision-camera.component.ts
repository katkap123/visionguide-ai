
import {
  Component,
  ElementRef,
  ViewChild,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import '@tensorflow/tfjs';
import { inject } from '@angular/core';
import { DepthEstimationService } from '../../services/depth-estimation.service';

type Position = 'left' | 'center' | 'right';
type VisualSize = 'small' | 'medium' | 'large';

interface PositionedDetection {
  name: string;
  confidence: number;
  position: Position;
  visualSize: VisualSize;
  coverage: number;
}

@Component({
  selector: 'app-vision-camera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './vision-camera.component.html',
  styleUrl: './vision-camera.component.scss'
})
export class VisionCameraComponent implements OnDestroy {

  @ViewChild('videoElement')
  videoElement!: ElementRef<HTMLVideoElement>;

  @ViewChild('canvasElement')
  canvasElement!: ElementRef<HTMLCanvasElement>;

  model?: cocoSsd.ObjectDetection;
  stream?: MediaStream;

  detections: PositionedDetection[] = [];

  running = false;
  loading = false;
  errorMessage = '';

  private timer?: ReturnType<typeof setTimeout>;
  private lastAnnouncements = new Map<string, number>();
  private readonly confidenceThreshold = 0.65;
  private readonly announcementCooldown = 10000;

  private depthService = inject(DepthEstimationService);

  @ViewChild('depthCanvas')
  depthCanvas!: ElementRef<HTMLCanvasElement>;

  depthLoading = false;
  depthError = '';

  async analyzeDepth(): Promise<void> {

    if (this.depthLoading || !this.running) return;

    this.depthLoading = true;
    this.depthError = '';

    try {
      const video = this.videoElement.nativeElement;

      const depthImage =
        await this.depthService.estimateDepth(video);

      if (!depthImage || !this.running) return;

      const canvas = this.depthCanvas.nativeElement;
      const context = canvas.getContext('2d');

      if (!context) return;

      canvas.width = depthImage.width;
      canvas.height = depthImage.height;

      const depthCanvas = depthImage.toCanvas();

      context.drawImage(
        depthCanvas,
        0,
        0,
        canvas.width,
        canvas.height
      );

    } catch (error) {
      console.error('Depth analysis failed:', error);
      this.depthError = 'Unable to analyze depth.';
    } finally {
      this.depthLoading = false;
    }
  }

  async startCamera(): Promise<void> {
    if (this.running || this.loading) return;

    this.loading = true;
    this.errorMessage = '';

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

      const video = this.videoElement.nativeElement;
      video.srcObject = this.stream;

      await video.play();

      if (!this.model) {
        this.model = await cocoSsd.load();
      }

      this.running = true;
      this.loading = false;

      void this.detectObjects();

    } catch (error) {
      console.error(error);
      this.errorMessage = 'Unable to start camera or AI model.';
      this.stopCamera();
    }
  }

  private getPosition(
    bbox: number[],
    videoWidth: number
  ): Position {

    const [x, , width] = bbox;
    const centerX = x + width / 2;
    const ratio = centerX / videoWidth;

    if (ratio < 1 / 3) return 'left';
    if (ratio > 2 / 3) return 'right';

    return 'center';
  }

  private async detectObjects(): Promise<void> {
    if (!this.running || !this.model) return;

    try {
      const video = this.videoElement.nativeElement;

      if (video.readyState >= 2 && video.videoWidth > 0) {

        const predictions = await this.model.detect(video);

        if (!this.running) return;

        const filtered = predictions.filter(
          item => item.score >= this.confidenceThreshold
        );

       
    this.detections = filtered.map(item => {

      const sizeInfo = this.calculateVisualSize(
        item.bbox,
        video.videoWidth,
        video.videoHeight
      );

      return {
        name: item.class,
        confidence: item.score,
        position: this.getPosition(
          item.bbox,
          video.videoWidth
        ),
        visualSize: sizeInfo.visualSize,
        coverage: sizeInfo.coverage
      };
    });

        this.drawBoundingBoxes(filtered);

        this.announceDetections();
      }

    } catch (error) {
      console.error('Detection failed:', error);
    }

    if (this.running) {
      this.timer = setTimeout(
        () => void this.detectObjects(),
        500
      );
    }
  }


  private calculateVisualSize(
    bbox: number[],
    frameWidth: number,
    frameHeight: number
  ): { visualSize: VisualSize; coverage: number } {

    const [, , boxWidth, boxHeight] = bbox;

    const boxArea = boxWidth * boxHeight;
    const frameArea = frameWidth * frameHeight;

    const coverage = boxArea / frameArea;

    let visualSize: VisualSize = 'small';

    if (coverage >= 0.25) {
      visualSize = 'large';
    } else if (coverage >= 0.08) {
      visualSize = 'medium';
    }

    return { visualSize, coverage };
  }

  
private drawBoundingBoxes(
  predictions: cocoSsd.DetectedObject[]
): void {

  const video = this.videoElement.nativeElement;
  const canvas = this.canvasElement.nativeElement;
  const context = canvas.getContext('2d');

  if (!context) return;

  const width = video.videoWidth;
  const height = video.videoHeight;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);

  // Divide camera view into left, center, and right.
  context.strokeStyle = 'rgba(255,255,255,0.5)';
  context.lineWidth = 2;
  context.setLineDash([10, 10]);

  [width / 3, (width * 2) / 3].forEach(x => {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  });

  context.setLineDash([]);

  // Draw object bounding boxes.
  for (const item of predictions) {

    const [x, y, boxWidth, boxHeight] = item.bbox;

    // Determine object position.
    const position = this.getPosition(item.bbox, width);

    // NEW: Calculate visual size and coverage.
    const sizeInfo = this.calculateVisualSize(
      item.bbox,
      width,
      height
    );

    // NEW: Set color based on visual size.
    const color =
      sizeInfo.visualSize === 'large' ? '#ff4444' :
      sizeInfo.visualSize === 'medium' ? '#ffcc00' :
      '#00ff88';

    context.strokeStyle = color;
    context.lineWidth = 3;

    context.strokeRect(x, y, boxWidth, boxHeight);

    // NEW: Display confidence, position and visual size.
    const label =
      `${item.class} ${Math.round(item.score * 100)}% ` +
      `(${position}, ${sizeInfo.visualSize})`;

    context.font = '16px Arial';

    const labelWidth =
      context.measureText(label).width + 12;

    const labelY = Math.max(0, y - 25);

    context.fillStyle = color;
    context.fillRect(x, labelY, labelWidth, 25);

    context.fillStyle = '#000';
    context.fillText(label, x + 6, labelY + 18);
  }
}

  private announceDetections(): void {

    const now = Date.now();

    // Announce only one object per detection cycle.
    // Prefer the highest-confidence detection.
    const sorted = [...this.detections].sort(
      (a, b) => b.confidence - a.confidence
    );

    for (const item of sorted) {

      const key = `${item.name}-${item.position}`;
      const lastTime = this.lastAnnouncements.get(key) ?? 0;

      if (now - lastTime < this.announcementCooldown) {
        continue;
      }

      const message =
        `${item.name} ${item.position === 'center'
          ? 'in front of the camera'
          : `on your ${item.position}`}`;

      this.speak(message);

      this.lastAnnouncements.set(key, now);
      break;
    }
  }

  private speak(message: string): void {
    if (!('speechSynthesis' in window)) return;

    // Avoid interrupting an existing announcement.
    if (window.speechSynthesis.speaking ||
        window.speechSynthesis.pending) {
      return;
    }

    const speech = new SpeechSynthesisUtterance(message);
    speech.rate = 0.9;

    window.speechSynthesis.speak(speech);
  }

  stopCamera(): void {
    this.running = false;
    this.loading = false;

    clearTimeout(this.timer);

    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;

    this.detections = [];
    this.lastAnnouncements.clear();

    window.speechSynthesis?.cancel();

    if (this.canvasElement) {
      const canvas = this.canvasElement.nativeElement;
      canvas.getContext('2d')?.clearRect(
        0, 0, canvas.width, canvas.height
      );
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }
}

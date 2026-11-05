import { Component } from '@angular/core';
import { VisionCameraComponent } from './components/vision-camera/vision-camera.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [VisionCameraComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'visionguide-ai';
}
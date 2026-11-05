import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisionCameraComponent } from './vision-camera.component';

describe('VisionCameraComponent', () => {
  let component: VisionCameraComponent;
  let fixture: ComponentFixture<VisionCameraComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisionCameraComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VisionCameraComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

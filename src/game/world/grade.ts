import { Effect } from 'postprocessing';
import * as THREE from 'three';
import { WORLD_LIGHTING } from '../config';

/**
 * Exposure multiplier on top of the renderer's tone-mapping exposure. Written by camera modes
 * (e.g. the phone camera's auto-exposure); read by the grade effect every frame.
 */
export const gradeControl = { exposure: 1 };

const fragmentShader = /* glsl */ `
uniform vec3 gain;
uniform vec3 lift;
uniform float saturation;
uniform float contrast;
uniform float exposure;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exposure * gain + lift;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, saturation);
  // Contrast around linear mid grey.
  c = 0.18 * pow(max(c, vec3(0.0)) / 0.18, vec3(contrast));
  outputColor = vec4(c, inputColor.a);
}
`;

/**
 * Warm, dusty West Coast grade (CLAUDE.md §10), applied in linear light before tone mapping.
 * A pure color op, so postprocessing merges it into the neighbouring effect pass for ~free.
 */
export class WarmGradeEffect extends Effect {
  constructor() {
    const g = WORLD_LIGHTING.grade;
    super('WarmGradeEffect', fragmentShader, {
      uniforms: new Map<string, THREE.Uniform>([
        ['gain', new THREE.Uniform(new THREE.Vector3(...g.gain))],
        ['lift', new THREE.Uniform(new THREE.Vector3(...g.lift))],
        ['saturation', new THREE.Uniform(g.saturation)],
        ['contrast', new THREE.Uniform(g.contrast)],
        ['exposure', new THREE.Uniform(1)],
      ]),
    });
  }

  override update(): void {
    this.uniforms.get('exposure')!.value = gradeControl.exposure;
  }
}

import { useEffect, useMemo } from 'react';
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  FXAA,
  HueSaturation,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { useThree } from '@react-three/fiber';
import { ToneMappingMode } from 'postprocessing';
import { useSettings } from '../store/settings';
import { WarmGradeEffect } from './grade';

/** Post-processing stack per quality tier (CLAUDE.md §9). */
export function PostFX() {
  const q = useSettings((s) => s.quality);
  // The composer renders into half-float buffers; many Android GPUs can't, which leaves the
  // 3D view blank. Those devices (and the Low tier) render straight to the screen instead,
  // with the renderer's own ACES tone mapping.
  const floatBuffers = useThree((s) => {
    const gl = s.gl.getContext();
    return !!(
      gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')
    );
  });
  const enabled = floatBuffers && q.tier !== 'low';
  // The warm grade is a merged color op (no extra pass), so every tier gets the §10 look.
  const grade = useMemo(() => new WarmGradeEffect(), []);
  useEffect(() => () => grade.dispose(), [grade]);
  if (!enabled) return null;
  // EffectComposer turns off renderer tone mapping, so ToneMapping must come last in every stack.
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {q.ssao ? (
        <N8AO aoRadius={1.6} distanceFalloff={1} intensity={2.2} quality="medium" halfRes />
      ) : (
        <></>
      )}
      {q.bloom ? (
        <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1} luminanceSmoothing={0.2} />
      ) : (
        <></>
      )}
      <primitive object={grade} dispose={null} />
      {q.colorGrading ? <HueSaturation saturation={0.06} /> : <></>}
      {q.colorGrading ? <BrightnessContrast contrast={0.06} /> : <></>}
      {q.colorGrading ? <Vignette offset={0.3} darkness={0.35} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {q.antialias === 'smaa' ? <SMAA /> : <FXAA />}
    </EffectComposer>
  );
}

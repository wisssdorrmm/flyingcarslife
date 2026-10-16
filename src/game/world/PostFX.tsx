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
import { ToneMappingMode } from 'postprocessing';
import { useSettings } from '../store/settings';

/** Post-processing stack per quality tier (CLAUDE.md §9). */
export function PostFX() {
  const q = useSettings((s) => s.quality);
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
      {q.colorGrading ? <HueSaturation saturation={0.06} /> : <></>}
      {q.colorGrading ? <BrightnessContrast contrast={0.06} /> : <></>}
      {q.colorGrading ? <Vignette offset={0.3} darkness={0.35} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {q.antialias === 'smaa' ? <SMAA /> : <FXAA />}
    </EffectComposer>
  );
}

import * as THREE from 'three';
import type { PlayerProfile } from './types';

/** Canvas-texture sprite with a player's name and title, shown above their head. */
export function makeNameTag(p: PlayerProfile): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  ctx.beginPath();
  ctx.roundRect(16, 8, 480, 112, 28);
  ctx.fill();
  ctx.fillStyle = p.color;
  ctx.fillRect(40, 102, 432, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 46px system-ui, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(p.name, 256, 50, 440);
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillStyle = p.color;
  ctx.fillText(p.title, 256, 86, 440);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }),
  );
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 5;
  return sprite;
}

/** Speech bubble sprite; call `setText` when a new chat line arrives. */
export function makeBubble(): { sprite: THREE.Sprite; setText: (text: string) => void } {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthWrite: false, toneMapped: false }),
  );
  sprite.scale.set(2.2, 0.69, 1);
  sprite.renderOrder = 6;
  sprite.visible = false;
  const setText = (text: string) => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 112, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(236, 120);
    ctx.lineTo(256, 150);
    ctx.lineTo(276, 120);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.font = '500 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Up to two lines.
    const words = text.split(' ');
    const lines: string[] = [''];
    for (const w of words) {
      const next = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
      if (ctx.measureText(next).width > 460 && lines.length < 2) lines.push(w);
      else lines[lines.length - 1] = next;
    }
    lines.forEach((l, i) => ctx.fillText(l, 256, lines.length === 1 ? 66 : 44 + i * 42, 470));
    tex.needsUpdate = true;
  };
  return { sprite, setText };
}

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { NET } from '../config';
import { useGame } from '../store/game';
import { useLife } from '../store/life';
import { currentPose } from '../store/nav';
import { useNet } from '../store/net';
import { profileIdOf, useSocial, type SocialAction } from '../store/social';
import { consumePress } from '../systems/input';
import { directListeners, remoteSnapshots } from './client';
import { perform } from './social';

/**
 * Finds the nearest player you can interact with (X opens the menu), and handles incoming social
 * requests and replies.
 */
export function SocialSystem() {
  const last = useRef(0);

  useEffect(() => {
    const onDirect = (m: Parameters<Parameters<typeof directListeners.add>[0]>[0]) => {
      if (m.topic !== 'social') return;
      const action = (m.data as { action?: SocialAction } | undefined)?.action;
      if (!action) return;
      const name = useNet.getState().players.find((p) => p.id === m.from)?.name ?? 'Someone';
      if (m.kind === 'request') {
        useSocial.getState().addIncoming({ from: m.from, name, action, at: performance.now() });
      } else if (m.kind === 'accept') {
        if (action === 'friend') {
          useSocial.getState().addFriend({ id: profileIdOf(m.from), name });
          useLife.getState().toast(`You and ${name} are now friends`);
        } else perform(m.from, action);
      } else if (m.kind === 'decline') {
        useLife.getState().toast(`${name} said no thanks`);
      }
    };
    directListeners.add(onDirect);
    return () => {
      directListeners.delete(onDirect);
    };
  }, []);

  useFrame(({ clock }) => {
    const social = useSocial.getState();
    // Expire old requests.
    const now = performance.now();
    for (const r of social.incoming) {
      if (now - r.at > NET.requestTimeout * 1000) social.removeIncoming(r.from, r.action);
    }
    if (clock.elapsedTime - last.current < 0.2) return;
    last.current = clock.elapsedTime;
    const pose = currentPose();
    const onFoot = useGame.getState().mode === 'onFoot';
    let best: string | null = null;
    let bestD: number = NET.interactRange;
    if (pose && onFoot) {
      for (const p of useNet.getState().players) {
        if (useNet.getState().blocked.has(p.id)) continue;
        const s = remoteSnapshots.get(p.id);
        const l = s?.[s.length - 1];
        if (!l || l.car) continue;
        const d = Math.hypot(l.x - pose.x, l.z - pose.z);
        if (d < bestD) {
          bestD = d;
          best = p.id;
        }
      }
    }
    social.setTarget(best);
    if (best && consumePress('social')) social.setPanelOpen(true);
    if (!best && social.panelOpen) social.setPanelOpen(false);
  });

  return null;
}

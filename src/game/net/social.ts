import { playEmote, playerState } from '../player/playerState';
import { useLife } from '../store/life';
import { useNet } from '../store/net';
import {
  profileIdOf,
  SOCIAL_EMOTE,
  SOCIAL_LABEL,
  useSocial,
  type SocialAction,
} from '../store/social';
import { remoteSnapshots, sendDirect } from './client';

/** Sends a social request (high five, hug, dance, friend) to another player. */
export function requestSocial(to: string, action: SocialAction): void {
  sendDirect({ to, topic: 'social', kind: 'request', data: { action } });
  const name = useNet.getState().players.find((p) => p.id === to)?.name ?? 'them';
  useLife.getState().toast(`Asked ${name} to ${SOCIAL_LABEL[action]}`);
}

/** Starts the shared moment for an accepted request: face each other and emote together. */
export function perform(partner: string, action: SocialAction): void {
  const snaps = remoteSnapshots.get(partner);
  const last = snaps?.[snaps.length - 1];
  if (last) playerState.faceToward = { x: last.x, z: last.z };
  const emote = SOCIAL_EMOTE[action];
  if (emote) window.setTimeout(() => playEmote(emote), 250);
}

export function respondSocial(from: string, action: SocialAction, accept: boolean): void {
  useSocial.getState().removeIncoming(from, action);
  sendDirect({ to: from, topic: 'social', kind: accept ? 'accept' : 'decline', data: { action } });
  if (!accept) return;
  const name = useNet.getState().players.find((p) => p.id === from)?.name ?? 'Friend';
  if (action === 'friend') {
    useSocial.getState().addFriend({ id: profileIdOf(from), name });
    useLife.getState().toast(`You and ${name} are now friends`);
  } else perform(from, action);
}

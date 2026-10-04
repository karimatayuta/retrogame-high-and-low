/**
 * Composition Root: the only place that wires concrete classes together
 * (crypto randomness + localStorage save + game session + presentation).
 *
 * Query parameters (debug / demo):
 *   ?autoplay=1    the bot plays by itself          ?seed=N     reproducible shuffles, nothing is saved
 *   ?scene=NAME    jump to a situation: win | standard | redblack | highlow | freegame | jackpot
 */
import { createGameSession, type GameSession } from '@/application/gameSession';
import { seededRandomizer } from '@/domain/random';
import { cryptoRandomizer } from '@/infrastructure/cryptoRandom';
import { LocalStorageSaveRepository, MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';
import { GameApp } from '@/presentation/app';
import { loadPrefs } from '@/presentation/prefs';
import { findScene, isSceneName } from '@/presentation/scenes';
import { createSoundBoard } from '@/presentation/sound';
import { registerSW } from 'virtual:pwa-register';

const params = new URLSearchParams(window.location.search);
const seedParam = params.get('seed');
const sceneParam = params.get('scene');
const autoplay = params.get('autoplay') === '1';

const memorySession = (seed: number): GameSession =>
  createGameSession({ rng: seededRandomizer(seed), saveRepository: new MemorySaveRepository() });

function fail(message: string): void {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = message;
}

async function main(): Promise<void> {
  let session: GameSession;
  let script;
  let botSeed = 1;
  if (isSceneName(sceneParam)) {
    const scene = findScene(sceneParam, memorySession);
    if (!scene) throw new Error(`no seed found for scene "${sceneParam}"`);
    session = memorySession(scene.seed);
    script = scene.script;
    botSeed = scene.seed;
  } else if (seedParam !== null || autoplay) {
    // reproducible / bot runs never touch the player's save
    botSeed = Number.parseInt(seedParam ?? '1', 10) || 1;
    session = memorySession(botSeed);
  } else {
    session = createGameSession({ rng: cryptoRandomizer(), saveRepository: new LocalStorageSaveRepository() });
  }

  const app = new GameApp({
    session,
    sound: createSoundBoard(),
    prefs: loadPrefs(),
    autoplay: autoplay ? { seed: botSeed } : null,
    ...(script ? { script } : {}),
  });
  await app.start(document.getElementById('app') as HTMLElement);
  document.getElementById('boot')?.remove();

  // Closing the page: settle pending wins / free games and save (D13). `pagehide` only: the page is
  // really going away (or into the back/forward cache), unlike `visibilitychange` which also fires
  // when the player just switches tabs mid-game.
  window.addEventListener('pagehide', () => app.handlePageHide());

  // PWA: cache the game for offline play (production builds only; dev keeps hot reload simple).
  if (import.meta.env.PROD) registerSW({ immediate: true });

  if (import.meta.env.DEV) {
    (window as unknown as { __twinjokers: unknown }).__twinjokers = { session, app, view: () => session.view() };
  }
}

main().catch((err: unknown) => {
  console.error(err);
  fail('SORRY - THE GAME COULD NOT START');
});

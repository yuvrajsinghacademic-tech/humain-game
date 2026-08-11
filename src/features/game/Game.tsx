'use client';

/**
 * The phase router.
 *
 * One switch over the state machine's phase, plus the three things true of every
 * screen: the dread level is pushed onto the document root so the CSS can degrade the
 * display with it, a polite live region announces each transition for screen readers,
 * and the audio controller is read (never created) so the music survives every screen
 * change here.
 *
 * No game rules live here.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { CornerMark, CrtLayers, Screen } from '@/components/Screen';
import { AssessmentScreen } from '@/features/calibration/AssessmentScreen';
import { Ending, EndingLoading } from '@/features/ending/Ending';
import { Booth } from '@/features/prediction/Booth';
import { getAudio, useAudio } from '@/lib/audio/useTrack';
import { glitchSeedFromLocation } from '@/lib/visual/useGlitch';
import { Boot } from './Boot';
import { ChoiceScreen } from './ChoiceScreen';
import { Consent } from './Consent';
import { Menu } from './Menu';
import { Opening } from './Opening';
import { ResultsTesting } from './ResultsTesting';
import { useGame } from './useGame';

const ANNOUNCEMENTS: Record<string, string> = {
  boot: 'Loading.',
  menu: 'hum(ai)n. Main menu.',
  consent: 'Before you start.',
  choice: 'Begin your assessment.',
  assessment_active: 'Question in progress.',
  results_testing: 'Testing your results.',
  booth_picking: 'Darry is picking his answer. Both machines are unavailable.',
  booth_ready: 'Darry has picked his answer. Both machines are available.',
  booth_result: 'Result.',
  ending_loading: 'Loading results.',
  ending: 'You will be replaced.',
};

export function Game() {
  const game = useGame();
  const { state, dread } = game;
  const audio = useAudio();
  // Seeded only when the test flag is on, so a capture run is reproducible.
  const glitchSeed = useMemo(() => glitchSeedFromLocation(), []);

  // Dread drives noise, scanline weight, red bleed and vignette. One writer.
  useEffect(() => {
    document.documentElement.style.setProperty('--dread', dread.toFixed(3));
  }, [dread]);

  /*
   * No per-phase audio work happens here. The static runs continuously from the menu
   * to the last round, and the only thing that ever changes is the controller's mode,
   * which the game hook sets at the three points where it changes.
   */
  const setMusicOn = useCallback((on: boolean) => {
    getAudio().setMuted(!on);
  }, []);

  const lastRound = state.rounds[state.rounds.length - 1];
  const announcement = useMemo(() => ANNOUNCEMENTS[state.phase] ?? '', [state.phase]);
  const inGame = state.phase !== 'boot' && state.phase !== 'menu' && state.phase !== 'consent';

  return (
    <>
      {/* The boot screen is bare black: no scanlines, no vignette, no wordmark. */}
      {state.phase === 'boot' ? null : <CrtLayers />}
      {inGame ? <CornerMark muted={audio.muted} onToggleAudio={() => setMusicOn(audio.muted)} /> : null}
      {renderPhase()}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );

  function renderPhase() {
    switch (state.phase) {
      case 'boot':
        return <Boot onEnter={game.enterMenu} />;

      case 'menu':
        return <Menu onPlay={game.openConsent} musicOn={!audio.muted} onMusicChange={setMusicOn} />;

      case 'consent':
        return (
          <>
            {/*
              The menu stays behind the warning, so BACK returns to a title screen that
              was never torn down — and the static keeps running underneath.
            */}
            <Menu onPlay={game.openConsent} musicOn={!audio.muted} onMusicChange={setMusicOn} />
            <Consent onAccept={game.acceptConsent} onBack={game.closeConsent} seed={glitchSeed} />
          </>
        );

      case 'choice':
        return <ChoiceScreen onBegin={game.beginAssessment} onSkip={game.skipAssessment} busy={false} />;

      case 'assessment_active':
        return (
          <Screen>
            {game.currentQuestion && state.plan ? (
              <AssessmentScreen
                trial={game.currentQuestion}
                index={state.questionIndex}
                total={state.plan.trials.length}
                seed={state.seed}
                onResolve={game.resolveQuestion}
                onCommit={game.commitQuestion}
                onSound={() => undefined}
              />
            ) : null}
          </Screen>
        );

      case 'results_testing':
        return <ResultsTesting ready={state.resultsReady} onPlay={game.enterBooth} />;

      case 'booth_picking':
      case 'booth_ready':
      case 'booth_result':
        return (
          <Screen>
            <Booth
              round={state.round}
              picking={state.phase === 'booth_picking'}
              sealed={state.ticket !== null}
              reveal={state.reveal}
              choice={state.phase === 'booth_result' && lastRound ? lastRound.choice : null}
              lastWin={state.phase === 'booth_result' && lastRound ? lastRound.win : null}
              coins={game.coins}
              onPull={game.pull}
              onNext={game.nextRound}
            />
          </Screen>
        );

      case 'ending_loading':
        return <EndingLoading />;

      case 'ending':
        return <Ending rounds={state.rounds} report={state.debrief} onPlayAgain={game.playAgain} />;

      default:
        return null;
    }
  }
}

// The old opening is retained as an export so the heavier glitch repertoire it
// exercises stays reachable, and so removing it is a deliberate act rather than a
// side effect of this pass.
export { Opening };

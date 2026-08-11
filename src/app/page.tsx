import { Game } from '@/features/game/Game';

/**
 * The single route. Everything interactive is a client component below this
 * point; nothing on this page reads a secret or touches the model.
 */
export default function Page() {
  return <Game />;
}
